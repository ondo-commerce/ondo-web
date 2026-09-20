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
  hiddenInputCount,
  toConfirmRequest,
  toPackingRequest,
  totalShipQty,
} from "../derive";
import type { LineFilter, OrderView, ShipInputs } from "../types";
import { formatNumber } from "@/shared/lib/format";
import { useSingleFlight } from "@/shared/lib/useSingleFlight";

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
 *
 * 색상·사이즈 필터로 **가려진 라인의 입력은 요청에 안 실린다**(derive.sentShipQty).
 * 그런 입력이 남아 있으면 확정·포장을 잠그고 몇 줄인지 보인다 — 필터를 풀면 그대로
 * 살아 있으니 사장이 본 뒤에 보내면 된다. 조용히 버리면 색상별로 번갈아 적은 값이
 * 사라진다(F10).
 */
export function OrderActionBar({
  order,
  inputs,
  filter,
  onDone,
}: {
  order: OrderView;
  /** 라인 id → 입력 문자열. 확정 다이얼로그의 미송 예고와 요청 본문을 만든다 */
  inputs: ShipInputs;
  /** 라인 표와 같은 필터. 요청·미리보기·합계가 보이는 라인만 읽게 한다 */
  filter: LineFilter;
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

  /* `포장 준비`만 다이얼로그 없이 바로 나간다 — 더블클릭이 두 건 되지 않게 동기 잠금 */
  const fire = useSingleFlight();

  const busy = confirm.isPending || cancel.isPending || pack.isPending;
  /* 마지막으로 실패한 것 하나만 보인다. 다음 시도에서 지워진다 */
  const failure = confirm.error ?? cancel.error ?? pack.error;

  const preview = backorderPreview(order, inputs, filter);
  const hidden = hiddenInputCount(order, inputs, filter);
  /* 가려진 입력이 있는 동안은 입력을 먹는 버튼을 잠근다. 취소는 입력과 무관해 그대로 */
  const locked = busy || hidden > 0;

  return (
    <div className="flex items-center gap-3">
      {hidden > 0 ? (
        <p role="status" className="text-destructive-strong text-sm">
          필터로 가려진 라인 {hidden}줄에 입력이 있습니다. 필터를 풀고 확인해
          주세요.
        </p>
      ) : failure ? (
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
          <Button disabled={locked} onClick={() => setConfirmOpen(true)}>
            주문 확정
          </Button>
        ) : null}
        {/* 확정된 주문의 잔량을 나눠 담는 자리. 아무것도 안 적었으면 담을 것이 없다 */}
        {order.isPackable ? (
          <Button
            disabled={locked || totalShipQty(order, inputs, filter) === 0}
            onClick={() =>
              fire((release) =>
                pack.mutate(toPackingRequest(order, inputs, filter), {
                  onSettled: release,
                }),
              )
            }
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
          confirm.mutate(toConfirmRequest(order, inputs, filter));
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
