"use client";

import { AccordionRow, Chip } from "@ondo/ui";
import { ProductColorSizeList } from "./ProductColorSizeList";
import { ProductSkuTable } from "./ProductSkuTable";
import type { Product } from "../types";

export function ProductRow({
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
      tail={product.category.join(" > ")}
      header={
        <span className="flex items-center gap-2">
          <span className="font-normal">{product.name}</span>
          {/* <Chip tone="sub">{product.code}</Chip> */}
        </span>
      }
    >
      {/* 게시글 등록 여부에 따라 펼친 내용이 완전히 다르다 */}
      {product.post ? (
        <ProductSkuTable product={product} />
      ) : (
        <ProductColorSizeList product={product} />
      )}
    </AccordionRow>
  );
}
