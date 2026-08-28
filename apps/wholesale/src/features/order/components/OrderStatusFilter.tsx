"use client";

import { Segmented } from "@ondo/ui";
import {
  ORDER_FILTER_LABEL,
  ORDER_FILTER_VALUES,
  STATUS_FILTER_ALL,
  type OrderFilterValue,
} from "../constants";
import { countByStatus } from "../derive";
import type { Order } from "../types";

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
export function OrderStatusFilter({
  orders,
  value,
  onChange,
}: {
  /** 건수 계산의 기준이 되는 전체 목록. 걸러진 목록을 넘기면 안 된다 */
  orders: readonly Order[];
  value: OrderFilterValue;
  onChange: (value: OrderFilterValue) => void;
}) {
  /* `전체`의 건수만 상태로 셀 수 없다 — 걸러내지 않은 목록 길이가 곧 그 값이다.
     삼항이 유니온에서 `ALL`을 떼어내 주므로 countByStatus에 캐스팅 없이 넘어간다 */
  const countOf = (value: OrderFilterValue) =>
    value === STATUS_FILTER_ALL ? orders.length : countByStatus(orders, value);

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
      {ORDER_FILTER_VALUES.map((v) => (
        <Segmented.Item key={v} value={v}>
          {ORDER_FILTER_LABEL[v]} ({countOf(v)})
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
