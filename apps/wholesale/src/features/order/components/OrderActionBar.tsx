"use client";

import { Button } from "@ondo/ui";
import { useState } from "react";
import { OrderConfirmDialog } from "./OrderConfirmDialog";
import { backorderPreview, totalShipQty } from "../derive";
import type { Order } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 라인 표 바로 아래 액션 줄.
 *
 * **`이번 출고` 입력을 먹는 액션은 전부 여기 있다.** 원래는 `주문 확정`이 우측 카드에,
 * `포장 준비`가 여기에 있었다 — 같은 입력을 읽는 버튼 두 개가 화면 반대편에 하나씩
 * 있어서 무엇이 무엇을 반영하는지 읽히지 않았고, 그것 때문에 입력값 상태를
 * `OrderListView`까지 끌어올려야 했다.
 *
 * 국면이 겹치지 않아서 자리 하나를 돌려쓴다:
 *   PLACED                        → 주문 확정 · 주문 취소
 *   CONFIRMED / PARTIALLY_SHIPPED → 포장 준비
 *   SHIPPED / CANCELED            → 부르는 쪽에서 아예 안 그린다(derive.isEditablePhase)
 *
 * 확정이 라인 표 아래로 내려온 덕에 **라인을 안 보고 확정할 수 없다.** 확정은 되돌릴 수 없고
 * 입력하지 않은 잔량이 전부 미송으로 굳기 때문에, 보고 나서 누르는 게 맞는 순서다.
 */
export function OrderActionBar({
  order,
  inputs,
  onConfirm,
  onCancel,
  onPack,
}: {
  order: Order;
  /** 라인 id → 입력 문자열. 확정 다이얼로그의 미송 예고와 포장 준비 활성 여부를 만든다 */
  inputs: Readonly<Record<string, string>>;
  onConfirm: () => void;
  onCancel: () => void;
  onPack: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  /* 확정·취소는 신규 주문에만 붙는다. 한 번 지나간 주문에는 다시 나타나지 않는다 */
  if (order.status === "PLACED") {
    const preview = backorderPreview(order, inputs);

    return (
      <>
        {/* 카드에 있을 때는 좁은 패널이라 가로 2등분이었다. 여기는 폭이 넉넉해서
            글자 폭으로 두고 오른쪽에 붙인다(라인 표 footer가 justify-end다) */}
        <div className="flex gap-2">
          <Button variant="line" onClick={() => setCancelOpen(true)}>
            주문 취소
          </Button>
          <Button onClick={() => setConfirmOpen(true)}>주문 확정</Button>
        </div>

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
      </>
    );
  }

  /* 확정된 주문의 잔량을 나눠 담는 자리. 아무것도 안 적었으면 담을 것이 없다 */
  return (
    <Button disabled={totalShipQty(order, inputs) === 0} onClick={onPack}>
      포장 준비
    </Button>
  );
}
