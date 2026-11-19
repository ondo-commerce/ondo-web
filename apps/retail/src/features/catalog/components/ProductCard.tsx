"use client";

import { Chip, IconButton, cn } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { optionSummary, priceLabel } from "../derive";
import type { CatalogProduct } from "../types";
import { ProductImage } from "@/shared/components/ProductImage";

/** 상품명 링크가 카드 전체를 덮고, 찜 버튼은 별도 조작 영역을 갖는다. */
export function ProductCard({
  product,
  favorited,
  onToggleFavorite,
}: {
  product: CatalogProduct;
  /** 찜 상태는 카드가 아니라 목록이 들고 있다 — 건수·정렬이 같은 값을 봐야 한다 */
  favorited: boolean;
  onToggleFavorite: (productId: string) => void;
}) {
  const href = `/products/${product.id}`;

  return (
    <article className="bg-card border-border hover:border-border-strong focus-within:border-border-strong relative flex min-w-0 flex-col overflow-hidden rounded-control border transition-colors">
      <div className="bg-secondary text-border-strong border-border relative grid aspect-square place-items-center overflow-hidden border-b">
        <ProductImage
          src={product.thumbnailUrl}
          sizes="(max-width: 40rem) 50vw, (max-width: 60rem) 25vw, 17vw"
        />
        {product.isSinglePieceAllowed && (
          <Chip tone="sub" shape="square" className="absolute top-2 left-2">
            낱장
          </Chip>
        )}
      </div>

      <div className="min-w-0 p-3">
        <h3 className="truncate text-sm">
          <Link
            href={href}
            title={product.name}
            className="after:absolute after:inset-0 focus-visible:underline"
          >
            {product.name}
          </Link>
        </h3>
        <p className="text-muted-foreground text-body mt-1 truncate">
          {product.wholesalerName}
        </p>
        <p className="mt-2 text-sm font-medium tabular-nums">
          {priceLabel(product)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {optionSummary(product)}
        </p>
      </div>

      <IconButton
        variant="ghost"
        size="md"
        aria-label={favorited ? "찜 해제" : "찜하기"}
        aria-pressed={favorited}
        onClick={() => onToggleFavorite(product.id)}
        className={cn(
          "bg-card hover:bg-secondary border-border absolute top-2 right-2 z-10 border",
          favorited ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Heart aria-hidden fill={favorited ? "currentColor" : "none"} />
      </IconButton>
    </article>
  );
}
