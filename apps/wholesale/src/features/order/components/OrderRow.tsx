"use client";

import { Badge, Table } from "@ondo/ui";
import type { ReactNode } from "react";
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
 * 목록 행 하나 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다.
 * 여기 남은 것은 **이 탭의 열이 무엇인가**뿐이다.
 *
 * 펼쳐진 행은 배지가 평문으로 바뀐다 — 지금 보고 있는 행이므로 상태를 색으로
 * 다시 강조할 이유가 없다(배경이 이미 회색으로 바뀐다).
 */
export function OrderRow({
  order,
  open,
  onToggle,
  children,
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  /** 펼침 영역에 들어가는 내용 */
  children: ReactNode;
}) {
  const statusLabel = ORDER_STATUS_LABEL[order.status];
  const settlementLabel = SETTLEMENT_STATUS_LABEL[order.settlementStatus];

  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 8 = 펼침 열 + 목록 7열 */
      colSpan={8}
      label={order.id}
      detailId={`order-detail-${order.id}`}
      detail={children}
    >
      <Table.Td align="left">{order.id}</Table.Td>
      <Table.Td align="left" tone="muted">
        {order.placedAt}
      </Table.Td>
      <Table.Td align="left">{order.customerName}</Table.Td>
      <Table.Td align="left">{orderProductSummary(order)}</Table.Td>
      <Table.Td>{formatNumber(orderAmount(order))}</Table.Td>
      <Table.Td align="center">
        {open ? (
          statusLabel
        ) : (
          <Badge tone={orderStatusTone(order.status)}>{statusLabel}</Badge>
        )}
      </Table.Td>
      <Table.Td align="center">
        {open ? (
          settlementLabel
        ) : (
          <Badge tone={settlementStatusTone(order.settlementStatus)}>
            {settlementLabel}
          </Badge>
        )}
      </Table.Td>
    </Table.ExpandableRow>
  );
}
