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
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `router.refresh()`로 Server Component(목록 ·
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
 * 행 하나(X)도 `선택 삭제`도 이 하나를 쓴다 — 일괄 API가 없어 id마다 DELETE를
 * 보낸다. 하나라도 실패하면 전체가 실패로 돌아오지만, 이미 나간 DELETE는
 * 취소되지 않는다 — refresh가 실제로 남은 것을 보여 준다.
 */
export function useRemoveCartItemsMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.remove(),
    mutationFn: async (cartItemIds: readonly number[]) => {
      await Promise.all(cartItemIds.map(removeItem));
    },
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
 */
export function useRestoreCartItemsMutation() {
  const router = useRouter();
  return useMutation({
    mutationKey: cartKeys.add(),
    mutationFn: async (items: readonly AddCartItemRequest[]) => {
      await Promise.all(items.map(addItem));
    },
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
