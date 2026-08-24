import { Table } from "@ondo/ui";
import { FulfillmentBadge, SettlementBadge } from "./StatusBadge";
import { formatDateTime, orderReceivable, settlementStatus } from "../derive";
import type { SettlementOrder } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 세그먼트 A — 거래처 하나의 주문별 정산 상태 표.
 *
 * `정산 상태`와 `미수 잔액`은 fixtures에 적힌 값이 아니라 **배정액에서 계산한 값**이다.
 * 입금을 배분하면 두 열이 같은 계산으로 함께 움직여야 하기 때문이다.
 *
 * 행 순서는 주문 번호 순(=목록 순서)이다. 배분 표만 FIFO(주문 일시 오래된 순)로 다시 정렬한다.
 */
export function SettlementStatusTable({
  orders,
}: {
  orders: readonly SettlementOrder[];
}) {
  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        조건에 맞는 주문이 없습니다
      </p>
    );
  }

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">주문 번호</Table.Th>
          <Table.Th align="left">주문 일시</Table.Th>
          <Table.Th>주문 금액</Table.Th>
          <Table.Th align="center">주문 상태</Table.Th>
          <Table.Th align="center">정산 상태</Table.Th>
          <Table.Th>미수 잔액</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {orders.map((order) => {
          const receivable = orderReceivable(order);
          return (
            <Table.Row key={order.id}>
              <Table.Td align="left">{order.orderNo}</Table.Td>
              <Table.Td align="left" tone="muted">
                {formatDateTime(order.placedAt)}
              </Table.Td>
              <Table.Td>{formatNumber(order.totalAmount)}</Table.Td>
              <Table.Td align="center">
                <FulfillmentBadge status={order.fulfillmentStatus} />
              </Table.Td>
              <Table.Td align="center">
                <SettlementBadge status={settlementStatus(order)} />
              </Table.Td>
              {/* 0원은 회색으로 눕힌다 — 받을 돈이 남은 행만 눈에 걸려야 한다 */}
              <Table.Td tone={receivable > 0 ? "default" : "muted"}>
                {formatNumber(receivable)}
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
