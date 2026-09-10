/**
 * 재고 feature의 queryKey 팩토리 — **재고 전용 응답(변동 이력)만** 여기 있다.
 * 목록·SKU 재고는 상품 응답이라 `shared/api/product`의 `productKeys`를 그대로 쓴다 —
 * 같은 키여야 입고 뒤 상품 탭의 SKU 표도 같이 새로워진다.
 *
 * 계층: `all` ⊃ `movements()` ⊃ `movementsOf(variantId)`.
 * 입고는 그 SKU의 이력(`movementsOf`)과 상품 상세(`productKeys.detail`)를 비운다.
 */
export const inventoryKeys = {
  all: ["inventory"] as const,
  movements: () => [...inventoryKeys.all, "movements"] as const,
  movementsOf: (variantId: number) =>
    [...inventoryKeys.movements(), variantId] as const,
};
