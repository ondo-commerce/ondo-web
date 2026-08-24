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
 * **`AccordionRow`를 쓰지 않는다.** 저건 div 기반이라 표 안에 넣으면 열 폭이 안 맞는다.
 * 대신 `Table.Row` + chevron 버튼(`aria-expanded`/`aria-controls`) + 두 번째 `<tr>`의
 * `colSpan` 확장행으로 만든다 — 확장행이 표의 전체 폭을 그대로 받는다.
 *
 * 펼쳐진 행은 배경이 회색이 되고 배지가 평문으로 바뀐다(Figma 실측).
 * 지금 보고 있는 행이므로 상태를 색으로 다시 강조할 이유가 없다.
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
  const detailId = `order-detail-${order.id}`;
  const statusLabel = ORDER_STATUS_LABEL[order.status];
  const settlementLabel = SETTLEMENT_STATUS_LABEL[order.settlementStatus];

  return (
    <>
      <Table.Row
        selected={open}
        className="cursor-pointer"
        onClick={onToggle}
        aria-label={`${order.id} 주문 상세`}
      >
        <Table.Td align="center">
          {/* 행 전체 클릭과 같은 토글이라 버블링을 끊는다 — 두 번 열렸다 닫히면 안 된다 */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${order.id} 펼치기`}
            className="focus-visible:ring-ring text-border-strong inline-flex rounded-button p-1 focus-visible:ring-2 focus-visible:outline-hidden"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <svg
              viewBox="0 0 12 12"
              className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4.5 2.5 8 6l-3.5 3.5" />
            </svg>
          </button>
        </Table.Td>
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
      </Table.Row>

      {open ? (
        <tr id={detailId}>
          {/*
            8 = 펼침 열 + 목록 7열. 확장행은 표 폭을 통째로 받는다.

            max-w-0이 없으면 안쪽 라인 표의 너비가 바깥 목록 표의 열 폭 계산에 끼어들어,
            라인이 많은 주문을 펼칠 때 목록 전체가 가로로 늘어난다(주문 상태 열이 밀려난다).
            0으로 못박으면 이 셀은 폭 계산에서 빠지고 표 폭만큼 늘어나며, 넘치는 라인 표는
            자기 스크롤 컨테이너 안에서 흐른다.
          */}
          <td
            colSpan={8}
            className="border-gray-100 bg-accent max-w-0 border-b p-4"
          >
            {children}
          </td>
        </tr>
      ) : null}
    </>
  );
}
