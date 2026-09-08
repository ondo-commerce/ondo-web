"use client";

import { Panel } from "@ondo/ui";
import { PackingBatchCard } from "./PackingBatchCard";
import { useCancelPackingMutation } from "../api/mutations";
import { usePackingQueueQuery } from "../api/queries";
import { packingCancelErrorText } from "../derive";
import {
  QueryBoundary,
  QueryErrorView,
  QuerySkeleton,
} from "@/shared/api/QueryBoundary";

/**
 * 우측 두 번째 카드 — 포장 대기열(`GET /orders/{id}/packings`).
 *
 * **최신 회차가 맨 위다**(Figma 부분 출고 프레임: #3 → #2 → #1).
 * 방금 만든 회차를 바로 확인하고 잘못 담았으면 그 자리에서 지우는 순서다.
 * 배열은 만든 순서(오름차순)로 오고 그리는 쪽에서만 뒤집는다.
 *
 * 회차가 하나도 없으면 카드를 그리지 않는다 — 빈 카드는 자리만 먹는다.
 * 그래서 `Panel`이 경계 **안**에 있다(다른 패널과 반대): 받아 보기 전엔 카드가 있을지
 * 모른다. 기다리는 동안은 카드 모양의 스켈레톤을, 실패는 카드 모양의 에러 표면을 둔다 —
 * 패널 없는 맨 alert가 우측 바닥에 그려지면 `Panel이 화면의 유일한 표면` 규칙이 깨진다(F5).
 */
export function PackingQueueCard({ orderId }: { orderId: number }) {
  return (
    <QueryBoundary
      fallback={
        <Panel className="shrink-0">
          <QuerySkeleton />
        </Panel>
      }
      errorFallback={({ described, retry }) => (
        <Panel className="shrink-0">
          <Panel.Title>포장 대기열</Panel.Title>
          <QueryErrorView described={described} onRetry={retry} />
        </Panel>
      )}
    >
      <PackingQueueCardBody orderId={orderId} />
    </QueryBoundary>
  );
}

function PackingQueueCardBody({ orderId }: { orderId: number }) {
  const { data: batches } = usePackingQueueQuery(orderId);
  const cancel = useCancelPackingMutation(orderId);

  if (batches.length === 0) return null;

  return (
    <Panel className="min-h-0 flex-1">
      <Panel.Title>포장 대기열</Panel.Title>
      <Panel.Body className="flex flex-col gap-3">
        {cancel.error ? (
          <p role="alert" className="text-destructive-strong text-sm">
            {packingCancelErrorText(
              cancel.error,
              batches.find((b) => b.id === cancel.variables),
            )}
          </p>
        ) : null}
        {[...batches].reverse().map((batch) => (
          <PackingBatchCard
            key={batch.id}
            batch={batch}
            disabled={cancel.isPending}
            onRemove={() => cancel.mutate(batch.id)}
          />
        ))}
      </Panel.Body>
    </Panel>
  );
}
