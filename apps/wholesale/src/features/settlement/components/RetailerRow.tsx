"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import type { RetailerRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 정산 목록의 거래처 한 행 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 두 숫자는 **서버값이다** — `orderCount`(확정 주문 수)와 `ledgerBalance`를 뒤집은 미수 잔액.
 * 입금 한 건이 등록되면 재조회로 함께 움직인다(`mutations.ts`).
 *
 * 펼친 영역의 내용은 이 컴포넌트가 정하지 않는다. 세그먼트(정산 상태·미수원장)를
 * 어느 쪽으로 볼지는 화면 상태이므로 호출부가 children으로 넣는다.
 */
export function RetailerRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: RetailerRowView;
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
      label={row.retailer.name}
      detailId={`settlement-detail-${row.retailer.id}`}
      detail={children}
    >
      {/* 시드(V900)엔 소매처 코드가 없다 — 비면 `-` */}
      <Table.Td align="left" tone="muted">
        {row.retailer.code === "" ? "-" : row.retailer.code}
      </Table.Td>
      <Table.Td align="left">{row.retailer.name}</Table.Td>
      <Table.Td>{row.orderCount}건</Table.Td>
      {/* 잔액 0은 회색이다 — 다 받았다는 뜻이라 더 볼 것이 없다 */}
      <Table.Td tone={row.receivable === 0 ? "muted" : "default"}>
        {formatNumber(row.receivable)}원
      </Table.Td>
    </Table.ExpandableRow>
  );
}
