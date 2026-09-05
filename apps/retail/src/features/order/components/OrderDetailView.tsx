"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OrderLineCards } from "./OrderLineCards";
import { OrderLineTable } from "./OrderLineTable";
import { OrderStats } from "./OrderStats";
import { PaymentPickupPanel } from "./PaymentPickupPanel";
import { ShipmentRecords } from "./ShipmentRecords";
import { StatementDialog } from "./StatementDialog";
import {
  describeOrderError,
  useCancelOrderMutation,
  useOrderBusy,
} from "../api/mutations";
import { CANCEL_ACTION_ID, DETAIL_TEXT, ORDER_PATH } from "../constants";
import { cancelLockReason, cancellableLegIds, detailSubtitle } from "../derive";
import type { OrderRecord, Shipment } from "../types";

/** 취소 흐름의 자리. 확인 → 보내는 중 → 결과 한 줄 */
type CancelStep = "idle" | "confirming" | "done";

/**
 * 주문 상세 — 패널 4장. 값은 `GET /orders/{orderId}`다.
 *
 * 취소는 **도매처별**이고 되돌리기 API가 없다(스펙). 되돌릴 수 없는 실행이라
 * 확인 단계를 둔다(F9) — 누르면 `취소 확정`·`그만두기`가 그 자리에 서고, 확정하면
 * `POST /orders/{id}/cancel`을 보낸 뒤 `router.refresh()`로 서버 값을 다시 그린다.
 * 화면이 배지를 직접 `취소됨`으로 바꾸지 않는다 — 일부만 취소될 수 있어서
 * 무엇이 어떻게 됐는지는 서버가 말한다.
 */
export function OrderDetailView({
  order,
  receiverStore,
  favorites,
  onToggleFavorite,
}: {
  order: OrderRecord;
  receiverStore: string;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
}) {
  const router = useRouter();
  const cancel = useCancelOrderMutation();
  const busy = useOrderBusy();
  const [step, setStep] = useState<CancelStep>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [statement, setStatement] = useState<{
    shipment: Shipment;
    trigger: HTMLElement;
  } | null>(null);

  const lock = cancelLockReason(order);
  const cancelable = lock === null;

  /* 확인 단계가 나타나면 `취소 확정`으로, 사라지면 `주문 취소`로 포커스를 옮긴다 —
     버튼이 그 자리에서 바뀌어 그냥 두면 포커스가 `<body>`로 떨어진다(WCAG 2.4.3) */
  useEffect(() => {
    const id =
      step === "confirming"
        ? CANCEL_ACTION_ID.confirm
        : step === "done"
          ? CANCEL_ACTION_ID.cancel
          : null;
    if (id) document.getElementById(id)?.focus();
  }, [step]);

  const handleConfirm = () => {
    cancel.mutate(
      { orderId: order.orderId, wholesaleOrderIds: cancellableLegIds(order) },
      {
        onSuccess: (response) => {
          const results = response.results ?? [];
          const done = results.filter((leg) => leg.isCancelled ?? false);
          const kept = results.filter((leg) => !(leg.isCancelled ?? false));
          /* 서버 문구를 그대로 잇는다 — 왜 안 됐는지는 도매처마다 다르다 */
          const reasons = kept
            .map((leg) => leg.message ?? "")
            .filter((message) => message !== "")
            .join(" ");
          const summary =
            done.length === 0
              ? DETAIL_TEXT.cancelNone
              : kept.length === 0
                ? DETAIL_TEXT.cancelDone
                : DETAIL_TEXT.cancelPartial(done.length, kept.length);
          setResult(reasons === "" ? summary : `${summary} ${reasons}`);
          setStep("done");
          /* 배지·라인·버튼은 서버 값이다. 다시 받아 그린다 */
          router.refresh();
        },
        onError: (error) => {
          setResult(describeOrderError(error, DETAIL_TEXT.cancelFailed));
          setStep("done");
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={detailSubtitle(order)}>
          <span className="tabular-nums">{order.orderNo}</span>
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
            {step === "confirming" ? (
              <>
                <Button
                  id={CANCEL_ACTION_ID.confirm}
                  variant="soft"
                  disabled={busy}
                  onClick={handleConfirm}
                >
                  {busy
                    ? DETAIL_TEXT.cancelling
                    : DETAIL_TEXT.cancelConfirmAction}
                </Button>
                <Button
                  variant="line"
                  disabled={busy}
                  onClick={() => setStep("idle")}
                >
                  {DETAIL_TEXT.cancelDismiss}
                </Button>
              </>
            ) : (
              /* 못 누를 때는 **진짜 `disabled`**다. `aria-disabled`만 걸면
                 잠긴 주문에서도 눌린다(직전 회차 F11) */
              <Button
                id={CANCEL_ACTION_ID.cancel}
                variant="soft"
                disabled={!cancelable || busy}
                onClick={() => {
                  setResult(null);
                  setStep("confirming");
                }}
              >
                {DETAIL_TEXT.cancel}
              </Button>
            )}

            {/* 확인 질문과 실행 결과가 같은 자리에서 바뀐다. `role=status` 노드는
                비어 있을 때도 자리를 지킨다: 지운 뒤에 새로 생기는 노드는 보조기술이
                못 읽고 지나갈 수 있다 */}
            <p
              role="status"
              className="text-secondary-foreground text-body empty:hidden"
            >
              {step === "confirming"
                ? DETAIL_TEXT.cancelConfirm
                : step === "done"
                  ? (result ?? "")
                  : ""}
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
          onOpenStatement={(shipment, trigger) =>
            setStatement({ shipment, trigger })
          }
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

      {statement ? (
        <StatementDialog
          order={order}
          shipment={statement.shipment}
          receiverStore={receiverStore}
          open
          onOpenChange={(next) => {
            if (!next) setStatement(null);
          }}
          onCloseFocus={() => statement.trigger.focus()}
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
            <Link href={ORDER_PATH.orders}>{DETAIL_TEXT.notFound.action}</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
