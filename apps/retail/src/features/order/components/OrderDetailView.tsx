"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OrderLineTable } from "./OrderLineTable";
import { OrderStats } from "./OrderStats";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentPickupPanel } from "./PaymentPickupPanel";
import { ReorderDialog } from "./ReorderDialog";
import { ShipmentRecords } from "./ShipmentRecords";
import { StatementDialog } from "./StatementDialog";
import { DETAIL_TEXT } from "../constants";
import {
  detailSubtitle,
  isCancelable,
  orderStatus,
  withCancel,
} from "../derive";
import { cancelOrder, useCanceledOrders } from "../store";
import type { OrderLine, OrderRecord, Shipment } from "../types";

/**
 * 주문 상세 — 패널 4장.
 *
 * **머리 배지가 주문 내역 목록과 같은 함수에서 나온다**(`orderStatus`). 목록과
 * 상세가 같은 주문을 두고 다른 배지를 보이면 어느 쪽을 믿어야 할지 알 수 없다.
 *
 * 취소도 같은 이유로 스토어가 든다 — 여기서 취소한 주문이 목록에서도 `취소됨`이
 * 된다. 더미 배열을 직접 고치지 않는 이유는 `derive.withCancel` 주석에 있다.
 */
export function OrderDetailView({
  order: source,
  receiverStore,
  favorites,
  onToggleFavorite,
  onReorder,
}: {
  order: OrderRecord;
  receiverStore: string;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
  onReorder: (lines: readonly OrderLine[]) => void;
}) {
  const canceledOrders = useCanceledOrders();
  const [reordering, setReordering] = useState(false);
  const [statement, setStatement] = useState<Shipment | null>(null);
  const [justCanceled, setJustCanceled] = useState(false);

  /* 취소 사실을 한 번 겹친 사본을 그린다. 배지·라인 상태·취소 버튼이 전부
     이 하나에서 나오므로 세 자리가 서로 다른 말을 할 수 없다 */
  const order = withCancel(source, canceledOrders.has(source.orderId));
  const cancelable = isCancelable(order);

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={detailSubtitle(order)}
          action={
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={orderStatus(order)} />
              <Button variant="line" onClick={() => setReordering(true)}>
                {DETAIL_TEXT.reorderAll}
              </Button>
            </div>
          }
        >
          <span className="tabular-nums">{order.orderId}</span>
        </Panel.Title>

        <OrderStats order={order} />

        <section className="mt-6">
          <Notice>
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {cancelable ? DETAIL_TEXT.cancelOpen : DETAIL_TEXT.cancelLocked}
            </span>
          </Notice>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* 못 누를 때는 **진짜 `disabled`**다. `aria-disabled`만 걸면
                잠긴 주문에서도 눌린다(직전 회차 F11) */}
            <Button
              variant="soft"
              disabled={!cancelable}
              onClick={() => {
                cancelOrder(order.orderId);
                setJustCanceled(true);
              }}
            >
              {DETAIL_TEXT.cancel}
            </Button>

            {/* 실행 결과가 버튼 옆에서 바뀐다 — 배지도 같이 `취소됨`이 되므로
                같은 버튼을 또 눌러야 하는지 사장이 알 수 있다 */}
            <p
              role="status"
              className="text-secondary-foreground text-body empty:hidden"
            >
              {justCanceled ? DETAIL_TEXT.cancelDone : ""}
            </p>
          </div>
        </section>
      </Panel>

      <Panel className="mt-2">
        <Panel.Title>{DETAIL_TEXT.lineSection}</Panel.Title>
        <OrderLineTable
          order={order}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      </Panel>

      <Panel className="mt-2">
        <Panel.Title sub={DETAIL_TEXT.shipmentSub}>
          {DETAIL_TEXT.shipmentSection}
        </Panel.Title>
        <ShipmentRecords order={order} onOpenStatement={setStatement} />
      </Panel>

      <Panel className="mt-2">
        <Panel.Title>{DETAIL_TEXT.paymentSection}</Panel.Title>
        <PaymentPickupPanel order={order} />

        <Notice className="mt-6">
          <span className="flex items-start gap-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {DETAIL_TEXT.returnNotice}
          </span>
        </Notice>
      </Panel>

      {/* 목록과 **같은 모달**이다 — 두 벌 만들면 한쪽만 고쳐진다 */}
      {reordering ? (
        <ReorderDialog
          order={order}
          open
          onOpenChange={(next) => {
            if (!next) setReordering(false);
          }}
          onAdd={onReorder}
        />
      ) : null}

      {statement ? (
        <StatementDialog
          order={order}
          shipment={statement}
          receiverStore={receiverStore}
          open
          onOpenChange={(next) => {
            if (!next) setStatement(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** 없는 주문번호로 들어왔을 때. 깨진 화면 대신 무엇이 없는지 말한다 */
export function OrderNotFound() {
  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <div className="py-16 text-center">
          <h2 className="text-base font-medium">
            {DETAIL_TEXT.notFound.title}
          </h2>
          <p className="text-muted-foreground text-body mt-1.5">
            {DETAIL_TEXT.notFound.description}
          </p>
          <Button asChild variant="line" className="mt-3.5">
            <Link href="/orders">{DETAIL_TEXT.notFound.action}</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
