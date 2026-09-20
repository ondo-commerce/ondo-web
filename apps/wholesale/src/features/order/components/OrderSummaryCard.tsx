"use client";

import { Badge, Panel } from "@ondo/ui";
import type { ReactNode } from "react";
import { useOrderDetailQuery } from "../api/queries";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIVE_METHOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
} from "../constants";
import { orderStatusTone, settlementStatusTone } from "../derive";
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
 * 우측 주문 카드의 속. **전부 읽기 전용이다** — 입력칸이 하나도 없다.
 * 거래처·결제·수령 정보는 주문이 들어올 때 소매처가 정한 값이라 도매가 고치지 않는다.
 *
 * `주문 금액`·`주문 수량`은 서버 합계(`orderAmount`·`totalQty`)다. 더미 시절엔 라인을
 * 화면이 더했고 Figma 목업은 그 합과 어긋나 있었다(01-pm.md §1.2) — 이제 서버 값 하나다.
 *
 * 정산 상태는 `미정산`이 아니라 **`미결제`**다(screen_spec §9.4).
 *
 * **버튼이 없다.** `주문 확정`·`주문 취소`는 `이번 출고` 입력을 먹는 액션이라
 * 입력이 있는 곳(펼침 영역 하단 `OrderActionBar`)에 있다. 이 카드는 "이 주문이 무엇인가"만 답한다.
 *
 * `Panel`은 부르는 쪽(`OrderListView`)이 그린다 — 경계(`QueryBoundary`)가 패널 안에
 * 들어가야 기다리는 동안에도 우측 폭이 유지되기 때문이다. 펼친 행과 같은 queryKey라
 * 상세는 한 번만 받는다.
 */
export function OrderSummaryCard({ orderId }: { orderId: number }) {
  const { data: order } = useOrderDetailQuery(orderId);

  return (
    <>
      <Panel.Title
        action={
          <Badge tone={orderStatusTone(order.status)}>
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        }
      >
        주문 {order.orderNumber}
      </Panel.Title>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <Field label="거래처">{order.retailerName}</Field>
          <Field label="주문 일시">{order.orderedAt}</Field>
          <Field label="주문 금액">{formatNumber(order.orderAmount)}</Field>
          <Field label="주문 수량">{formatNumber(order.totalQty)}</Field>
        </div>
        <div>
          <Field label="결제 방식">
            {PAYMENT_METHOD_LABEL[order.paymentMethod]}
          </Field>
          <Field label="수령 방식">
            {RECEIVE_METHOD_LABEL[order.receiveBy]}
          </Field>
          <Field label="연락처">{order.retailerPhone ?? "-"}</Field>
          <Field label="정산 상태">
            <Badge tone={settlementStatusTone(order.settlementStatus)}>
              {SETTLEMENT_STATUS_LABEL[order.settlementStatus]}
            </Badge>
          </Field>
        </div>
      </div>
    </>
  );
}
