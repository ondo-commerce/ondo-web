import { Table } from "@ondo/ui";
import { OrderStatusBadge, SettlementBadge } from "./StatusBadge";
import type { OrderRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 세그먼트 A — 거래처 하나의 주문별 정산 상태 표(`GET /orders?retailerId`).
 *
 * `정산 상태`와 `미수 잔액`은 **서버값**이다(`settlementStatus`·`outstandingAmount`).
 * 입금을 배분하면 재조회로 두 열이 함께 움직인다 — 화면에서 다시 계산하지 않는다.
 *
 * 행 순서는 서버 순서다. 배분 표만 FIFO(주문 일시 오래된 순)로 다시 정렬한다.
 */
export function SettlementStatusTable({
  orders,
  hasFilter,
}: {
  orders: readonly OrderRowView[];
  /** 정산 상태 필터가 걸려 있는가. 빈 이유(원래 없음 / 걸러짐)를 가른다 */
  hasFilter: boolean;
}) {
  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {hasFilter ? "조건에 맞는 주문이 없습니다" : "확정 주문이 없습니다"}
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
        {orders.map((order) => (
          <Table.Row key={order.id}>
            <Table.Td align="left">{order.orderNumber}</Table.Td>
            <Table.Td align="left" tone="muted">
              {order.orderedAt}
            </Table.Td>
            <Table.Td>{formatNumber(order.orderAmount)}</Table.Td>
            <Table.Td align="center">
              <OrderStatusBadge
                status={order.status}
                label={order.statusLabel}
              />
            </Table.Td>
            <Table.Td align="center">
              <SettlementBadge status={order.settlementStatus} />
            </Table.Td>
            {/* 0원은 회색으로 눕힌다 — 받을 돈이 남은 행만 눈에 걸려야 한다 */}
            <Table.Td tone={order.outstanding > 0 ? "default" : "muted"}>
              {formatNumber(order.outstanding)}
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
