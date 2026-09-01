"use client";

import { Button } from "@ondo/ui";
import Link from "next/link";
import { OrderLegList } from "./OrderLegList";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { LIST_HEADERS, ORDERS_TEXT } from "../constants";
import {
  formatSheets,
  formatWon,
  orderStatus,
  orderTotals,
  shipmentProgress,
  wholesalerLabel,
} from "../derive";
import type { OrderRecord } from "../types";

/**
 * 좁은 폭(≤960px)의 주문 내역. 표 대신 세로 카드다.
 *
 * **390px에서 표가 페이지 전체를 옆으로 밀었다**(F1). 사장이 시장에 서서 주문
 * 상태를 확인하는 화면인데 `금액 · 상태 · 출고`가 첫 화면에 없었다. 접는 경계
 * (`tablet` = 960px)와 방식은 `retail-backorder`·`retail-settlement`가 이미
 * 쓴 것과 같다 — 소매 전 화면이 한 규칙으로 접혀야 폭마다 다른 화면이 되지 않는다.
 *
 * 값·라벨·펼침이 **표와 같은 곳에서 나온다.** 숫자는 `derive.ts`, 라벨은
 * `LIST_HEADERS`, 펼침은 주소(`?open=`)다. 폭이 달라도 같은 주문이 같은 말을 한다.
 */
export function OrderCards({
  orders,
  open,
  onToggle,
  onReorder,
}: {
  orders: readonly OrderRecord[];
  /** 펼쳐 둔 주문. 표와 **같은 주소 값**이다 */
  open: string | null;
  onToggle: (orderId: string) => void;
  /** 누른 버튼을 같이 넘긴다 — 모달을 닫을 때 포커스가 돌아갈 자리다(F4) */
  onReorder: (order: OrderRecord, trigger: HTMLElement) => void;
}) {
  return (
    <ul aria-label={ORDERS_TEXT.title} className="divide-border divide-y">
      {orders.map((order) => {
        const totals = orderTotals(order);
        const progress = shipmentProgress(order);
        const seller = wholesalerLabel(order);
        const expanded = open === order.orderId;
        /* 표의 확장행과 id가 겹치면 안 된다 — 두 벌이 동시에 DOM에 있고
           `display:none`으로만 갈린다 */
        const detailId = `order-card-detail-${order.orderId}`;

        return (
          <li key={order.orderId} className="py-3.5 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular-nums">
                {order.orderedAt.slice(0, 10)}
              </span>
              <OrderStatusBadge status={orderStatus(order)} />
            </div>

            <Link
              href={`/orders/${order.orderId}`}
              className="text-body mt-0.5 inline-block font-medium tabular-nums underline-offset-4 hover:underline"
            >
              {order.orderId}
            </Link>

            <dl className="text-body mt-2 grid grid-cols-[5.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">
                {LIST_HEADERS.wholesaler}
              </dt>
              <dd>
                {seller.head}{" "}
                {seller.rest ? (
                  <span className="text-muted-foreground">{seller.rest}</span>
                ) : null}
              </dd>

              <dt className="text-muted-foreground">{LIST_HEADERS.sheets}</dt>
              <dd className="tabular-nums">{formatSheets(totals.sheets)}</dd>

              <dt className="text-muted-foreground">{LIST_HEADERS.amount}</dt>
              <dd className="font-medium tabular-nums">
                {formatWon(totals.amount)}
              </dd>

              <dt className="text-muted-foreground">{LIST_HEADERS.shipment}</dt>
              <dd className="tabular-nums">
                {progress.planned === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  `${progress.planned}건 중 ${progress.done}건`
                )}
              </dd>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => onToggle(order.orderId)}
              >
                {expanded ? ORDERS_TEXT.collapse : ORDERS_TEXT.expand}
                <span className="sr-only"> ({order.orderId})</span>
              </Button>

              <Button
                variant="line"
                size="sm"
                className="ml-auto"
                onClick={(event) => onReorder(order, event.currentTarget)}
              >
                {ORDERS_TEXT.reorder}
                <span className="sr-only"> ({order.orderId})</span>
              </Button>
            </div>

            {expanded ? (
              <div
                id={detailId}
                className="border-border mt-2.5 rounded-control border p-3"
              >
                <OrderLegList order={order} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
