"use client";

import { Panel } from "@ondo/ui";
import { useSkuBackordersQuery } from "../api/queries";
import { EMPTY_MARK } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 상단 — 펼친 SKU 하나의 미송 규모. **탭 전체 합계가 아니다.**
 *
 * 이 카드는 아무것도 계산하지 않는다. 8지표를 전부 서버 `stats`(→ `derive.toSummary`)로 받는다 —
 * `총 미송 수량`은 좌측 목록과, `가용재고`는 카운터 바와 같은 값이어야 하는데
 * 여기서 다시 세면 그 보증이 카드 하나 때문에 깨진다.
 *
 * 제목 옆에 SKU를 붙인다 — 검색으로 좌측 행이 가려지거나 가로로 굴렸을 때 "어느 SKU의 요약인지"가
 * 우측 어디에도 없었다(F4).
 *
 * `Panel`은 부르는 쪽(`BackorderListView`)이 그린다 — 경계(`QueryBoundary`)가 패널 안에
 * 들어가야 기다리는 동안에도 우측 폭이 유지되기 때문이다. 펼친 행과 같은 queryKey라 한 번만 받는다.
 */
export function BackorderSummaryCard({ variantId }: { variantId: number }) {
  const { data } = useSkuBackordersQuery(variantId);
  const { summary } = data;

  return (
    <>
      <Panel.Title
        action={
          <span className="text-muted-foreground text-sm tabular-nums">
            SKU {summary.sku}
          </span>
        }
      >
        미송 요약
      </Panel.Title>

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
    </>
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
