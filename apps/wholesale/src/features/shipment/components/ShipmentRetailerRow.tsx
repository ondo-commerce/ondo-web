"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import type { Retailer } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 목록의 소매처 한 행 + 펼침 영역. **세 단계가 이 행을 공유한다** — 바뀌는 것은
 * 건수의 단위(대기 줄 ↔ 포장 묶음)와 펼친 본문뿐이라, 단계마다 행을 따로 두면
 * 같은 셸이 세 벌이 된다. 이 행은 단계를 모른다.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다.
 *
 * 예전에는 `SKU 6건 · 55개`가 한 덩어리 문자열로 행 끝에 붙어 있었다. 두 숫자를 열로
 * 갈라 세우면 소매처끼리 크기가 세로로 비교된다 — 어디부터 포장할지 고르는 화면이라
 * 그 비교가 이 목록에서 실제로 하는 일이다.
 */
export function ShipmentRetailerRow({
  retailer,
  count,
  qty,
  open,
  onToggle,
  children,
}: {
  retailer: Retailer;
  /** 건수. 단위는 단계가 정한다 — 포장 대기는 대기 줄, 나머지는 포장 묶음이다 */
  count: number;
  /** 총 수량. 단계와 무관하게 낱개 수다 */
  qty: number;
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
      label={retailer.name}
      detailId={`shipment-detail-${retailer.id}`}
      detail={children}
    >
      <Table.Td align="left" tone="muted">
        {retailer.code}
      </Table.Td>
      <Table.Td align="left">{retailer.name}</Table.Td>
      <Table.Td>{count}건</Table.Td>
      <Table.Td>{formatNumber(qty)}개</Table.Td>
    </Table.ExpandableRow>
  );
}
