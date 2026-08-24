"use client";

import { AccordionRow } from "@ondo/ui";
import type { Product } from "@/features/product";

/**
 * 재고 목록의 상품 한 행.
 * 상품 탭과 달리 tail이 카테고리 경로가 아니라 `SKU 수 N`이다 —
 * 재고 탭에서 궁금한 건 이 상품이 몇 갈래로 나뉘어 있는가다.
 */
export function InventoryProductRow({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AccordionRow
      open={open}
      onOpenChange={onOpenChange}
      tail={
        <span className="flex items-baseline gap-1.5">
          <span>SKU 수</span>
          <span className="text-foreground font-medium">
            {product.skus.length}
          </span>
        </span>
      }
      header={
        <span className="flex items-baseline gap-2">
          <span className="font-normal">{product.name}</span>
          <span className="text-muted-foreground text-sm">{product.code}</span>
        </span>
      }
    >
      {/* 펼친 자리에 들어갈 SKU 재고 표는 아직 없다 — 지금은 자리만 잡는다 */}
      <p className="text-muted-foreground py-3 text-sm">
        SKU {product.skus.length}개
      </p>
    </AccordionRow>
  );
}
