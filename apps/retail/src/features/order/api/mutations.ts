"use client";

import { useIsMutating, useMutation } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { orderKeys } from "./keys";
import { ORDER_API_PATH } from "../constants";
import type {
  CancelOrderRequest,
  CancelOrderResult,
  PlaceOrderRequest,
  PlaceOrderResult,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공 뒤 화면을 바꾸는 일(`router.replace` · `router.refresh`)은
 * 부르는 쪽이 한다 — 접수는 다른 화면으로 가고 취소는 같은 화면을 다시 그려서,
 * 여기서 한 가지로 정하면 한쪽이 틀린다.
 *
 * ⚠️ BE가 껍데기다(`MockOrderData`). 두 요청 다 보낸 내용과 무관한 고정값이 온다 —
 * 접수는 늘 `orderId 5012`(무드온 접수 · 라온 안 됨), 취소는 늘 `88219` 취소 ·
 * `88213` 확정돼서 못 함. 부분 접수·부분 취소 분기는 W3에서 다시 본다(`04-wire.md` §3).
 */

/**
 * `POST /orders`. **`Idempotency-Key`를 같이 보낸다** — 주문서를 열 때 한 번 만든
 * 키라 `주문 접수하기`가 연타되거나 실패 뒤 다시 눌려도 서버가 같은 주문을 두 번
 * 만들지 않는다(스펙: 같은 키로 다시 오면 처음 결과를 돌려준다).
 *
 * 일부만 접수돼도 201이다(스펙). 부분 성공은 에러가 아니라 결과라 여기서 갈라
 * 던지지 않는다 — `results[]`를 화면이 읽는다.
 */
function placeOrder(input: {
  body: PlaceOrderRequest;
  idempotencyKey: string;
}): Promise<PlaceOrderResult> {
  return apiFetch<PlaceOrderResult>(ORDER_API_PATH.orders, {
    method: "POST",
    body: input.body,
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * `POST /orders/{orderId}/cancel`. 도매처별로 취소된다 — 통째 취소는 없다(스펙).
 * 일부만 취소돼도 200이고 `results[]`에 된 것과 안 된 것이 섞여 온다.
 */
function cancelOrder(input: {
  orderId: number;
  wholesaleOrderIds: readonly number[];
}): Promise<CancelOrderResult> {
  const body: CancelOrderRequest = {
    wholesaleOrderIds: [...input.wholesaleOrderIds],
  };
  return apiFetch<CancelOrderResult>(ORDER_API_PATH.cancel(input.orderId), {
    method: "POST",
    body,
  });
}

export function usePlaceOrderMutation() {
  return useMutation({
    mutationKey: orderKeys.place(),
    mutationFn: placeOrder,
  });
}

export function useCancelOrderMutation() {
  return useMutation({
    mutationKey: orderKeys.cancel(),
    mutationFn: cancelOrder,
  });
}

/** 주문을 바꾸는 요청이 나가 있는가. 되돌릴 수 없는 버튼을 잠그는 데 쓴다 */
export function useOrderBusy(): boolean {
  return useIsMutating({ mutationKey: orderKeys.all }) > 0;
}

/**
 * 실패를 사장이 읽을 한 줄로. 서버가 준 말(`입력한 내용을 다시 확인해주세요`)이
 * 있으면 그대로 쓴다 — 이 feature의 path가 적은 코드는 `VALIDATION_FAILED` ·
 * `UNAUTHORIZED` · `ACCOUNT_NOT_APPROVED` · `INTERNAL_ERROR`뿐이라 코드별로 갈라
 * 그릴 것이 없다. 401은 `providers.tsx`가 먼저 잡아 `/login`으로 보낸다.
 */
export function describeOrderError(error: unknown, fallback: string): string {
  if (isApiError(error) && error.message !== "") return error.message;
  return fallback;
}
