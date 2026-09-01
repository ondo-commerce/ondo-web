"use client";

import { Button, Dialog, IconButton, Notice } from "@ondo/ui";
import { Info, X } from "lucide-react";
import Link from "next/link";
import { AcceptStatusBadge } from "./OrderStatusBadge";
import { PARTIAL_TEXT } from "../constants";
import { comboSheetsLabel, formatWon, totalsOf } from "../derive";
import type { OrderReceipt } from "../types";

/**
 * 일부 도매처에서 접수가 안 됐을 때의 모달.
 *
 * **`실패`라는 낱말이 제목·본문·버튼 어디에도 없다**(RT-43). 다시 시도하면 되는
 * 일을 실패라고 부르면 사장이 주문 전체가 날아갔다고 읽는다. 원본 파일 이름에만
 * 남아 있는 말이다.
 *
 * 된 것과 안 된 것을 **한 화면에** 같이 둔다. 안 된 것만 보여 주면 무엇이 살아
 * 있는지 확인하러 다른 화면으로 나가야 한다.
 *
 * `안 된 건만 다시 시도`는 **화면을 바꾼다** — 그 도매처가 `접수 확인 중…`으로
 * 넘어가고 모달이 닫힌다. 눌러도 그대로인 버튼을 만들지 않는다(직전 회차 F2).
 */
export function PartialAcceptDialog({
  receipt,
  open,
  onOpenChange,
  onRetry,
}: {
  receipt: OrderReceipt;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onRetry: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 좁은 화면에서 모달이 화면 밖으로 나가지 않고 안에서 세로로 흐른다 */}
      <Dialog.Content className="flex max-h-[85dvh] max-w-130 flex-col gap-0 p-0">
        <div className="flex items-start gap-3 p-5 pb-0">
          <div className="min-w-0 flex-1">
            <Dialog.Title>{PARTIAL_TEXT.title}</Dialog.Title>
            <Dialog.Description className="text-body mt-1.5">
              {PARTIAL_TEXT.sub}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <IconButton variant="ghost" aria-label="닫기">
              <X aria-hidden />
            </IconButton>
          </Dialog.Close>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-5">
          {receipt.legs.map((leg) => {
            const totals = totalsOf(leg.lines);

            return (
              <section
                key={leg.wholesalerId}
                aria-label={`${leg.wholesalerName} 접수 결과`}
                className="border-border mt-3 overflow-hidden rounded-control border first:mt-0"
              >
                <div className="bg-accent text-body flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5">
                  <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
                  <AcceptStatusBadge status={leg.status} />
                  <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
                    <span className="text-muted-foreground">
                      {comboSheetsLabel(totals)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatWon(totals.amount)}
                    </span>
                  </span>
                </div>

                {/* 안 된 쪽에만 사유가 붙는다. 왜 안 됐는지 없이 "안 됨"만
                    있으면 사장이 다시 시도할지 포기할지 정할 수 없다 */}
                {leg.rejectedReason ? (
                  <div className="border-border bg-accent text-body flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5">
                    <span className="text-destructive-strong">
                      {leg.rejectedReason}
                    </span>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="ml-auto phone:ml-0"
                    >
                      <Link href="/cart">{PARTIAL_TEXT.viewInCart}</Link>
                    </Button>
                  </div>
                ) : null}
              </section>
            );
          })}

          <Notice className="mt-3">
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                통합 주문번호{" "}
                <b className="font-medium tabular-nums">{receipt.orderNo}</b>{" "}
                {PARTIAL_TEXT.noticeTail}
              </span>
            </span>
          </Notice>
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0 phone:flex-col">
          <Button asChild variant="line">
            <Link href="/cart">{PARTIAL_TEXT.toCart}</Link>
          </Button>
          <Button onClick={onRetry}>{PARTIAL_TEXT.retry}</Button>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
