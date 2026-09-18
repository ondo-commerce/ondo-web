"use client";

import { Panel } from "@ondo/ui";
import { useDashboardSummaryQuery } from "../api/queries";
import { TODAY_TEXT } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/**
 * 오늘 — 주문 건수·금액 / 출고 봉투·장수 / 취소. 확인만 하면 되는 숫자라 우측이다.
 *
 * 제목 옆 날짜는 **영업일**이다(낮 12시 경계). 새벽 2시에 보면 달력은 내일이지만 여기는 어제 날짜다 —
 * 서버 `today`가 그 경계로 집계한 값이라 날짜도 같은 기준으로 붙여야 숫자와 맞는다.
 * 제목 우측의 "마지막 HH:MM"은 서버 `now`다 — 폴링이 도는지 사장이 알 수 있는 유일한 표식이다.
 */
export function TodayPanel() {
  const { data } = useDashboardSummaryQuery();
  const today = data.today;

  return (
    <>
      <Panel.Title
        className="mb-4"
        suffix={
          <span className="text-muted-foreground text-sm tabular-nums">
            {today.dateLabel}
          </span>
        }
        action={
          <span className="text-muted-foreground text-xs tabular-nums">
            {TODAY_TEXT.refresh} · {TODAY_TEXT.lastPrefix}{" "}
            {today.updatedAtLabel}
          </span>
        }
      >
        {TODAY_TEXT.title}
      </Panel.Title>

      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">{TODAY_TEXT.orders}</dt>
          <dd className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-2xl font-semibold">
              {formatNumber(today.orderCount)}
            </span>
            <span className="text-sm">건</span>
            <span className="text-muted-foreground text-sm">
              · {formatNumber(today.orderAmount)}원
            </span>
          </dd>
          <dd className="text-muted-foreground text-sm tabular-nums">
            {TODAY_TEXT.cancelled} {formatNumber(today.cancelled)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">
            {TODAY_TEXT.shipped}
          </dt>
          <dd className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-2xl font-semibold">
              {formatNumber(today.shippedCount)}
            </span>
            <span className="text-sm">봉투</span>
            <span className="text-muted-foreground text-sm">
              · {formatNumber(today.shippedQty)}장
            </span>
          </dd>
        </div>
      </dl>
    </>
  );
}
