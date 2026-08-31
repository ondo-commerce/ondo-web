"use client";

import { cn } from "@ondo/ui";
import { ProductCard } from "./ProductCard";
import type { CatalogProduct } from "../types";

/**
 * 카드 격자. 열 수는 확정 와이어프레임 `_base.css` `.grid` 실측 그대로다 —
 * 5 → 4(≤75rem) → 3(≤60rem) → 2(≤40rem). `신상`처럼 4열로 시작하는 자리는
 * `columns={4}`를 준다(`.grid.g4`는 75rem 단계가 없다).
 *
 * 열 수를 prop으로 받되 **클래스는 두 벌을 통째로 적는다.** 문자열을 조립하면
 * Tailwind가 빌드 때 그 클래스를 못 찾아 열이 하나도 안 잡힌다.
 */
export function ProductGrid({
  products,
  favorites,
  onToggleFavorite,
  columns = 5,
}: {
  products: readonly CatalogProduct[];
  /** 지금 찜한 상품 id들. 카드가 아니라 목록이 들고 있다 */
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
  columns?: 4 | 5;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-7 py-5 phone:gap-x-3 phone:gap-y-5",
        columns === 5
          ? "grid-cols-5 laptop:grid-cols-4 tablet:grid-cols-3 phone:grid-cols-2"
          : "grid-cols-4 tablet:grid-cols-3 phone:grid-cols-2",
      )}
    >
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
