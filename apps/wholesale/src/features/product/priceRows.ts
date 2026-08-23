import type { OptionDraft } from "./components/ProductOptionMatrix";
import type { PriceRow } from "./components/PostPriceTable";
import { colorHex } from "./constants";
import type { Product } from "./types";

/**
 * 가격표의 행은 항상 **색상 × 사이즈**다.
 * 등록 화면은 아직 저장 전이라 옵션 카드에서, 수정 화면은 이미 만들어진 SKU에서 뽑는다.
 */

export function priceRowsFromOptions(options: OptionDraft[]): PriceRow[] {
  return options.flatMap((option) => {
    // 사이즈를 아직 안 고른 색은 SKU가 없다
    return option.sizes.map((size, i) => ({
      id: `${option.id}-${size}`,
      color: option.color.name,
      colorHex: option.color.hex,
      firstOfColor: i === 0,
      size,
      // 새로 만드는 상품은 아직 입고가 없다. 재고·원가는 입고가 붙어야 생긴다
      stock: 0,
      avgCost: 0,
    }));
  });
}

export function priceRowsFromProduct(product: Product): PriceRow[] {
  const seen = new Set<string>();

  return product.skus.map((sku) => {
    const firstOfColor = !seen.has(sku.color);
    seen.add(sku.color);

    return {
      id: sku.id,
      color:
        product.colors.find((c) => c.name === sku.color)?.displayName ??
        sku.color,
      colorHex: colorHex(sku.color),
      firstOfColor,
      size: sku.size,
      stock: sku.stock,
      avgCost: sku.avgCost,
    };
  });
}
