"use client";

import { Badge, Table } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
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
            {/* 펼치면 90°만 돈다 — `>`를 180° 돌리면 `<`가 되어 "펼침"으로 안 읽힌다 */}
            <ChevronRight
              aria-hidden
              className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
            />
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

            isolate가 핵심이다. 안쪽 표도 머리글이 sticky(z-10)인데, 이 셀이 스태킹
            컨텍스트를 안 만들면 그 z-10이 바깥 목록 머리글의 z-10과 같은 무대에서 겨룬다.
            같은 층에서는 DOM 순서가 늦은 쪽이 이기고 thead보다 tbody가 뒤라서,
            **안쪽 머리글이 바깥 머리글을 덮는다.** isolate로 가둬 두면 이 셀은 z-auto
            층에 머물러 바깥 머리글(z-10)이 항상 위에 온다.
            (`Table.Td`는 이미 isolate를 갖고 있는데, 확장행은 생짜 `<td>`라 빠져 있었다.)
          */}
          <td
            colSpan={8}
            className="border border-gray-200 isolate max-w-0 p-4"
          >
            {children}
          </td>
        </tr>
      ) : null}
    </>
  );
}
