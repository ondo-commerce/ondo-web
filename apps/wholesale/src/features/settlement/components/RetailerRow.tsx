"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import type { TradeRelation } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 정산 목록의 거래처 한 행 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 두 숫자는 **파생값이다** — 주문 목록에서 센 건수와 원장에서 뒤집은 미수 잔액이다.
 * 상수로 적어 두면 입금 한 건만 등록해도 화면의 다른 숫자와 갈린다(01-pm.md §1.8).
 *
 * 펼친 영역의 내용은 이 컴포넌트가 정하지 않는다. 세그먼트(정산 상태·미수원장)를
 * 어느 쪽으로 볼지는 화면 상태이므로 호출부가 children으로 넣는다.
 */
export function RetailerRow({
  relation,
  orderCount,
  receivable,
  open,
  onToggle,
  children,
}: {
  relation: TradeRelation;
  orderCount: number;
  /** 미수 잔액(양수). 계정 잔액을 뒤집은 값이다 — `derive.outstandingReceivable` */
  receivable: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 5 = 펼침 열 + 목록 4열 */
      colSpan={5}
      label={relation.retailerName}
      detailId={`settlement-detail-${relation.id}`}
      detail={children}
    >
      <Table.Td align="left" tone="muted">
        {relation.retailerCode}
      </Table.Td>
      <Table.Td align="left">{relation.retailerName}</Table.Td>
      <Table.Td>{orderCount}건</Table.Td>
      {/* 잔액 0은 회색이다 — 다 받았다는 뜻이라 더 볼 것이 없다 */}
      <Table.Td tone={receivable === 0 ? "muted" : "default"}>
        {formatNumber(receivable)}원
      </Table.Td>
    </Table.ExpandableRow>
  );
}
