"use client";

import { Segmented } from "@ondo/ui";
import { useOrderFiltersQuery } from "../api/queries";
import {
  ORDER_FILTER_LABEL,
  ORDER_FILTER_VALUES,
  type OrderFilterValue,
} from "../constants";
import { chipCount } from "../derive";
import type { OrderFilter } from "../types";

/**
 * 목록 위의 상태 필터 줄. `packages/ui`의 `Segmented`를 쓴다 — 출고 탭
 * `ShipmentStageChips`와 같은 모양이다.
 *
 * `fit`을 켜는 이유: 칸이 5개고 라벨 길이가 `전체 (75)`부터 `부분 출고 (15)`까지 제각각이라,
 * 균등 폭으로 두면 짧은 칸에 빈 공간이 크게 남는다.
 *
 * 건수는 `GET /orders/filters`가 준다(`filters`). **목록 필터와 무관하게 전체 기준**이다 —
 * 서버가 `filter`를 받지 않아서 눌러서 좁혀도 다른 칸의 숫자는 움직이지 않는다.
 * `filters`가 없으면(아직 안 왔을 때) 라벨만 그린다 — 칸은 건수 없이도 누를 수 있어야 한다.
 */
export function OrderStatusFilter({
  filters,
  value,
  onChange,
}: {
  /** 칩 응답. 없으면 건수 없이 라벨만 */
  filters?: readonly OrderFilter[];
  value: OrderFilterValue;
  onChange: (value: OrderFilterValue) => void;
}) {
  const countOf = (key: OrderFilterValue) =>
    filters === undefined ? null : chipCount(filters, key);

  return (
    <Segmented
      fit
      /* 여백·정렬은 호출부의 툴바 줄이 맡는다. 여기서는 줄어들지만 않으면 된다 */
      className="shrink-0"
      value={value}
      /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
      onValueChange={(next) => {
        const found = ORDER_FILTER_VALUES.find((v) => v === next);
        if (found) onChange(found);
      }}
      aria-label="주문 상태 필터"
    >
      {ORDER_FILTER_VALUES.map((v) => {
        const count = countOf(v);
        return (
          <Segmented.Item key={v} value={v}>
            {ORDER_FILTER_LABEL[v]}
            {count === null ? null : ` (${count})`}
          </Segmented.Item>
        );
      })}
    </Segmented>
  );
}

/**
 * 건수를 서버에서 받아 붙인 세그먼트. 안에서 `useSuspenseQuery`를 부르므로
 * `QueryBoundary` 안에 있어야 한다 — 기다리는 동안의 모습은 위의 건수 없는 세그먼트다.
 */
export function OrderStatusFilterWithCounts({
  q,
  value,
  onChange,
}: {
  /** 목록과 같은 검색어. 칩 건수도 검색어 기준이다(스펙) */
  q: string | undefined;
  value: OrderFilterValue;
  onChange: (value: OrderFilterValue) => void;
}) {
  const { data: filters } = useOrderFiltersQuery(q);
  return (
    <OrderStatusFilter filters={filters} value={value} onChange={onChange} />
  );
}
