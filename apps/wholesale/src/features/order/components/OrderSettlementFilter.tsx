"use client";

import { Segmented } from "@ondo/ui";
import {
  SETTLEMENT_FILTER_LABEL,
  SETTLEMENT_FILTER_VALUES,
  type SettlementFilterValue,
} from "../constants";

/**
 * 정산 상태 필터. 주문 상태 세그먼트와 **다른 축**이라 둘이 함께 걸린다 —
 * `주문 확정` + `미결제`처럼 좁힐 수 있다. 정산 축은 이행 축과 독립이다
 * (settlement_data_model.md §3.2).
 *
 * **건수를 붙이지 않는다.** 주문 상태 세그먼트에는 붙는데, 여기까지 붙이면 툴바 한 줄이
 * 검색창까지 합쳐 화면 폭을 넘긴다. 두 번째 축은 무엇으로 걸렀는지만 읽히면 된다.
 *
 * 세울 칸과 순서는 `SETTLEMENT_FILTER_VALUES`가, 그 칸에 쓸 말은 `SETTLEMENT_FILTER_LABEL`이
 * 갖는다. 여기서 `{key, label}` 목록을 다시 조립하지 않는다 — 조립하는 순간 라벨 표와
 * 화면 사이에 같은 문구가 한 벌 더 생긴다.
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
        const found = SETTLEMENT_FILTER_VALUES.find((v) => v === next);
        if (found) onChange(found);
      }}
      aria-label="정산 상태 필터"
    >
      {SETTLEMENT_FILTER_VALUES.map((v) => (
        <Segmented.Item key={v} value={v}>
          {SETTLEMENT_FILTER_LABEL[v]}
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
