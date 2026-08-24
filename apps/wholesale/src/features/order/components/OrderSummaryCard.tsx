"use client";

import { Badge, Button, Panel } from "@ondo/ui";
import { useState, type ReactNode } from "react";
import { OrderConfirmDialog } from "./OrderConfirmDialog";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIVE_METHOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
} from "../constants";
import {
  backorderPreview,
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
 *
 * 하단 두 버튼은 **신규 주문에만** 붙는다. 확정·취소는 되돌릴 수 없어서
 * 한 번 지나간 주문에는 다시 나타나지 않는다.
 */
export function OrderSummaryCard({
  order,
  inputs,
  onConfirm,
  onCancel,
}: {
  order: Order;
  /** `이번 출고` 입력 맵. 확정 다이얼로그의 미송 예고를 만드는 데 쓴다 */
  inputs: Readonly<Record<string, string>>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const preview = backorderPreview(order, inputs);

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

      {order.status === "PLACED" ? (
        /* 가로 2등분 — 둘 다 주문 하나를 끝내는 액션이라 무게가 같다 */
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="line"
            className="w-full"
            onClick={() => setCancelOpen(true)}
          >
            주문 취소
          </Button>
          <Button className="w-full" onClick={() => setConfirmOpen(true)}>
            주문 확정
          </Button>
        </div>
      ) : null}

      <OrderConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="주문 확정"
        confirmLabel="주문 확정"
        description={
          <>
            {order.id} · {order.customerName}의 주문을 확정합니다.
            {preview.totalQty > 0 ? (
              <>
                <br />
                입력하지 않은 잔량{" "}
                <b className="text-foreground">
                  SKU {preview.skuCount}개 · 합계{" "}
                  {formatNumber(preview.totalQty)}장이 미송으로 확정됩니다.
                </b>
              </>
            ) : null}
            <br />
            확정한 뒤에는 되돌릴 수 없습니다.
          </>
        }
        onConfirm={() => {
          onConfirm();
          setConfirmOpen(false);
        }}
      />

      <OrderConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="주문 취소"
        confirmLabel="주문 취소"
        destructive
        description={
          <>
            {order.id} · {order.customerName}의 주문을 취소합니다.
            <br />
            취소한 주문은 되돌릴 수 없고 목록의 전체 칩에서만 보입니다.
          </>
        }
        onConfirm={() => {
          onCancel();
          setCancelOpen(false);
        }}
      />
    </Panel>
  );
}
