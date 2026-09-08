"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { orderKeys } from "./keys";
import { ORDER_PATH } from "./queries";
import { isStaleRejection } from "../derive";
import type {
  OrderConfirmRequest,
  OrderDetail,
  PackingCreated,
  PackingCreateRequest,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`의 팩토리로 무효화한다 — 목록·칩·상세·포장 대기열이
 * 같은 주문을 보고 있어서, 한쪽만 갱신하면 행은 신규인데 카드는 확정이 된다.
 *
 * 확정·취소 응답은 **상세와 같은 스키마**다(스펙: "재조회 없이 화면을 갱신한다").
 * 그래서 상세 캐시에 wire 그대로 심는다 — `useOrderDetailQuery`의 `select`가 읽을 때
 * 뷰로 바꾼다. 여기서 먼저 뷰로 바꿔 넣으면 `select`가 뷰를 한 번 더 변환해 값이 깨진다.
 *
 * **409·404로 거절됐을 때는 상세까지 다시 부른다.** 화면이 든 값이 서버와 어긋난 것이라(다른 창에서
 * 먼저 확정·출고) 다시 불러오지 않으면 배지·버튼·`isCancellable`이 옛것으로 남아 같은 버튼을 눌러
 * 같은 거절을 본다(F3 · wire-shipment F6, #198). 입력값은 지우지 않는다 — 서버 상태를 보고 사장이 정한다.
 */

/**
 * `onDone`은 **훅 옵션**으로 받는다. `mutate(vars, { onSuccess })`로 넘기면 안 된다 —
 * 확정 응답을 캐시에 심는 순간 버튼 줄(`OrderActionBar`)이 언마운트되고, TanStack v5는
 * 언마운트된 컴포넌트의 호출별 콜백을 건너뛴다. 훅 옵션의 콜백은 뮤테이션 자체에 붙어 늘 돈다.
 */
export interface MutationDone {
  onDone?: () => void;
}

export function useConfirmOrderMutation(
  orderId: number,
  { onDone }: MutationDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderConfirmRequest) =>
      apiFetch<OrderDetail>(ORDER_PATH.confirm(orderId), {
        method: "POST",
        body,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(orderKeys.detail(orderId), detail);
      onDone?.();
      return invalidateAround(queryClient, orderId);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateWithDetail(queryClient, orderId)
        : undefined,
  });
}

export function useCancelOrderMutation(
  orderId: number,
  { onDone }: MutationDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<OrderDetail>(ORDER_PATH.cancel(orderId), { method: "POST" }),
    onSuccess: (detail) => {
      queryClient.setQueryData(orderKeys.detail(orderId), detail);
      onDone?.();
      return invalidateAround(queryClient, orderId);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateWithDetail(queryClient, orderId)
        : undefined,
  });
}

/**
 * 포장 준비. 응답(`PackingCreatedResponse`)에는 `isCancellable`이 없어 대기열 캐시에
 * 심을 수 없다 — 상세(출고진행이 바뀐다)와 대기열을 같이 다시 부른다.
 */
export function useCreatePackingMutation(
  orderId: number,
  { onDone }: MutationDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PackingCreateRequest) =>
      apiFetch<PackingCreated>(ORDER_PATH.packings(orderId), {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      onDone?.();
      return invalidateWithDetail(queryClient, orderId);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateWithDetail(queryClient, orderId)
        : undefined,
  });
}

/**
 * 배분 취소(카드 통째). 204라 응답이 없다 — 서버가 출고진행·미송을 되돌리므로
 * 상세도 같이 다시 부른다. `orderId`는 요청에 안 실리지만 무효화할 상세를 가리키려고 받는다.
 */
export function useCancelPackingMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packingId: number) =>
      apiFetch<void>(ORDER_PATH.packing(packingId), { method: "DELETE" }),
    onSuccess: () => invalidateWithDetail(queryClient, orderId),
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateWithDetail(queryClient, orderId)
        : undefined,
  });
}

/** 상세까지 같이 — 응답을 심을 수 없거나(204·포장 응답) 서버 상태를 모를 때(409·404) */
function invalidateWithDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: number,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) }),
    invalidateAround(queryClient, orderId),
  ]);
}

/**
 * 주문 하나가 바뀌면 같이 낡는 것들 — 목록(상태·금액), 칩 건수, 그 주문의 포장 대기열.
 * 상세는 부르는 쪽이 정한다(응답을 심을지, 다시 부를지).
 */
function invalidateAround(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: number,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: orderKeys.filters() }),
    queryClient.invalidateQueries({ queryKey: orderKeys.packings(orderId) }),
  ]);
}
