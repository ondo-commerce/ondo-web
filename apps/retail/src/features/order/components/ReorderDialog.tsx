"use client";

import { Button, Dialog, IconButton, Notice, Table } from "@ondo/ui";
import { Info, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ReorderResultBadge } from "./OrderStatusBadge";
import { REORDER_TEXT, reorderAddedNotice } from "../constants";
import {
  formatSheets,
  formatWon,
  isReorderAddable,
  reorderPrice,
  reorderSummary,
} from "../derive";
import type { OrderLine, OrderRecord } from "../types";

/**
 * 다시 주문 확인 모달.
 *
 * **담기 전에 무엇이 담기고 무엇이 빠지는지 먼저 보여 준다.** 되돌릴 수 없는
 * 실행은 아니지만(장바구니에서 다시 뺄 수 있다) 값이 오른 상품이 조용히
 * 지금 가격으로 들어가는 것이 문제라, 오른 줄만 `18,000원 → 19,000원`을
 * 붙여 둔다.
 *
 * `<tfoot>`의 `30장 · 2건 / 5건`은 **표의 실제 행에서 파생된다.** 판정 자체는
 * 서버에 없어서 더미가 갖고 있지만(가정 A7) 세는 코드는 서버가 붙어도 남는다.
 *
 * 담은 **뒤에** `장바구니에 N개 조합을 담았어요`가 뜬다 — 아직 안 한 일을
 * 완료형으로 말하지 않는다(직전 회차 F12).
 */
export function ReorderDialog({
  order,
  open,
  onOpenChange,
  onCloseFocus,
  onAdd,
}: {
  order: OrderRecord;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * 닫은 뒤 포커스를 받을 자리를 부르는 쪽이 정한다.
   *
   * 누른 버튼이 있으니 Radix 기본값으로 충분할 것 같지만 **아니다**(F4).
   * 부르는 쪽이 `{열렸나 ? <ReorderDialog/> : null}`로 그리기 때문에,
   * `onOpenChange(false)`가 상태를 지우는 순간 이 컴포넌트가 먼저 사라져
   * Radix의 되돌리기가 돌 기회를 잃는다. 그러면 표 안의 버튼을 눌러 연
   * 키보드 사용자가 닫은 뒤 표 맨 위부터 Tab을 다시 밟아야 한다(WCAG 2.4.3).
   */
  onCloseFocus: () => void;
  /** 담을 수 있는 줄. 장바구니에 넣는 것은 조립부가 한다(가정 A10) */
  onAdd: (lines: readonly OrderLine[]) => void;
}) {
  const [added, setAdded] = useState<number | null>(null);

  const summary = reorderSummary(order.lines);
  const addable = order.lines.filter(isReorderAddable);

  const handleAdd = () => {
    onAdd(addable);
    setAdded(addable.length);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        /* 닫을 때 결과를 지운다 — 다시 열었을 때 지난번 "담았어요"가 남아
           있으면 이번에 담은 것으로 읽힌다 */
        if (!next) setAdded(null);
        onOpenChange(next);
      }}
    >
      <Dialog.Content
        className="flex max-h-[85dvh] max-w-140 flex-col gap-0 p-0"
        /* Radix의 기본 되돌리기를 막고 우리가 정한 자리로 보낸다 —
           기본값보다 늦게 도는 처리라 여기서 하지 않으면 덮인다 */
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
        }}
      >
        <div className="flex items-start gap-3 p-5 pb-0">
          <div className="min-w-0 flex-1">
            <Dialog.Title>{REORDER_TEXT.title}</Dialog.Title>
            <Dialog.Description className="text-body mt-1.5">
              {REORDER_TEXT.sub}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <IconButton variant="ghost" aria-label="닫기">
              <X aria-hidden />
            </IconButton>
          </Dialog.Close>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-5">
          <Table>
            {/* 표가 여럿인 화면이라 어느 표의 숫자인지 표 안에서 읽혀야 한다 */}
            <caption className="sr-only">
              {order.orderId} 주문을 다시 담을 때의 상품별 결과
            </caption>
            <Table.Head>
              <Table.Row>
                <Table.Th align="left">상품 · 옵션</Table.Th>
                <Table.Th align="left">도매처</Table.Th>
                <Table.Th>수량</Table.Th>
                <Table.Th align="center">결과</Table.Th>
              </Table.Row>
            </Table.Head>

            <Table.Body>
              {order.lines.map((line) => {
                const result = line.reorder ?? "ADDED";
                const leg = order.legs.find(
                  (l) => l.wholesalerId === line.wholesalerId,
                );

                return (
                  <Table.Row key={line.lineId}>
                    <Table.Td align="left">
                      {line.productName}{" "}
                      <span className="text-muted-foreground">
                        {line.colorLabel} · {line.size}
                      </span>
                    </Table.Td>
                    <Table.Td align="left">
                      {leg?.wholesalerName ?? ""}
                    </Table.Td>
                    <Table.Td>{formatSheets(line.qty)}</Table.Td>
                    <Table.Td align="center">
                      <ReorderResultBadge result={result} />
                      {/* 오른 줄에만 붙는다. 안 오른 줄에 붙으면 전부 오른 줄로 읽힌다 */}
                      {result === "PRICE_UP" ? (
                        <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
                          {formatWon(line.price)} →{" "}
                          {formatWon(reorderPrice(line))}
                        </span>
                      ) : null}
                    </Table.Td>
                  </Table.Row>
                );
              })}
            </Table.Body>

            <tfoot>
              <Table.Row>
                <Table.Td align="left" colSpan={2} className="font-medium">
                  {REORDER_TEXT.addable}
                </Table.Td>
                <Table.Td className="font-medium">
                  {formatSheets(summary.sheets)}
                </Table.Td>
                <Table.Td align="center" className="font-medium">
                  {summary.addable}건 / {summary.total}건
                </Table.Td>
              </Table.Row>
            </tfoot>
          </Table>

          <Notice className="mt-3">
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {REORDER_TEXT.notice}
            </span>
          </Notice>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 p-5 pt-0">
          {/* 결과와 이유가 같은 자리에서 바뀐다. role=status라 낭독기도 듣는다 */}
          <p
            role="status"
            className="text-secondary-foreground text-body mr-auto phone:mr-0 phone:w-full"
          >
            {added !== null
              ? reorderAddedNotice(added)
              : summary.addable === 0
                ? REORDER_TEXT.blocked
                : ""}
          </p>

          <Dialog.Close asChild>
            <Button variant="line">{REORDER_TEXT.cancel}</Button>
          </Dialog.Close>

          {/* 담은 뒤에는 같은 버튼을 또 누를 이유가 없다 — 다음 행동으로 바꾼다 */}
          {added === null ? (
            <Button disabled={summary.addable === 0} onClick={handleAdd}>
              {REORDER_TEXT.submit}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/cart">{REORDER_TEXT.toCart}</Link>
            </Button>
          )}
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
