"use client";

import { Button, Dialog, IconButton, Notice, Table } from "@ondo/ui";
import { Info, Printer, X } from "lucide-react";
import Link from "next/link";
import { DescList, DescRow } from "./PaymentSummary";
import {
  DETAIL_TEXT,
  PICKUP_LABEL,
  SHIPMENT_PACKED,
  STATEMENT_TEXT,
  STATEMENT_UNPAID_NONE,
} from "../constants";
import {
  formatSheets,
  formatWon,
  isShipped,
  lineAmount,
  shipmentAmount,
  unpaidAfter,
} from "../derive";
import type { OrderRecord, Shipment } from "../types";

/**
 * 거래명세서(장끼) 모달. 값은 상세 응답의 `Outbound` 하나다.
 *
 * **문서를 고칠 수 있는 입력칸이 하나도 없다**(RT-54). 시스템이 출고할 때
 * 자동으로 만든 문서라 다시 볼 수만 있다. `인쇄`·`저장`은 확정 와이어프레임이
 * 잠가 둔 자리라 그대로 두되, **왜 못 누르는지를 글자로 옆에 둔다**.
 *
 * 단가·금액은 장끼 품목에 없어서(스펙 `OutboundItem`) 주문 라인에서 찾아 채운
 * 값이다. 못 찾은 줄은 `—`이고 그 장끼의 합계·미수도 `—`다 — 틀린 숫자를 맞는
 * 것처럼 세우지 않는다.
 *
 * 미수 문구에 **`FIFO`라는 낱말이 없다**(§3-0 D). 입금 배정은 도매 사장이
 * 건별로 수기로 정하는 일이라, 배정이 없으면 사실만 적는다.
 */
export function StatementDialog({
  order,
  shipment,
  receiverStore,
  open,
  onOpenChange,
  onCloseFocus,
}: {
  order: OrderRecord;
  shipment: Shipment;
  /** 수신처 = 로그인한 소매 사장의 상호 */
  receiverStore: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * 닫은 뒤 포커스를 받을 자리. 조건부로 그려지는 모달이라 닫을 때 컴포넌트가
   * 먼저 사라져 Radix의 되돌리기가 돌지 못한다(F4).
   */
  onCloseFocus: () => void;
}) {
  const leg = order.legs.find(
    (it) => it.wholesalerId === shipment.wholesalerId,
  );
  const amount = shipmentAmount(shipment);
  const remaining = unpaidAfter(order, shipment.statementNo);
  const sheets = shipment.lines.reduce((sum, line) => sum + line.qty, 0);
  const won = (value: number | null) =>
    value === null ? STATEMENT_TEXT.priceUnknown : formatWon(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className="flex max-h-[85dvh] max-w-150 flex-col gap-0 p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
        }}
      >
        <div className="flex items-start gap-3 p-5 pb-0">
          <div className="min-w-0 flex-1">
            <Dialog.Title>
              {STATEMENT_TEXT.title}{" "}
              <span className="text-muted-foreground font-normal tabular-nums">
                {shipment.statementNo}
              </span>
            </Dialog.Title>
            <Dialog.Description className="text-body mt-1.5">
              {STATEMENT_TEXT.sub}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <IconButton variant="ghost" aria-label="닫기">
              <X aria-hidden />
            </IconButton>
          </Dialog.Close>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-5">
          <DescList>
            <DescRow term={STATEMENT_TEXT.issuer}>
              {leg?.wholesalerName ?? ""}
            </DescRow>
            <DescRow term={STATEMENT_TEXT.receiver}>{receiverStore}</DescRow>
            <DescRow term={STATEMENT_TEXT.shippedAt}>
              {shipment.shippedAt ?? SHIPMENT_PACKED}
            </DescRow>
            <DescRow term={STATEMENT_TEXT.receiverName}>
              {leg?.pickup === "AGENT" ? (
                <>
                  {order.agentName}{" "}
                  <span className="text-muted-foreground">
                    {PICKUP_LABEL.AGENT}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {PICKUP_LABEL.RETAILER}
                </span>
              )}
            </DescRow>
            {/* 통합 주문번호와 도매처별 연번이 **같이** 있다(RT-40) —
                도매처에 전화할 때 필요한 번호가 뒤쪽이다 */}
            <DescRow term={STATEMENT_TEXT.origin}>
              {order.orderNo}
              {leg ? ` · ${DETAIL_TEXT.legNo(leg.legNo)}` : ""}
            </DescRow>
          </DescList>

          <div className="bg-border my-3.5 h-px" />

          <Table>
            <caption className="sr-only">
              {shipment.statementNo} 거래명세서의 품목
            </caption>
            <Table.Head>
              <Table.Row>
                <Table.Th align="left">상품</Table.Th>
                <Table.Th align="left">옵션</Table.Th>
                <Table.Th>수량</Table.Th>
                <Table.Th>단가</Table.Th>
                <Table.Th>금액</Table.Th>
              </Table.Row>
            </Table.Head>

            <Table.Body>
              {shipment.lines.map((line) => (
                <Table.Row
                  key={`${line.productName}-${line.colorLabel}-${line.size}`}
                >
                  <Table.Td align="left">{line.productName}</Table.Td>
                  <Table.Td align="left">
                    {line.colorLabel} · {line.size}
                  </Table.Td>
                  <Table.Td>{formatSheets(line.qty)}</Table.Td>
                  <Table.Td>
                    {won(line.priceKnown ? line.price : null)}
                  </Table.Td>
                  <Table.Td>
                    {won(line.priceKnown ? lineAmount(line) : null)}
                  </Table.Td>
                </Table.Row>
              ))}
            </Table.Body>

            <tfoot>
              <Table.Row>
                <Table.Td align="left" colSpan={2} className="font-medium">
                  합계
                </Table.Td>
                <Table.Td className="font-medium">
                  {formatSheets(sheets)}
                </Table.Td>
                <Table.Td />
                <Table.Td className="font-medium">{won(amount)}</Table.Td>
              </Table.Row>
            </tfoot>
          </Table>

          {/* 미수는 출고 시점에 생긴다(RT-64). **아직 안 나간 장끼**(포장만 끝남)면
              생긴 미수가 없으니 이 줄이 없고, 금액을 모르는 장끼도 아예 안 세운다 —
              `+—원이 생겼어요`는 읽을 수 없다. `unpaidAfter`도 같은 판정으로 null을
              주지만, 왜 없는지가 여기서 읽히게 `isShipped`를 같이 본다 */}
          {isShipped(shipment) && amount !== null && remaining !== null ? (
            <Notice className="mt-3.5">
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  이 출고로 미수{" "}
                  <b className="font-medium tabular-nums">
                    +{formatWon(amount)}
                  </b>
                  이 생겼어요 · {STATEMENT_UNPAID_NONE} · 남은 미수{" "}
                  <b className="font-medium tabular-nums">
                    {formatWon(remaining)}
                  </b>
                </span>
              </span>
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 p-5 pt-0">
          {/* 잠긴 버튼 옆에 이유가 글자로 있다 */}
          <p className="text-muted-foreground text-body mr-auto phone:mr-0 phone:w-full">
            {STATEMENT_TEXT.disabledReason}
          </p>
          <Button variant="soft" disabled>
            <Printer aria-hidden className="size-4" />
            {STATEMENT_TEXT.print}
          </Button>
          <Button variant="soft" disabled>
            {STATEMENT_TEXT.save}
          </Button>
          <Button asChild variant="line">
            <Link href="/settlements">{STATEMENT_TEXT.toSettlement}</Link>
          </Button>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
