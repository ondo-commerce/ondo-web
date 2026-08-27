"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { EMPTY_MARK } from "../constants";
import { totalBackorderQty } from "../derive";
import type { BackorderSku } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 미송 목록의 SKU 한 행 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 재고 탭과 달리 **상품이 아니라 SKU가 행**이다 — 미송의 관리 단위가 SKU이기 때문이다
 * (glossary §4.8). 같은 상품의 다른 색·사이즈는 별개의 미송 줄이고 입고 시점도 다르다.
 */
export function BackorderSkuRow({
  sku,
  open,
  onToggle,
  children,
}: {
  sku: BackorderSku;
  open: boolean;
  onToggle: () => void;
  /** 펼친 본문(카운터 바 + 배분 표). 무엇을 펼칠지는 호출부가 정한다 */
  children: ReactNode;
}) {
  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 7 = 펼침 열 + 목록 6열 */
      colSpan={7}
      label={sku.id}
      detailId={`backorder-detail-${sku.id}`}
      detail={children}
    >
      <Table.Td align="left" tone="muted">
        {sku.id}
      </Table.Td>
      <Table.Td align="left">{sku.productName}</Table.Td>
      <Table.Td align="left">{sku.color}</Table.Td>
      <Table.Td align="center">{sku.size}</Table.Td>
      {/* 합계는 필드가 아니라 `Σ lines[].qty`다 — 따로 들고 있으면 배분 확정 뒤 갈린다 */}
      <Table.Td>{formatNumber(totalBackorderQty(sku.lines))}</Table.Td>
      {/* 미등록은 `-`. 날짜가 들어오면 같은 자리에 그대로 그린다 */}
      <Table.Td align="center" tone="muted">
        {sku.eta ?? EMPTY_MARK}
      </Table.Td>
    </Table.ExpandableRow>
  );
}
