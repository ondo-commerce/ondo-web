"use client";

import { Table } from "@ondo/ui";
import { InventoryStockTable } from "./InventoryStockTable";
import { availableQty, sumQuantities } from "../derive";
import type { Product } from "@/features/product";
import { formatNumber } from "@/shared/lib/format";

/**
 * 재고 목록의 상품 한 행 + 펼침 영역(SKU 표).
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 수량 두 칸은 SKU 합계다. 색상 그룹 접힘 행이 쓰는 것과 **같은 파생 함수**를 쓴다 —
 * 상품 합계를 여기서 따로 세면 펼친 표의 합과 갈린다.
 */
export function InventoryProductRow({
  product,
  open,
  onToggle,
  selectedSkuId,
  onSelectSku,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
  selectedSkuId: string | null;
  onSelectSku: (skuId: string) => void;
}) {
  const totals = sumQuantities(product.skus);

  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 6 = 펼침 열 + 목록 5열 */
      colSpan={6}
      label={product.name}
      detailId={`inventory-detail-${product.id}`}
      detail={
        <InventoryStockTable
          product={product}
          selectedSkuId={selectedSkuId}
          onSelectSku={onSelectSku}
        />
      }
    >
      <Table.Td align="left" tone="muted">
        {product.code}
      </Table.Td>
      <Table.Td align="left">{product.name}</Table.Td>
      <Table.Td>{product.skus.length}</Table.Td>
      <Table.Td>{formatNumber(totals.stock)}</Table.Td>
      {/* 판매가능이 음수면 빨강이다. 0으로 감추지 않는다(§7 Q4) — 판 것보다 재고가 적다는 뜻이다 */}
      <Table.Td tone={availableQty(totals) < 0 ? "danger" : "default"}>
        {formatNumber(availableQty(totals))}
      </Table.Td>
    </Table.ExpandableRow>
  );
}
