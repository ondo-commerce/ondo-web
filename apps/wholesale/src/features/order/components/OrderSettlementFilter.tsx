"use client";

import { Segmented } from "@ondo/ui";
import {
  SETTLEMENT_FILTER_STATUSES,
  SETTLEMENT_STATUS_LABEL,
  STATUS_FILTER_ALL,
} from "../constants";
import type { SettlementStatus } from "../types";

export type SettlementFilterValue = SettlementStatus | typeof STATUS_FILTER_ALL;

const OPTIONS: readonly { key: SettlementFilterValue; label: string }[] = [
  { key: STATUS_FILTER_ALL, label: "전체" },
  ...SETTLEMENT_FILTER_STATUSES.map((status) => ({
    key: status as SettlementFilterValue,
    label: SETTLEMENT_STATUS_LABEL[status],
  })),
];

/**
 * 정산 상태 필터. 주문 상태 세그먼트와 **다른 축**이라 둘이 함께 걸린다 —
 * `주문 확정` + `미결제`처럼 좁힐 수 있다. 정산 축은 이행 축과 독립이다
 * (settlement_data_model.md §3.2).
 *
 * **건수를 붙이지 않는다.** 주문 상태 세그먼트에는 붙는데, 여기까지 붙이면 툴바 한 줄이
 * 검색창까지 합쳐 화면 폭을 넘긴다. 두 번째 축은 무엇으로 걸렀는지만 읽히면 된다.
 */
export function OrderSettlementFilter({
  value,
  onChange,
}: {
  value: SettlementFilterValue;
  onChange: (value: SettlementFilterValue) => void;
}) {
  return (
    <Segmented
      fit
      className="shrink-0"
      value={value}
      /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
      onValueChange={(next) => {
        const found = OPTIONS.find((option) => option.key === next);
        if (found) onChange(found.key);
      }}
      aria-label="정산 상태 필터"
    >
      {OPTIONS.map(({ key, label }) => (
        <Segmented.Item key={key} value={key}>
          {label}
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
