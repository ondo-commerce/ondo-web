"use client";

import { Panel } from "@ondo/ui";
import { PackingBatchCard } from "./PackingBatchCard";
import type { Order } from "../types";

/**
 * 우측 두 번째 카드 — 포장 대기열.
 *
 * **최신 회차가 맨 위다**(Figma 부분 출고 프레임: #3 → #2 → #1).
 * 방금 만든 회차를 바로 확인하고 잘못 담았으면 그 자리에서 지우는 순서다.
 * 배열 자체는 만든 순서(오름차순)로 두고 그리는 쪽에서만 뒤집는다.
 *
 * 회차가 하나도 없으면 이 카드를 부르지 않는다 — 빈 카드는 자리만 먹는다.
 */
export function PackingQueueCard({
  order,
  onRemoveBatch,
}: {
  order: Order;
  onRemoveBatch: (batchId: string) => void;
}) {
  return (
    <Panel className="min-h-0 flex-1">
      <Panel.Title>포장 대기열</Panel.Title>
      <Panel.Body className="flex flex-col gap-3">
        {[...order.batches].reverse().map((batch) => (
          <PackingBatchCard
            key={batch.id}
            batch={batch}
            onRemove={() => onRemoveBatch(batch.id)}
          />
        ))}
      </Panel.Body>
    </Panel>
  );
}
