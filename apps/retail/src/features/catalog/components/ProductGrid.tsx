"use client";

import { ProductCard } from "./ProductCard";
import type { CatalogProduct } from "../types";

/**
 * 카드 격자. 6 → 4(≤60rem) → 2(≤40rem)칸이다.
 *
 * 4칸일 때는 카드가 커서 첫 화면에 상품이 4개만 보였다(2026-11-18 사용자 지시:
 * 6개쯤 보이게). 한 쪽 상품 수(`PAGE_SIZE` 24)가 6, 4, 2 어느 것으로도 나눠떨어져
 * 어느 폭에서도 마지막 줄이 비지 않는다 — 칸 수를 바꾸면 그 값도 같이 본다.
 */
export function ProductGrid({
  products,
  favorites,
  onToggleFavorite,
}: {
  products: readonly CatalogProduct[];
  /** 지금 찜한 상품 id들. 카드가 아니라 목록이 들고 있다 */
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-6 gap-4 tablet:grid-cols-4 phone:grid-cols-2 phone:gap-2">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          favorited={favorites.has(product.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
