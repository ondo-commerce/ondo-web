"use client";

import { Button } from "@ondo/ui";
import { useState } from "react";
import { OrderConfirmDialog } from "./OrderConfirmDialog";
import {
  useCancelOrderMutation,
  useConfirmOrderMutation,
  useCreatePackingMutation,
} from "../api/mutations";
import {
  actionErrorText,
  backorderPreview,
  toConfirmRequest,
  toPackingRequest,
  totalShipQty,
} from "../derive";
import type { OrderView, ShipInputs } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 라인 표 바로 아래 액션 줄.
 *
 * **`이번 출고` 입력을 먹는 액션은 전부 여기 있다.** 같은 입력을 읽는 버튼이 화면
 * 반대편에 하나씩 있으면 무엇이 무엇을 반영하는지 읽히지 않는다.
 *
 * 어느 버튼이 뜨는지는 **서버 boolean이 정한다**(스펙: "버튼 노출은 `isConfirmable` ·
 * `isCancellable` · `isPackable`로만 판단"). 상태 코드로 가르지 않는다 —
 * 서버가 출고 진행도를 합쳐 5상태를 만들기 때문에 화면이 같은 규칙을 다시 쓰면 어긋난다.
 *   isConfirmable / isCancellable → 주문 확정 · 주문 취소 (신규)
 *   isPackable                     → 포장 준비 (확정·부분 출고 잔량)
 *   둘 다 아니면 부르는 쪽이 아예 안 그린다(derive.canAllocate)
 *
 * 거절되면(`TRANSITION_NOT_ALLOWED`·`ALLOCATION_EXCEEDS_ORDER` …) 버튼 왼쪽에 사유 한 줄.
 * 확정이 라인 표 아래에 있는 덕에 **라인을 안 보고 확정할 수 없다.**
 */
export function OrderActionBar({
  order,
  inputs,
  onDone,
}: {
  order: OrderView;
  /** 라인 id → 입력 문자열. 확정 다이얼로그의 미송 예고와 요청 본문을 만든다 */
  inputs: ShipInputs;
  /** 서버가 받아 준 뒤. 입력값을 비우는 자리 */
  onDone: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  /* 입력 비우기는 훅 옵션으로 — 성공 응답이 캐시에 들어가면 이 줄이 사라질 수 있어서
     호출별 콜백은 안 돈다(mutations.ts `MutationDone` 주석) */
  const confirm = useConfirmOrderMutation(order.id, { onDone });
  const cancel = useCancelOrderMutation(order.id, { onDone });
  const pack = useCreatePackingMutation(order.id, { onDone });

  const busy = confirm.isPending || cancel.isPending || pack.isPending;
  /* 마지막으로 실패한 것 하나만 보인다. 다음 시도에서 지워진다 */
  const failure = confirm.error ?? cancel.error ?? pack.error;

  const preview = backorderPreview(order, inputs);

  return (
    <div className="flex items-center gap-3">
      {failure ? (
        <p role="alert" className="text-destructive-strong text-sm">
          {actionErrorText(failure)}
        </p>
      ) : null}

      <div className="flex gap-2">
        {order.isCancellable ? (
          <Button
            variant="line"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
          >
            주문 취소
          </Button>
        ) : null}
        {order.isConfirmable ? (
          <Button disabled={busy} onClick={() => setConfirmOpen(true)}>
            주문 확정
          </Button>
        ) : null}
        {/* 확정된 주문의 잔량을 나눠 담는 자리. 아무것도 안 적었으면 담을 것이 없다 */}
        {order.isPackable ? (
          <Button
            disabled={busy || totalShipQty(order, inputs) === 0}
            onClick={() => pack.mutate(toPackingRequest(order, inputs))}
          >
            포장 준비
          </Button>
        ) : null}
      </div>

      <OrderConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="주문 확정"
        confirmLabel="주문 확정"
        description={
          <>
            주문 {order.orderNumber} · {order.retailerName}의 주문을 확정합니다.
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
          setConfirmOpen(false);
          confirm.mutate(toConfirmRequest(order, inputs));
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
            주문 {order.orderNumber} · {order.retailerName}의 주문을 취소합니다.
            <br />
            취소한 주문은 되돌릴 수 없고 목록의 전체 칩에서만 보입니다.
          </>
        }
        onConfirm={() => {
          setCancelOpen(false);
          cancel.mutate();
        }}
      />
    </div>
  );
}
