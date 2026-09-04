import { priceRowId } from "./derive";
import type { OptionDraft, PriceRow, SkuView } from "./types";

/**
 * 가격표의 행은 항상 **색상 × 사이즈**이고, 옵션 매트릭스가 그 원본이다.
 *
 * 등록·수정이 같은 함수를 쓴다. 수정 화면은 `existing`(서버가 준 SKU)을 같이 넘겨
 * 현재고·평균원가를 채우고, 등록 화면은 아직 입고가 없어 둘 다 0이다.
 * 수정 화면에서 새로 켠 색×사이즈는 기존 SKU가 없으므로 역시 0이다 — 그 행은
 * 저장할 때 `variantId` 없이 나가 서버가 새 variant를 만든다.
 */
export function priceRowsFromOptions(
  options: readonly OptionDraft[],
  existing: readonly SkuView[] = [],
): PriceRow[] {
  return options.flatMap((option) =>
    // 사이즈를 아직 안 고른 색은 SKU가 없다
    option.sizes.map((size, i) => {
      const known = existing.find(
        (s) => s.colorId === option.color.id && s.size === size,
      );
      return {
        id: priceRowId(option.color.id, size),
        colorId: option.color.id,
        color: option.color.name,
        colorHex: option.color.hex,
        firstOfColor: i === 0,
        size,
        stock: known?.stock ?? 0,
        avgCost: known?.avgCost ?? 0,
      };
    }),
  );
}
