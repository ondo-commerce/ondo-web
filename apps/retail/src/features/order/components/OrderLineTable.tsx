"use client";

import { IconButton, Table } from "@ondo/ui";
import { Heart } from "lucide-react";
import { LineStatusBadge } from "./OrderStatusBadge";
import { DETAIL_TEXT } from "../constants";
import {
  formatSheets,
  formatWon,
  lineStatusNote,
  orderLineAmount,
  orderTotals,
} from "../derive";
import type { OrderRecord } from "../types";

/**
 * 주문 상품 표.
 *
 * `<tfoot>` 합계가 **행에서 파생된다** — 원본은 합계가 517,000원인데 행 합이
 * 618,000원이었다(§6에 없던 새 결함). 두 자리가 다른 상수를 읽지 않는다.
 *
 * 라인 둘째 줄(`직접 수령 · 디오트 지하 1층 12호`)의 주소는 **도매처 건에서**
 * 온다. 원본은 이 자리와 `결제 · 수령` 패널이 서로 다른 주소를 적고 있었다 —
 * 사입삼촌에게 넘길 주소라 한 곳에서 나와야 한다(가정 A5-e).
 *
 * 찜 하트는 **눌린 대로 바뀌고**(`aria-pressed`·라벨·아이콘 모두) 상품 상세와
 * 같은 집합을 읽는다. 화면을 떠났다 와도 끈 사실이 남는다.
 */
export function OrderLineTable({
  order,
  favorites,
  onToggleFavorite,
}: {
  order: OrderRecord;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
}) {
  const totals = orderTotals(order);

  return (
    <Table>
      <caption className="sr-only">
        {order.orderId} 주문의 상품별 수량·단가·상태
      </caption>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">상품</Table.Th>
          <Table.Th align="left">옵션</Table.Th>
          <Table.Th align="left">도매처</Table.Th>
          <Table.Th>수량</Table.Th>
          <Table.Th>단가</Table.Th>
          <Table.Th>소계</Table.Th>
          <Table.Th align="center">상태</Table.Th>
          <Table.Th align="center">
            <span className="sr-only">찜</span>
          </Table.Th>
        </Table.Row>
      </Table.Head>

      <Table.Body>
        {order.lines.map((line) => {
          const leg = order.legs.find(
            (it) => it.wholesalerId === line.wholesalerId,
          );
          const note = lineStatusNote(line, leg);
          const favorited = favorites.has(line.productId);

          return (
            <Table.Row key={line.lineId}>
              <Table.Td align="left">{line.productName}</Table.Td>
              <Table.Td align="left">
                {line.colorLabel} · {line.size}
              </Table.Td>
              <Table.Td align="left">{leg?.wholesalerName ?? ""}</Table.Td>
              <Table.Td>{formatSheets(line.qty)}</Table.Td>
              <Table.Td>{formatWon(line.price)}</Table.Td>
              <Table.Td>{formatWon(orderLineAmount(line))}</Table.Td>
              <Table.Td align="center">
                <LineStatusBadge status={line.status} />
                {note ? (
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {note}
                  </span>
                ) : null}
              </Table.Td>
              <Table.Td align="center">
                <IconButton
                  variant="ghost"
                  aria-pressed={favorited}
                  aria-label={`${line.productName} ${favorited ? "찜 해제" : "찜하기"}`}
                  onClick={() => onToggleFavorite(line.productId)}
                >
                  <Heart
                    aria-hidden
                    fill={favorited ? "currentColor" : "none"}
                    className={favorited ? "text-foreground" : undefined}
                  />
                </IconButton>
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>

      <tfoot>
        <Table.Row>
          <Table.Td align="left" colSpan={3} className="font-medium">
            {DETAIL_TEXT.total}
          </Table.Td>
          <Table.Td className="font-medium">
            {formatSheets(totals.sheets)}
          </Table.Td>
          <Table.Td />
          <Table.Td className="font-medium">
            {formatWon(totals.amount)}
          </Table.Td>
          <Table.Td colSpan={2} />
        </Table.Row>
      </tfoot>
    </Table>
  );
}
