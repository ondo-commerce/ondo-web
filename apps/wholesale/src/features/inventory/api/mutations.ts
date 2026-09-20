"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { inventoryKeys } from "./keys";
import { INVENTORY_PATH } from "./queries";
import { isStaleRejection } from "../derive";
import type { InboundCreated, InboundCreateRequest } from "../types";
import { productKeys } from "@/shared/api/product";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`·`productKeys`로 무효화한다 — 좌측 표·우측 카드·
 * 변동 이력이 같은 SKU를 보고 있어서, 한쪽만 갱신하면 표는 40인데 카드는 90이 된다.
 *
 * 응답은 캐시에 심지 않는다 — 입고 응답(로트 목록)은 이 화면의 어느 쿼리와도 모양이 다르고,
 * 재고 수량은 상품 상세를 통째로 다시 받는 편이 안전하다(평균원가까지 같이 온다).
 *
 * **409·404로 거절됐을 때도 같은 무효화를 한다.** 화면이 든 값이 서버와 어긋난 것이라
 * 다시 불러오지 않으면 같은 버튼을 눌러 같은 거절을 본다(wire-order F3 · wire-backorder F1).
 */

/**
 * `onDone`은 **훅 옵션**으로 받는다. `mutate(vars, { onSuccess })`로 넘기면 안 된다 —
 * 무효화로 우측 카드가 다시 그려질 때 TanStack v5는 언마운트된 컴포넌트의 호출별 콜백을
 * 건너뛴다. 훅 옵션의 콜백은 뮤테이션 자체에 붙어 늘 돈다.
 */
export interface InboundDone {
  onDone?: (created: InboundCreated) => void;
}

/**
 * 입고 등록. `Idempotency-Key`는 **요청마다 새로** 만든다 — 같은 입력을 두 번 처리하면
 * 두 번 입고돼야 맞고(다른 로트), 같은 요청의 재전송(네트워크 재시도)만 한 번으로 접어야 한다.
 * 뮤테이션 `retry`는 꺼져 있어(providers) 지금은 키 하나에 요청 하나다.
 */
export function useInboundMutation(
  productId: number,
  { onDone }: InboundDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InboundCreateRequest) =>
      apiFetch<InboundCreated>(INVENTORY_PATH.inbounds, {
        method: "POST",
        body,
        idempotencyKey: crypto.randomUUID(),
      }),
    // 반환한 promise를 TanStack이 기다린다 — `isSuccess`는 재조회가 **끝난 뒤**에 켜진다.
    // 재조회가 실패해도 여기서 던지지 않는다(invalidateQueries는 throwOnError가 꺼져 있다):
    // 던지면 입고가 거절된 것처럼 보여 사장이 한 번 더 누른다. 실패 신호는 상세 쿼리의
    // `isRefetchError`로 카드가 낸다(`derive.inboundNotice`).
    onSuccess: (created, body) => {
      onDone?.(created);
      return invalidateStock(queryClient, productId, variantIdsOf(body));
    },
    onError: (error, body) =>
      isStaleRejection(error)
        ? invalidateStock(queryClient, productId, variantIdsOf(body))
        : undefined,
  });
}

/**
 * 입고 뒤 재조회가 실패했을 때 `다시 불러오기`가 부른다 — 뮤테이션과 **같은 무효화**다.
 * 상세만 다시 부르면 이력은 옛 줄로 남으니 둘을 같이 비운다.
 */
export function useStockRefresh(productId: number) {
  const queryClient = useQueryClient();
  return (variantIds: readonly number[]) =>
    invalidateStock(queryClient, productId, variantIds);
}

function variantIdsOf(body: InboundCreateRequest): number[] {
  return (body.items ?? []).map((item) => item.variantId);
}

/** SKU 재고가 바뀌면 같이 낡는 것들 — 그 상품의 상세(수량·평균원가)와 바뀐 SKU들의 이력 */
function invalidateStock(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: number,
  variantIds: readonly number[],
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) }),
    ...variantIds.map((variantId) =>
      queryClient.invalidateQueries({
        queryKey: inventoryKeys.movementsOf(variantId),
      }),
    ),
  ]);
}
