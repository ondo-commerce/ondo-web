import { Panel } from "@ondo/ui";
import { EMPTY_MARK } from "../constants";
import type { BackorderSummary } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 상단 — 펼친 SKU 하나의 미송 규모. **탭 전체 합계가 아니다.**
 *
 * 이 카드는 아무것도 계산하지 않는다. 8지표를 전부 `summarize`가 만든 값으로 받는다 —
 * `총 미송 수량`은 좌측 목록과, `가용재고`는 카운터 바와 같은 값이어야 하는데
 * 여기서 다시 세면 그 보증이 카드 하나 때문에 깨진다.
 */
export function BackorderSummaryCard({
  summary,
}: {
  summary: BackorderSummary;
}) {
  return (
    <Panel className="shrink-0">
      <Panel.Title>미송 요약</Panel.Title>

      {/* 2열 4행. 왼쪽 열은 수량, 오른쪽 열은 날짜·금액이라 눈이 세로로 훑힌다 */}
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <Row label="총 미송 수량" value={formatNumber(summary.totalQty)} />
          <Row
            label="주문 건수"
            value={`${formatNumber(summary.orderCount)}건`}
          />
          <Row
            label="거래처 수"
            value={`${formatNumber(summary.customerCount)}곳`}
          />
          <Row label="가용재고" value={formatNumber(summary.assignable)} />
        </div>
        <div>
          <Row label="예상 입고일" value={summary.eta ?? EMPTY_MARK} />
          <Row
            label="최초 주문일"
            value={summary.firstOrderedDate ?? EMPTY_MARK}
          />
          <Row
            label="최근 주문일"
            value={summary.lastOrderedDate ?? EMPTY_MARK}
          />
          <Row
            label="미송 총액"
            value={`₩${formatNumber(summary.totalAmount)}`}
          />
        </div>
      </div>
    </Panel>
  );
}

/** 라벨-값 한 줄. 좌우 두 열의 높이를 맞춰야 4행이 나란히 읽힌다 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="truncate text-sm tabular-nums">{value}</span>
    </div>
  );
}
