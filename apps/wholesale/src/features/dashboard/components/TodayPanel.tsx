"use client";

import { StatTile } from "./TodoTiles";
import { useDashboardSummaryQuery } from "../api/queries";
import { TODAY_TEXT } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/**
 * 오늘 — 주문 건수와 금액 / 출고 봉투와 장수. 왼쪽 할 일 타일과 같은 모양 두 장이라 윗줄 여섯 장이 한 줄로 읽힌다
 * (2026-11-18 사용자 지시: 이것도 대시보드 숫자인데 따로 놀았다).
 *
 * 날짜는 **영업일**이다(낮 12시 경계). 새벽 2시에 보면 달력은 내일이지만 여기는 어제 날짜다 —
 * 서버 `today`가 그 경계로 집계한 값이라 날짜도 같은 기준으로 붙여야 숫자와 맞는다.
 * "최근 갱신 HH:MM"은 서버 `now`다 — 폴링이 도는지 사장이 알 수 있는 유일한 표식이다.
 */
export function TodayPanel() {
  const { data } = useDashboardSummaryQuery();
  const today = data.today;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <StatTile
        title={`${TODAY_TEXT.title} ${TODAY_TEXT.orders} ${today.dateLabel}`}
        value={today.orderCount}
        unit="건"
        note={`${formatNumber(today.orderAmount)}원, ${TODAY_TEXT.cancelled} ${formatNumber(today.cancelled)}`}
      />
      <StatTile
        title={`${TODAY_TEXT.title} ${TODAY_TEXT.shipped}`}
        meta={
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {TODAY_TEXT.lastPrefix} {today.updatedAtLabel}
          </span>
        }
        value={today.shippedCount}
        unit="봉투"
        note={`${formatNumber(today.shippedQty)}장`}
      />
    </div>
  );
}
