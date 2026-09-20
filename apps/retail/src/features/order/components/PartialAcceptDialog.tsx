"use client";

import { Button, Dialog, IconButton, Notice } from "@ondo/ui";
import { Info, X } from "lucide-react";
import Link from "next/link";
import { AcceptStatusBadge } from "./OrderStatusBadge";
import { ORDER_PATH, PARTIAL_TEXT } from "../constants";
import { comboSheetsLabel, formatWon, legLines, totalsOf } from "../derive";
import type { OrderRecord, RejectedLeg } from "../types";

/**
 * 일부 도매처에서 접수가 안 됐을 때의 모달.
 *
 * **`실패`라는 낱말이 제목·본문·버튼 어디에도 없다**(RT-43). 다시 시도하면 되는
 * 일을 실패라고 부르면 사장이 주문 전체가 날아갔다고 읽는다.
 *
 * 된 것(상세 응답의 도매처 건)과 안 된 것(접수 응답에서 남긴 것)을 **한 화면에**
 * 같이 둔다. 안 된 것만 보여 주면 무엇이 살아 있는지 확인하러 다른 화면으로
 * 나가야 한다. 안 된 도매처는 주문에 안 만들어져 조합·장수·금액이 없다 —
 * 서버가 준 사유 한 줄만 선다.
 *
 * `안 된 건만 다시 주문서로`는 **링크다** — 안 된 도매처의 조합만 실은 주문서로
 * 간다. 서버 없이 "다시 보냈다"고 단정하지 않는다.
 */
export function PartialAcceptDialog({
  order,
  rejected,
  open,
  onOpenChange,
  onCloseFocus,
}: {
  order: OrderRecord;
  rejected: readonly RejectedLeg[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * 닫은 뒤 포커스를 받을 자리를 부르는 쪽이 정한다.
   *
   * **이 모달은 누른 버튼이 없다** — 접수 결과에 안 된 건이 있으면 화면이
   * 열리자마자 뜬다. Radix는 열기 전에 포커스가 있던 곳으로 되돌리는데 그
   * 자리가 방금 떠나온 주문서라 `<body>`로 떨어진다(WCAG 2.4.3 · 직전 회차 F3).
   */
  onCloseFocus: () => void;
}) {
  const retryIds = rejected.flatMap((leg) => leg.cartItemIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 좁은 화면에서 모달이 화면 밖으로 나가지 않고 안에서 세로로 흐른다 */}
      <Dialog.Content
        className="flex max-h-[85dvh] max-w-130 flex-col gap-0 p-0"
        /* Radix의 기본 되돌리기를 막고 우리가 정한 자리로 보낸다 —
           기본값보다 늦게 도는 처리라 여기서 하지 않으면 덮인다 */
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
        }}
      >
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
          {order.legs.map((leg) => {
            const totals = totalsOf(legLines(order, leg.wholesalerId));

            return (
              <section
                key={leg.wholesaleOrderId}
                aria-label={`${leg.wholesalerName} 접수 결과`}
                className="border-border mt-3 overflow-hidden rounded-control border first:mt-0"
              >
                <div className="bg-accent text-body flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5">
                  <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
                  <AcceptStatusBadge accepted />
                  <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
                    <span className="text-muted-foreground">
                      {comboSheetsLabel(totals)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatWon(totals.amount)}
                    </span>
                  </span>
                </div>
              </section>
            );
          })}

          {rejected.map((leg) => (
            <section
              key={leg.wholesalerId}
              aria-label={`${leg.wholesalerName} 접수 결과`}
              className="border-border mt-3 overflow-hidden rounded-control border"
            >
              <div className="bg-accent text-body flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5">
                <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
                <AcceptStatusBadge accepted={false} />
              </div>

              {/* 안 된 쪽에만 사유가 붙는다. 왜 안 됐는지 없이 "안 됨"만
                  있으면 사장이 다시 시도할지 포기할지 정할 수 없다 */}
              <div className="border-border bg-accent text-body flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5">
                <span className="text-destructive-strong">{leg.message}</span>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="ml-auto phone:ml-0"
                >
                  <Link href="/cart">{PARTIAL_TEXT.viewInCart}</Link>
                </Button>
              </div>
            </section>
          ))}

          <Notice className="mt-3">
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                통합 주문번호{" "}
                <b className="font-medium tabular-nums">{order.orderNo}</b>{" "}
                {PARTIAL_TEXT.noticeTail}
              </span>
            </span>
          </Notice>
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0 phone:flex-col">
          <Button asChild variant="line">
            <Link href="/cart">{PARTIAL_TEXT.toCart}</Link>
          </Button>
          {/* 안 된 도매처의 조합을 모르면(새로고침 뒤 등) 갈 곳이 없다 — 그때는
              장바구니 버튼만 남긴다. 눌러도 빈 주문서로 가는 버튼을 두지 않는다 */}
          {retryIds.length > 0 ? (
            <Button asChild>
              <Link href={ORDER_PATH.checkout(retryIds)}>
                {PARTIAL_TEXT.retry}
              </Link>
            </Button>
          ) : null}
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
