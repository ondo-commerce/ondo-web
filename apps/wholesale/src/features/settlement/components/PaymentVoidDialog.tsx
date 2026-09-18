"use client";

import { Button, Dialog, FormField, Textarea } from "@ondo/ui";
import { useId, useState } from "react";
import { useVoidPaymentMutation } from "../api/mutations";
import { PAYMENT_VOID_REASON_MAX } from "../constants";
import { canVoid, paymentVoidErrorText, toPaymentVoidRequest } from "../derive";
import type { LedgerRowView, PaymentVoided } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 입금 취소 확인 + 사유(`POST /payments/{id}/void`, 사유 필수).
 *
 * 취소는 **되돌릴 수 없다**(스펙: 필요하면 입금을 새로 등록한다) — 그 입금에서 나간 배분이 전부 풀려 주문 미수가
 * 다시 생기고, 남았던 선수금도 사라진다. 그래서 계좌 삭제처럼 한 번 막고, 빨강은 이 마지막 확인에만 쓴다.
 *
 * 열릴 때마다 새로 만들어진다(부모가 대상이 있을 때만 그린다) — 사유가 이전 입금 것으로 남지 않는다.
 * `onDone`은 훅 옵션이다: 재조회로 원장이 다시 그려지며 이 다이얼로그가 내려가도 부모에게 결과가 간다.
 */
export function PaymentVoidDialog({
  row,
  retailerId,
  onClose,
  onDone,
}: {
  /** 취소할 입금 줄. `paymentId`가 있는 `PAYMENT` 줄만 온다 */
  row: LedgerRowView;
  retailerId: number;
  onClose: () => void;
  onDone: (voided: PaymentVoided, refreshed: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const cancel = useVoidPaymentMutation({
    onDone: (voided, refreshed) => {
      onClose();
      onDone(voided, refreshed);
    },
  });
  const error = cancel.error ? paymentVoidErrorText(cancel.error) : null;
  const overMax = reason.trim().length > PAYMENT_VOID_REASON_MAX;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Content>
        <Dialog.Title>입금 취소</Dialog.Title>
        <Dialog.Description asChild>
          <div>
            {row.date} 입금{" "}
            <b className="text-foreground">{formatNumber(row.amount)}원</b>을
            취소합니다. 이 입금으로 붙인 배분이 전부 풀리고 미수가 다시
            생깁니다.
            <br />
            <b className="text-foreground">되돌릴 수 없습니다.</b>
          </div>
        </Dialog.Description>

        <FormField
          label="취소 사유"
          htmlFor={reasonId}
          required
          className="mt-4"
          hint={
            overMax
              ? `${PAYMENT_VOID_REASON_MAX}자까지 적을 수 있어요`
              : undefined
          }
        >
          <Textarea
            id={reasonId}
            placeholder="이중 입금"
            value={reason}
            aria-invalid={overMax}
            disabled={cancel.isPending}
            onChange={(e) => {
              if (cancel.error) cancel.reset();
              setReason(e.target.value);
            }}
          />
        </FormField>

        {error ? (
          <p role="alert" className="text-destructive-strong text-sm">
            {error}
          </p>
        ) : null}

        <Dialog.Footer>
          <Button type="button" variant="line" onClick={onClose}>
            닫기
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={
              !canVoid(reason) || row.paymentId === null || cancel.isPending
            }
            onClick={() => {
              if (row.paymentId === null) return;
              cancel.mutate({
                paymentId: row.paymentId,
                retailerId,
                body: toPaymentVoidRequest(reason),
              });
            }}
          >
            {cancel.isPending ? "취소 중…" : "입금 취소"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
