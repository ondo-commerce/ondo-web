"use client";

import { OrderActionBar } from "./OrderActionBar";
import { OrderLineTable } from "./OrderLineTable";
import { useOrderDetailQuery } from "../api/queries";
import { canAllocate, clampShipInput } from "../derive";
import type { ShipInputs } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";

/**
 * 펼친 행의 내용. 목록 응답에는 라인이 없어서 펼치는 순간 상세를 부른다.
 * 우측 주문 카드와 같은 queryKey라 한 번만 받는다.
 *
 * 경계를 행 안에 둔다 — 한 행의 상세가 실패했다고 목록 전체가 죽으면 안 된다.
 *
 * 입력값(`inputs`)은 여기 두지 않고 `OrderListView`가 든다 — 검색어가 바뀌어 목록이
 * 다시 올 때 이 컴포넌트는 경계 아래라 통째로 다시 그려지는데, 그때 입력이 날아가면
 * 안 된다. 대신 **상한 자르기는 여기서 한다**: 라인을 아는 쪽이 여기뿐이다.
 */
export function OrderRowDetail({
  orderId,
  inputs,
  onInputChange,
  onInputsReset,
}: {
  orderId: number;
  inputs: ShipInputs;
  onInputChange: (lineId: number, value: string) => void;
  /** 서버가 받아 준 뒤 입력을 비운다 */
  onInputsReset: () => void;
}) {
  return (
    <QueryBoundary>
      <OrderRowDetailBody
        orderId={orderId}
        inputs={inputs}
        onInputChange={onInputChange}
        onInputsReset={onInputsReset}
      />
    </QueryBoundary>
  );
}

function OrderRowDetailBody({
  orderId,
  inputs,
  onInputChange,
  onInputsReset,
}: {
  orderId: number;
  inputs: ShipInputs;
  onInputChange: (lineId: number, value: string) => void;
  onInputsReset: () => void;
}) {
  const { data: order } = useOrderDetailQuery(orderId);

  /**
   * 숫자가 아닌 글자는 무시하고(직전 값 유지), `min(미할당, 가용재고)`를 넘기면 잘린다.
   * 넘겨서 받아 두면 서버가 `ALLOCATION_EXCEEDS_ORDER`로 되돌리고 그때까지 사장은
   * 항등식이 깨진 숫자를 보고 있게 된다.
   */
  const changeInput = (lineId: number, raw: string) => {
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return;
    const next = clampShipInput(line, raw);
    if (next !== null) onInputChange(lineId, next);
  };

  return (
    <OrderLineTable
      order={order}
      inputs={inputs}
      onInputChange={changeInput}
      /* `이번 출고` 입력을 먹는 액션은 전부 입력 옆에 둔다.
         어느 버튼이 뜨는지는 서버 boolean이 정한다(OrderActionBar).
         취소·출고 완료는 입력 자체가 없는 국면이라 액션 줄도 없다 */
      footer={
        canAllocate(order) ? (
          <OrderActionBar
            order={order}
            inputs={inputs}
            onDone={onInputsReset}
          />
        ) : undefined
      }
    />
  );
}
