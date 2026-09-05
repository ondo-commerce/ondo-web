"use client";

import { IconButton, cn } from "@ondo/ui";
import { Heart, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { optionSummary, priceLabel } from "../derive";
import type { CatalogProduct } from "../types";

/**
 * 마켓 상품 카드 한 장. 홈 · 도매처 홈 · 찜 목록 세 화면이 같은 것을 쓴다.
 *
 * **`packages/ui`로 올리지 않는다** — 도매처명처럼 소매 도메인을 알고 있고,
 * 쓰는 화면 셋이 전부 이 feature 안이다(Rule of Two, `docs/04`).
 *
 * 링크가 **하나뿐**인 것이 이 컴포넌트의 핵심이다. 확정 와이어프레임은 이미지와
 * 상품명에 각각 링크를 걸었는데, 그러면 스크린리더에 같은 목적지가 두 번 읽히고
 * 둘의 이름이 어긋나는 결함(`retail_screen_spec.md` §6-6)이 그대로 옮겨온다.
 * 이미지 쪽은 tabIndex -1 + aria-hidden으로 **마우스 전용 복제**로 남기고,
 * 접근성 이름을 갖는 링크는 상품명 하나다 — 링크 이름 = 카드 안 상품명.
 *
 * 시즌 종료·구매 이력 배지가 없다 — 목록 응답에 그 값이 없다. 목록에 오는 것은
 * 전부 지금 살 수 있는 게시글이다(스펙: "목록에 품절이라는 상태가 없다").
 */
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
    <article className="flex min-w-0 flex-col">
      <div className="relative">
        {/* 마우스 사용자를 위한 복제 링크. 접근성 트리에서는 빼고 탭 순서에서도
            빼서 아래 상품명 링크 하나만 남긴다 */}
        <Link href={href} aria-hidden tabIndex={-1} className="block">
          <div className="bg-secondary text-border-strong relative grid aspect-square place-items-center overflow-hidden rounded-control">
            {product.thumbnailUrl ? (
              /* 이미지 호스트가 `next.config`에 없어 최적화 파이프를 안 탄다 —
                 도매가 올린 주소 그대로 그린다 */
              <Image
                src={product.thumbnailUrl}
                alt=""
                fill
                unoptimized
                sizes="(max-width: 40rem) 50vw, 20vw"
                className="object-cover"
              />
            ) : (
              /* 사진이 없는 게시글. 확정 와이어프레임도 회색 슬롯이다 */
              <ImageIcon aria-hidden className="size-7" />
            )}
          </div>
        </Link>

        <IconButton
          variant="ghost"
          aria-label={favorited ? "찜 해제" : "찜하기"}
          aria-pressed={favorited}
          onClick={() => onToggleFavorite(product.id)}
          className={cn(
            "hover:bg-card absolute top-2 right-2",
            favorited ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Heart aria-hidden fill={favorited ? "currentColor" : "none"} />
        </IconButton>
      </div>

      <p className="text-muted-foreground text-body mt-2.5">
        {product.wholesalerName}
      </p>

      {/* line-clamp-2: 상품명이 길어도 카드 높이가 두 줄에서 멈춘다.
          한 줄로 자르면 비슷한 이름이 구분되지 않고, 안 자르면 격자가 어긋난다 */}
      <h3 className="mt-0.5 line-clamp-2 font-medium">
        <Link href={href} className="hover:text-secondary-foreground">
          {product.name}
        </Link>
      </h3>

      <p className="mt-1.5 font-medium tabular-nums">{priceLabel(product)}</p>

      <p className="text-muted-foreground text-body mt-0.5 tabular-nums">
        {optionSummary(product)}
      </p>
    </article>
  );
}
