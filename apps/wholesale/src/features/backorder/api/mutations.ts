"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { backorderKeys } from "./keys";
import { BACKORDER_PATH } from "./queries";
import { isStaleRejection } from "../derive";
import type {
  AllocationBatch,
  AllocationRequest,
  ExpectedInbound,
  ExpectedInboundRequest,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`의 팩토리로 무효화한다 — 좌측 목록·펼침 행·카운터·
 * 우측 요약이 같은 SKU를 보고 있어서, 한쪽만 갱신하면 목록은 90인데 요약은 55가 된다.
 *
 * 두 응답 다 캐시에 심지 않는다 — 배분 응답은 포장 카드(주문 탭 몫)라 이 화면의 쿼리와 모양이
 * 다르고, 예상 입고일 응답은 펼침의 `stats` 안에 박힌 값이라 통째로 다시 받는 편이 안전하다.
 *
 * **409·404로 거절됐을 때도 같은 무효화를 한다.** 화면이 든 값이 서버와 어긋난 것이라(다른 창에서
 * 먼저 배분) 다시 불러오지 않으면 행·카운터가 옛것으로 남아 같은 버튼을 눌러 같은 거절을 본다(F1, #198).
 * 입력(`draft`)은 지우지 않는다 — 새 잔여·가용재고 기준으로 `normalizeDraft`가 다시 자른다.
 */

/**
 * `onDone`은 **훅 옵션**으로 받는다. `mutate(vars, { onSuccess })`로 넘기면 안 된다 —
 * 무효화로 행이 목록에서 빠지면 확정 버튼 줄이 언마운트되고, TanStack v5는 언마운트된
 * 컴포넌트의 호출별 콜백을 건너뛴다. 훅 옵션의 콜백은 뮤테이션 자체에 붙어 늘 돈다.
 */
export interface AllocationDone {
  /** 응답의 `resolvedBackorderIds`로 아코디언을 닫을지 정하는 자리 */
  onDone?: (batch: AllocationBatch) => void;
}

export function useAllocateMutation(
  variantId: number,
  { onDone }: AllocationDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AllocationRequest) =>
      apiFetch<AllocationBatch>(BACKORDER_PATH.allocations, {
        method: "POST",
        body,
      }),
    onSuccess: (batch) => {
      onDone?.(batch);
      return invalidateSku(queryClient, variantId);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateSku(queryClient, variantId)
        : undefined,
  });
}

export interface ExpectedInboundDone {
  onDone?: () => void;
}

export function useExpectedInboundMutation(
  variantId: number,
  { onDone }: ExpectedInboundDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedInboundRequest) =>
      apiFetch<ExpectedInbound>(BACKORDER_PATH.expectedInbound(variantId), {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      onDone?.();
      return invalidateSku(queryClient, variantId);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? invalidateSku(queryClient, variantId)
        : undefined,
  });
}

/** SKU 하나가 바뀌면 같이 낡는 것들 — 목록(총 미송·예상 입고일·SKU 유무)과 그 SKU의 펼침 */
function invalidateSku(
  queryClient: ReturnType<typeof useQueryClient>,
  variantId: number,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: backorderKeys.lists() }),
    queryClient.invalidateQueries({
      queryKey: backorderKeys.detail(variantId),
    }),
  ]);
}
