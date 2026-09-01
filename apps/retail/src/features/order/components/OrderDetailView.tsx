"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { OrderLineCards } from "./OrderLineCards";
import { OrderLineTable } from "./OrderLineTable";
import { OrderStats } from "./OrderStats";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentPickupPanel } from "./PaymentPickupPanel";
import { ReorderDialog } from "./ReorderDialog";
import { ShipmentRecords } from "./ShipmentRecords";
import { StatementDialog } from "./StatementDialog";
import { CANCEL_ACTION_ID, DETAIL_TEXT } from "../constants";
import {
  cancelLockReason,
  detailSubtitle,
  orderStatus,
  withCancel,
} from "../derive";
import {
  cancelOrder,
  undoCancelOrder,
  useCanceledOrders,
  useLastCanceled,
} from "../store";
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
  const lastCanceled = useLastCanceled();
  const [reordering, setReordering] = useState(false);
  const [statement, setStatement] = useState<Shipment | null>(null);
  const [undone, setUndone] = useState(false);
  /* 모달을 닫은 뒤 포커스를 돌려 놓을 자리. `packages/ui`의 `Button`은 ref를
     받지 않아서 눌린 요소를 그때 붙잡아 둔다(F4) */
  const reorderTrigger = useRef<HTMLElement | null>(null);
  const statementTrigger = useRef<HTMLElement | null>(null);

  /* 취소 사실을 한 번 겹친 사본을 그린다. 배지·라인 상태·취소 버튼이 전부
     이 하나에서 나오므로 세 자리가 서로 다른 말을 할 수 없다 */
  const order = withCancel(source, canceledOrders.has(source.orderId));
  const lock = cancelLockReason(order);
  const cancelable = lock === null;
  /* 방금 이 주문을 취소했는가. 되돌리기가 이 값에서 나온다(F9) */
  const justCanceled = lastCanceled === order.orderId;

  /* 취소하면 `주문 취소`가 그 자리에서 `disabled`가 돼 포커스가 `<body>`로
     떨어진다. 다음에 할 수 있는 일이 되돌리기라 그쪽으로 옮긴다(WCAG 2.4.3 ·
     장바구니 `선택 삭제`와 같은 방식) */
  useEffect(() => {
    if (justCanceled) document.getElementById(CANCEL_ACTION_ID.undo)?.focus();
  }, [justCanceled]);

  const handleCancel = () => {
    setUndone(false);
    cancelOrder(order.orderId);
  };

  /* 되돌리면 `되돌리기`가 사라진다 — 목록을 먼저 그린 뒤에 포커스를 옮겨야
     아직 없는 버튼을 찾지 않는다 */
  const handleUndo = () => {
    flushSync(() => undoCancelOrder());
    setUndone(true);
    document.getElementById(CANCEL_ACTION_ID.cancel)?.focus();
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={detailSubtitle(order)}
          action={
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={orderStatus(order)} />
              <Button
                variant="line"
                onClick={(event) => {
                  reorderTrigger.current = event.currentTarget;
                  setReordering(true);
                }}
              >
                {DETAIL_TEXT.reorderAll}
              </Button>
            </div>
          }
        >
          <span className="tabular-nums">{order.orderId}</span>
        </Panel.Title>

        <OrderStats order={order} />

        <section className="mt-6">
          {/* 잠긴 **이유마다 다른 말**을 한다. 한 벌로 두던 때는 취소된 주문이
              `이미 확정돼서 잠겼어요`라고 말해 머리 배지와 정면으로 부딪쳤다(F3) */}
          <Notice>
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {lock ? DETAIL_TEXT.cancelLocked[lock] : DETAIL_TEXT.cancelOpen}
            </span>
          </Notice>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* 못 누를 때는 **진짜 `disabled`**다. `aria-disabled`만 걸면
                잠긴 주문에서도 눌린다(직전 회차 F11) */}
            <Button
              id={CANCEL_ACTION_ID.cancel}
              variant="soft"
              disabled={!cancelable}
              onClick={handleCancel}
            >
              {DETAIL_TEXT.cancel}
            </Button>

            {/* 실행 결과가 버튼 옆에서 바뀐다 — 배지도 같이 `취소됨`이 되므로
                같은 버튼을 또 눌러야 하는지 사장이 알 수 있다.
                되돌릴 수 없는 실행에 확인 모달 대신 **되돌리기**를 붙인다 —
                장바구니 `선택 삭제`가 같은 등급에 이미 그렇게 해 뒀다(F9).
                `role=status` 노드는 비어 있을 때도 자리를 지킨다: 지운 뒤에 새로
                생기는 노드는 보조기술이 못 읽고 지나갈 수 있다 */}
            <p
              role="status"
              className="text-secondary-foreground text-body empty:hidden"
            >
              {justCanceled ? (
                <>
                  {DETAIL_TEXT.cancelDone}{" "}
                  <Button
                    id={CANCEL_ACTION_ID.undo}
                    variant="link"
                    className="text-foreground text-body font-semibold underline underline-offset-2"
                    onClick={handleUndo}
                  >
                    {DETAIL_TEXT.cancelUndo}
                  </Button>
                </>
              ) : undone ? (
                DETAIL_TEXT.cancelUndone
              ) : (
                ""
              )}
            </p>
          </div>
        </section>
      </Panel>

      <Panel className="mt-2">
        <Panel.Title>{DETAIL_TEXT.lineSection}</Panel.Title>
        {/* 960px 아래에서는 표를 세로 카드로 갈아끼운다 — 표를 그대로 두면
            페이지 전체가 옆으로 밀려 `단가 · 소계 · 상태 · 찜`이 첫 화면에서
            사라진다(F1). 값은 두 벌이 같은 함수에서 읽는다 */}
        <div className="hidden tablet:block">
          <OrderLineCards
            order={order}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />
        </div>

        <div className="tablet:hidden">
          <OrderLineTable
            order={order}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      </Panel>

      <Panel className="mt-2">
        <Panel.Title sub={DETAIL_TEXT.shipmentSub}>
          {DETAIL_TEXT.shipmentSection}
        </Panel.Title>
        <ShipmentRecords
          order={order}
          onOpenStatement={(shipment, trigger) => {
            statementTrigger.current = trigger;
            setStatement(shipment);
          }}
        />
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
          onCloseFocus={() => reorderTrigger.current?.focus()}
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
          onCloseFocus={() => statementTrigger.current?.focus()}
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
