"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { OrderRow } from "./OrderRow";
import type { Order } from "../types";

/**
 * 주문 목록 표 7열 + 맨 앞의 펼침 열.
 *
 * 첫 열은 머리글이 없다 — chevron만 들어가는 자리라 이름 붙일 값이 없다.
 * 행 하나를 그리는 책임은 `OrderRow`에 있다(펼침 영역이 두 번째 `<tr>`이라
 * 이 파일에서 행을 직접 그리면 `<tbody>` 자식 구조가 읽히지 않는다).
 *
 * 금액·수량은 우측 정렬 숫자(Table.Td 기본값)이고, 글자 열만 align="left"로 되돌린다.
 *
 * `stickyHead`를 켠다 — 주문이 75건이라 아래로 내리면 머리글이 사라져서 지금 보는 숫자가
 * 주문금액인지 수량인지 놓친다. 대신 **이 표는 세로 스크롤을 직접 받는다**:
 * 부르는 쪽이 `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function OrderTable({
  orders,
  openOrderId,
  onToggle,
  renderDetail,
}: {
  orders: readonly Order[];
  openOrderId: string | null;
  onToggle: (orderId: string) => void;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (order: Order) => ReactNode;
}) {
  return (
    <Table stickyHead>
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
        {orders.map((order) => {
          const open = openOrderId === order.id;
          return (
            <OrderRow
              key={order.id}
              order={order}
              open={open}
              onToggle={() => onToggle(order.id)}
            >
              {open ? renderDetail(order) : null}
            </OrderRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}
