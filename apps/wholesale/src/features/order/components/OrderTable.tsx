"use client";

import { Badge, Table } from "@ondo/ui";
import { ORDER_STATUS_LABEL, SETTLEMENT_STATUS_LABEL } from "../constants";
import {
  orderAmount,
  orderProductSummary,
  orderStatusTone,
  settlementStatusTone,
} from "../derive";
import type { Order } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 주문 목록 표 7열 + 맨 앞의 펼침 열.
 *
 * 첫 열은 머리글이 없다 — chevron만 들어가는 자리라 이름 붙일 값이 없다.
 * 펼침 동작 자체는 다음 이슈에서 이 열에 붙는다.
 *
 * 금액·수량은 우측 정렬 숫자(Table.Td 기본값)이고, 글자 열만 align="left"로 되돌린다.
 */
export function OrderTable({ orders }: { orders: readonly Order[] }) {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th className="w-8" />
          <Table.Th align="left">주문 번호</Table.Th>
          <Table.Th align="left">주문 일시</Table.Th>
          <Table.Th align="left">거래처</Table.Th>
          <Table.Th align="left">상품명</Table.Th>
          <Table.Th>주문금액</Table.Th>
          <Table.Th align="center">주문 상태</Table.Th>
          <Table.Th align="center">정산 상태</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {orders.map((order) => (
          <Table.Row key={order.id}>
            <Table.Td />
            <Table.Td align="left">{order.id}</Table.Td>
            <Table.Td align="left" tone="muted">
              {order.placedAt}
            </Table.Td>
            <Table.Td align="left">{order.customerName}</Table.Td>
            <Table.Td align="left">{orderProductSummary(order)}</Table.Td>
            <Table.Td>{formatNumber(orderAmount(order))}</Table.Td>
            <Table.Td align="center">
              <Badge tone={orderStatusTone(order.status)}>
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
            </Table.Td>
            <Table.Td align="center">
              <Badge tone={settlementStatusTone(order.settlementStatus)}>
                {SETTLEMENT_STATUS_LABEL[order.settlementStatus]}
              </Badge>
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
