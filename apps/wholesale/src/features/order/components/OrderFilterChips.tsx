"use client";

import { Segmented } from "@ondo/ui";
import {
  FILTER_STATUSES,
  ORDER_STATUS_LABEL,
  STATUS_FILTER_ALL,
} from "../constants";
import { countByStatus } from "../derive";
import type { Order, OrderStatus } from "../types";

type FilterValue = OrderStatus | typeof STATUS_FILTER_ALL;

/**
 * 목록 위의 상태 필터 줄. `packages/ui`의 `Segmented`를 쓴다 — 출고 탭
 * `ShipmentStageChips`와 같은 모양이다.
 *
 * 원래는 Button 두 변형(line/soft)으로 만든 칩 줄이었고, "Rule of Two에 따라 주문 탭 안에
 * 둔다, 두 번째 사용처인 출고 탭 PR에서 승격을 판정한다"고 적혀 있었다. 그 출고 탭이
 * `Segmented`를 골랐으므로 **여기를 맞추는 것으로 그 판정이 끝난다** — 새 공용 컴포넌트를
 * 만들 필요가 없어졌다.
 *
 * `fit`을 켜는 이유: 칸이 5개고 라벨 길이가 `전체 (75)`부터 `부분 출고 (15)`까지 제각각이라,
 * 균등 폭으로 두면 짧은 칸에 빈 공간이 크게 남는다.
 *
 * 건수는 **전체 목록 기준으로 고정**이다(derive.countByStatus). 눌러서 좁혀도
 * 다른 칸의 숫자는 움직이지 않는다.
 */
export function OrderFilterChips({
  orders,
  value,
  onChange,
}: {
  /** 건수 계산의 기준이 되는 전체 목록. 걸러진 목록을 넘기면 안 된다 */
  orders: readonly Order[];
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  const options: readonly { key: FilterValue; label: string; count: number }[] =
    [
      { key: STATUS_FILTER_ALL, label: "전체", count: orders.length },
      ...FILTER_STATUSES.map((status) => ({
        key: status as FilterValue,
        label: ORDER_STATUS_LABEL[status],
        count: countByStatus(orders, status),
      })),
    ];

  return (
    <Segmented
      fit
      /* 여백·정렬은 호출부의 툴바 줄이 맡는다. 여기서는 줄어들지만 않으면 된다 */
      className="shrink-0"
      value={value}
      /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
      onValueChange={(next) => {
        const found = options.find((option) => option.key === next);
        if (found) onChange(found.key);
      }}
      aria-label="주문 상태 필터"
    >
      {options.map(({ key, label, count }) => (
        <Segmented.Item key={key} value={key}>
          {label} ({count})
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
