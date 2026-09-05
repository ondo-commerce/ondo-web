import type { ReactNode } from "react";
import { DETAIL_TEXT } from "../constants";
import {
  backorderCount,
  formatWon,
  orderTotals,
  shipmentProgress,
  unpaidAmount,
} from "../derive";
import type { OrderRecord } from "../types";

/**
 * 요약 카드 한 장. 보조 글자(`.s`)가 `secondary-foreground`(gray-600)다 —
 * 기본 `muted-foreground`(gray-500)는 회색 면 위에서 4.39:1로 AA에 못 미친다
 * (셸 회차 F1). 여기는 흰 면이지만 같은 값으로 맞춰 둔다.
 */
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="border-border rounded-control border px-4 py-3.5">
      <p className="text-muted-foreground text-body">{label}</p>
      <p className="mt-1.5 text-[22px]/[30px] font-medium tabular-nums">
        {value}
      </p>
      {sub ? (
        <p className="text-secondary-foreground mt-1 text-xs">{sub}</p>
      ) : null}
    </div>
  );
}

/**
 * 요약 3장 — 주문 금액 · 출고 진행 · 미수 잔액.
 *
 * 세 값이 전부 `derive.ts`에서 나온다. 특히 **주문 금액은 표 `<tfoot>`의 합계와
 * 같은 함수**를 부른다 — 원본은 요약이 517,000원인데 행 합이 618,000원이었다.
 *
 * 미수는 **출고된 건의 금액 합**이다(RT-64). 장끼 품목에 단가가 없어(스펙) 주문
 * 라인에서 찾아 채우는데, 못 찾은 장끼가 있으면 `—`로 그린다 — 틀린 숫자를 맞는
 * 것처럼 세우지 않는다.
 */
export function OrderStats({ order }: { order: OrderRecord }) {
  const totals = orderTotals(order);
  const progress = shipmentProgress(order);
  const backorders = backorderCount(order);
  const unpaid = unpaidAmount(order);

  return (
    <div className="grid grid-cols-3 gap-2 phone:grid-cols-1">
      <Stat label={DETAIL_TEXT.stats.amount} value={formatWon(totals.amount)} />
      <Stat
        label={DETAIL_TEXT.stats.progress}
        value={
          progress.planned === 0
            ? "—"
            : `${progress.planned}건 중 ${progress.done}건`
        }
        sub={
          backorders > 0 ? DETAIL_TEXT.backorderWaiting(backorders) : undefined
        }
      />
      <Stat
        label={DETAIL_TEXT.stats.unpaid}
        value={unpaid === null ? "—" : formatWon(unpaid)}
        sub={
          unpaid === null
            ? DETAIL_TEXT.unpaidUnknown
            : order.shipments.length > 0
              ? DETAIL_TEXT.unpaidFrom(order.shipments.length)
              : undefined
        }
      />
    </div>
  );
}
