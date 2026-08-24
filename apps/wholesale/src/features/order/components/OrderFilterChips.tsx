"use client";

import { Button } from "@ondo/ui";
import {
  FILTER_STATUSES,
  ORDER_STATUS_LABEL,
  STATUS_FILTER_ALL,
} from "../constants";
import { countByStatus } from "../derive";
import type { Order, OrderStatus } from "../types";

/**
 * 목록 위의 상태 필터 칩 줄. 이 레포에서 처음 등장하는 패턴이다.
 *
 * **Rule of Two에 따라 주문 탭 안에 둔다.** 두 번째 사용처는 출고 탭(Figma 1944:10469)이고
 * `packages/ui` 승격은 그 PR에서 판정한다.
 *
 * 모양은 새 CSS를 만들지 않고 기존 Button 두 변형으로 낸다 —
 * 활성 = `line`(흰 배경 + 테두리 + 진한 글자), 비활성 = `soft`(회색 채움 + 회색 글자).
 * 상태는 색이 아니라 `aria-pressed`로도 노출한다.
 *
 * 건수는 **전체 목록 기준으로 고정**이다(derive.countByStatus). 칩을 눌러 좁혀도
 * 다른 칩의 숫자는 움직이지 않는다.
 */
export function OrderFilterChips({
  orders,
  value,
  onChange,
}: {
  /** 건수 계산의 기준이 되는 전체 목록. 걸러진 목록을 넘기면 안 된다 */
  orders: readonly Order[];
  value: OrderStatus | typeof STATUS_FILTER_ALL;
  onChange: (value: OrderStatus | typeof STATUS_FILTER_ALL) => void;
}) {
  const chip = (
    key: OrderStatus | typeof STATUS_FILTER_ALL,
    label: string,
    count: number,
  ) => {
    const active = value === key;
    return (
      <Button
        key={key}
        type="button"
        size="sm"
        variant={active ? "line" : "soft"}
        aria-pressed={active}
        className="rounded-full"
        onClick={() => onChange(key)}
      >
        {label} ({count})
      </Button>
    );
  };

  return (
    <div className="mb-4 flex shrink-0 flex-wrap gap-2">
      {chip(STATUS_FILTER_ALL, "전체", orders.length)}
      {FILTER_STATUSES.map((status) =>
        chip(status, ORDER_STATUS_LABEL[status], countByStatus(orders, status)),
      )}
    </div>
  );
}
