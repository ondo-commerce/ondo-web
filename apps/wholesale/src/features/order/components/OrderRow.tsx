"use client";

import { Badge, Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { ORDER_STATUS_LABEL, SETTLEMENT_STATUS_LABEL } from "../constants";
import { orderStatusTone, settlementStatusTone } from "../derive";
import type { OrderRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 목록 행 하나 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다.
 * 여기 남은 것은 **이 탭의 열이 무엇인가**뿐이다. 값은 전부 `OrderRowView`에 이미
 * 표시 문자열로 들어 있다(날짜·상품명 요약은 `derive`가 만든다).
 *
 * 펼쳐진 행도 배지를 그대로 둔다 — 아래 배지 칸 주석 참고.
 * 지금 보고 있는 행이라는 표시는 배경이 회색으로 바뀌는 것이 맡는다.
 */
export function OrderRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: OrderRowView;
  open: boolean;
  onToggle: () => void;
  /** 펼침 영역에 들어가는 내용 */
  children: ReactNode;
}) {
  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 8 = 펼침 열 + 목록 7열 */
      colSpan={8}
      label={`주문 ${row.orderNumber}`}
      detailId={`order-detail-${row.id}`}
      detail={children}
    >
      <Table.Td align="left">{row.orderNumber}</Table.Td>
      <Table.Td align="left" tone="muted">
        {row.orderedAt}
      </Table.Td>
      <Table.Td align="left">{row.retailerName}</Table.Td>
      <Table.Td align="left">{row.productSummary}</Table.Td>
      <Table.Td>{formatNumber(row.orderAmount)}</Table.Td>
      {/* 펼쳐도 배지를 그대로 둔다 — 상품 탭과 같은 이유(행 높이가 흔들린다) */}
      <Table.Td align="center">
        <Badge tone={orderStatusTone(row.status)}>
          {ORDER_STATUS_LABEL[row.status]}
        </Badge>
      </Table.Td>
      <Table.Td align="center">
        <Badge tone={settlementStatusTone(row.settlementStatus)}>
          {SETTLEMENT_STATUS_LABEL[row.settlementStatus]}
        </Badge>
      </Table.Td>
    </Table.ExpandableRow>
  );
}
