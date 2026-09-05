"use client";

import { useIsMutating, useMutation } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { cartKeys } from "./keys";
import { CART_PATH } from "./paths";
import { CART_ACTION_FAILED, QTY_SAVE_DELAY_MS } from "../constants";
import type {
  AddCartItemRequest,
  AddCartItemResult,
  ChangeQtyRequest,
  ChangeQtyResult,
  RemovedLine,
} from "../types";

/**
 * 쓰기는 전부 여기. 끝나면 `router.refresh()`로 Server Component(목록 ·
 * 레이아웃의 뱃지)를 다시 그린다 — 소매에는 무효화할 클라이언트 쿼리가 없다.
 *
 * 응답(`ChangeQtyResponse.lineAmount` · `AddCartItemResponse.count`)은 쓰지 않는다.
 * refresh가 같은 값을 서버에서 다시 가져오고, 화면의 합계는 칸에 치는 중인
 * 수량까지 따라가야 해서 어차피 `derive.ts`가 다시 센다.
 */

function changeQty(input: {
  cartItemId: number;
  qty: number;
}): Promise<ChangeQtyResult> {
  const body: ChangeQtyRequest = { qty: input.qty };
  return apiFetch<ChangeQtyResult>(CART_PATH.item(input.cartItemId), {
    method: "PATCH",
    body,
  });
}

/** 없는 id여도 204다(스펙) — 두 번 눌려도 같은 답이 온다 */
function removeItem(cartItemId: number): Promise<void> {
  return apiFetch<void>(CART_PATH.item(cartItemId), { method: "DELETE" });
}

/** 같은 SKU를 다시 담으면 수량이 더해진다(스펙) */
function addItem(body: AddCartItemRequest): Promise<AddCartItemResult> {
  return apiFetch<AddCartItemResult>(CART_PATH.items, {
    method: "POST",
    body,
  });
}

export function useChangeQtyMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.qty(),
    mutationFn: changeQty,
    onSuccess: () => router.refresh(),
  });
}

/**
 * 줄마다 따로 나간 요청 묶음의 결과. 일괄 API가 없어 `선택 삭제`·`되돌리기`는
 * N번을 보내는데, 그중 몇 개만 서버가 받을 수 있다 — 이미 나간 요청은 취소되지
 * 않으므로 **성공분과 실패분을 갈라서 돌려준다.** 전체를 한 덩어리로 reject하면
 * 화면이 "못 바꿨어요"라고 말하는 사이 절반은 이미 사라져 있다.
 */
export interface BatchResult<TInput> {
  /** 서버가 받아 준 것. 보낸 순서다 */
  done: readonly TInput[];
  /** 거절됐거나 못 닿은 것과 그 이유. 보낸 순서다 */
  failed: readonly { input: TInput; error: unknown }[];
}

/** 전부 보내고 끝까지 기다린다. reject하지 않는다 — 부분 성공은 실패가 아니라 결과다 */
async function sendEach<TInput>(
  inputs: readonly TInput[],
  send: (input: TInput) => Promise<unknown>,
): Promise<BatchResult<TInput>> {
  const settled = await Promise.allSettled(inputs.map(send));
  const done: TInput[] = [];
  const failed: { input: TInput; error: unknown }[] = [];
  inputs.forEach((input, index) => {
    const result = settled[index];
    /* noUncheckedIndexedAccess: 같은 길이라 늘 있지만 타입은 undefined다. 없으면
       못 보낸 것으로 친다 — 성공으로 세는 것보다 안전하다 */
    if (result === undefined || result.status === "rejected") {
      failed.push({ input, error: result?.reason });
      return;
    }
    done.push(input);
  });
  return { done, failed };
}

/**
 * 행 하나(X)도 `선택 삭제`도 이 하나를 쓴다 — 일괄 API가 없어 id마다 DELETE를
 * 보낸다. **결과는 `BatchResult`로 오고 mutation 자체는 reject하지 않는다.**
 * 그래서 몇 개가 실패해도 `onSuccess`의 refresh가 돌아 서버에 실제로 남은 것을
 * 그린다 — 지워진 줄이 화면에 남아 사장이 한 번 더 누르는 일이 없다.
 */
export function useRemoveCartItemsMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.remove(),
    mutationFn: (cartItemIds: readonly number[]) =>
      sendEach(cartItemIds, removeItem),
    onSuccess: () => router.refresh(),
  });
}

/**
 * 상품 상세의 `장바구니 담기`가 부를 것. **이 회차는 만들어 export만 한다** —
 * 상세 화면이 `variantId`를 아직 fixtures에서 읽고 있어 연결은 #163 몫이다.
 */
export function useAddCartItemMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.add(),
    mutationFn: addItem,
    onSuccess: () => router.refresh(),
  });
}

/**
 * `되돌리기`. 서버에 되돌리기 API가 없어서 **뺀 것을 다시 담는다** — 그래서
 * 원래 자리로는 안 돌아오고(서버 순서) 새 `cartItemId`가 붙는다.
 *
 * 입력이 `RemovedLine`(버퍼의 줄)인 이유: 부분 성공 뒤 부르는 쪽이 **담긴 줄만
 * 버퍼에서 빼야** 재시도가 같은 SKU를 두 번 담지 않는다(서버는 합산). 요청 body에는
 * `variantId`·`qty`만 싣는다.
 */
export function useRestoreCartItemsMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.add(),
    mutationFn: (lines: readonly RemovedLine[]) =>
      sendEach(lines, ({ variantId, qty }) => addItem({ variantId, qty })),
    onSuccess: () => router.refresh(),
  });
}

/** 장바구니를 바꾸는 요청이 하나라도 나가 있는가. 되돌릴 수 없는 버튼을 잠그는 데 쓴다 */
export function useCartBusy(): boolean {
  return useIsMutating({ mutationKey: cartKeys.all }) > 0;
}

/**
 * 수량 칸 저장기. 글자가 바뀔 때마다 부르되 **`QTY_SAVE_DELAY_MS` 안에 또 바뀌면
 * 앞 요청은 안 나간다** — `1` → `10`을 치는 사이에 `qty=1`이 먼저 저장되고
 * `qty=10`이 늦게 도착하는 순서 뒤집힘을 막는다. 행마다 타이머가 따로다.
 *
 * 화면을 떠날 때 기다리던 저장은 **버리지 않고 바로 보낸다.** 사장이 수량을 고치고
 * 곧장 `주문하기`를 누르면 마지막 글자가 서버에 못 닿은 채 주문서로 가기 때문이다.
 */
export function useQtySaver(callbacks: {
  onFailed: (lineId: string, error: unknown) => void;
}) {
  const { mutate } = useChangeQtyMutation();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(
    new Map<string, { cartItemId: number; qty: number }>(),
  );
  /* 콜백이 렌더마다 새 함수여도 저장기는 같은 함수로 남게 ref로 받는다.
     렌더 중에 ref를 쓰지 않고(react-hooks/refs) 커밋 뒤에 최신 것으로 바꾼다 */
  const onFailed = useRef(callbacks.onFailed);
  useEffect(() => {
    onFailed.current = callbacks.onFailed;
  });

  const send = useCallback(
    (lineId: string) => {
      const input = pending.current.get(lineId);
      pending.current.delete(lineId);
      timers.current.delete(lineId);
      if (!input) return;
      mutate(input, {
        onError: (error) => onFailed.current(lineId, error),
      });
    },
    [mutate],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const [lineId, timer] of activeTimers) {
        clearTimeout(timer);
        send(lineId);
      }
    };
  }, [send]);

  return useCallback(
    (lineId: string, input: { cartItemId: number; qty: number }) => {
      const previous = timers.current.get(lineId);
      if (previous) clearTimeout(previous);
      pending.current.set(lineId, input);
      timers.current.set(
        lineId,
        setTimeout(() => send(lineId), QTY_SAVE_DELAY_MS),
      );
    },
    [send],
  );
}

/**
 * 실패를 사장이 읽을 한 줄로. 서버가 준 말(`잠시 후 다시 시도해주세요`)이 있으면
 * 그대로 쓴다 — 코드별로 갈라 그릴 만큼 이 feature의 에러 코드가 다양하지 않다
 * (스냅샷: `VALIDATION_FAILED` · `UNAUTHORIZED` · `ACCOUNT_NOT_APPROVED` ·
 * `INTERNAL_ERROR`). 401은 `providers.tsx`가 먼저 잡아 `/login`으로 보낸다.
 */
export function describeCartError(error: unknown): string {
  if (isApiError(error) && error.message !== "") return error.message;
  return CART_ACTION_FAILED;
}

/**
 * 묶음 요청의 실패를 한 줄로. null이면 전부 됐다.
 * 전부 실패면 서버가 준 말(`describeCartError`)을 그대로 쓰고, **일부만 실패면
 * 몇 개 중 몇 개인지를 말한다** — 부르는 쪽이 문구 함수를 넘긴다(지우기·되돌리기가
 * 다른 말을 한다).
 */
export function describeBatchFailure(
  result: BatchResult<unknown>,
  partialText: (total: number, failed: number) => string,
): string | null {
  const first = result.failed[0];
  if (first === undefined) return null;
  if (result.done.length === 0) return describeCartError(first.error);
  return partialText(
    result.done.length + result.failed.length,
    result.failed.length,
  );
}
