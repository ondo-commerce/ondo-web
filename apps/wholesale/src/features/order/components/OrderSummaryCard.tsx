"use client";

import { Badge, Panel } from "@ondo/ui";
import type { ReactNode } from "react";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIVE_METHOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
} from "../constants";
import {
  orderAmount,
  orderQty,
  orderStatusTone,
  settlementStatusTone,
} from "../derive";
import type { Order } from "../types";
import { formatNumber } from "@/shared/lib/format";

/** 라벨-값 한 줄. 좌우 두 열의 행 높이가 같아야 8필드가 격자로 읽힌다 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="truncate text-sm tabular-nums">{children}</span>
    </div>
  );
}

/**
 * 우측 주문 카드. **전부 읽기 전용이다** — 입력칸이 하나도 없다.
 * 거래처·결제·수령 정보는 주문이 들어올 때 소매처가 정한 값이라 도매가 고치지 않는다.
 *
 * `주문 금액`·`주문 수량`은 반드시 라인 합계다(derive.orderAmount / orderQty).
 * Figma 목업은 합계와 어긋나 있는데 그건 목업 오류다(01-pm.md §1.2).
 *
 * 정산 상태는 `미정산`이 아니라 **`미결제`**다(screen_spec §9.4).
 */
export function OrderSummaryCard({ order }: { order: Order }) {
  return (
    <Panel className="shrink-0">
      <Panel.Title
        action={
          <Badge tone={orderStatusTone(order.status)}>
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        }
      >
        {order.id}
      </Panel.Title>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <Field label="거래처">{order.customerName}</Field>
          <Field label="주문 일시">{order.placedAt}</Field>
          <Field label="주문 금액">{formatNumber(orderAmount(order))}</Field>
          <Field label="주문 수량">{formatNumber(orderQty(order))}</Field>
        </div>
        <div>
          <Field label="결제 방식">
            {PAYMENT_METHOD_LABEL[order.paymentMethod]}
          </Field>
          <Field label="수령 방식">
            {RECEIVE_METHOD_LABEL[order.receiveMethod]}
          </Field>
          <Field label="연락처">{order.contact}</Field>
          <Field label="정산 상태">
            <Badge tone={settlementStatusTone(order.settlementStatus)}>
              {SETTLEMENT_STATUS_LABEL[order.settlementStatus]}
            </Badge>
          </Field>
        </div>
      </div>
    </Panel>
  );
}
