"use client";

import { Badge, IconButton, cn } from "@ondo/ui";
import { Heart, ImageIcon } from "lucide-react";
import Link from "next/link";
import { cardBadge, isOrderable, optionSummary, priceLabel } from "../derive";
import type { CatalogProduct } from "../types";

/**
 * 마켓 상품 카드 한 장. 홈 · 도매처 홈 · 찜 목록 세 화면이 같은 것을 쓴다.
 *
 * **`packages/ui`로 올리지 않는다** — 도매처명·품번·시즌 종료처럼 소매 도메인을
 * 알고 있고, 쓰는 화면 셋이 전부 이 feature 안이다(Rule of Two, `docs/04`).
 *
 * 링크가 **하나뿐**인 것이 이 컴포넌트의 핵심이다. 확정 와이어프레임은 이미지와
 * 상품명에 각각 링크를 걸었는데, 그러면 스크린리더에 같은 목적지가 두 번 읽히고
 * 둘의 이름이 어긋나는 결함(`retail_screen_spec.md` §6-6)이 그대로 옮겨온다.
 * 이미지 쪽은 tabIndex -1 + aria-hidden으로 **마우스 전용 복제**로 남기고,
 * 접근성 이름을 갖는 링크는 상품명 하나다 — 링크 이름 = 카드 안 상품명.
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
  const orderable = isOrderable(product);
  const href = `/products/${product.id}`;
  const badge = cardBadge(product);

  const slot = (
    <div
      className={cn(
        "bg-secondary text-border-strong grid aspect-square place-items-center rounded-control",
        /* 시즌 종료는 흐려진다. 흐림 하나로는 색만 보는 사람에게 전달되지 않아
           아래 배지와 가격 자리 문구가 같은 말을 글자로 한 번 더 한다 */
        !orderable && "opacity-55",
      )}
    >
      {/* 실제 상품 이미지는 자산이 없다. 확정 와이어프레임도 회색 슬롯이다 */}
      <ImageIcon aria-hidden className="size-7" />
    </div>
  );

  return (
    <article className="flex min-w-0 flex-col">
      <div className="relative">
        {orderable ? (
          /* 마우스 사용자를 위한 복제 링크. 접근성 트리에서는 빼고 탭 순서에서도
             빼서 아래 상품명 링크 하나만 남긴다 */
          <Link href={href} aria-hidden tabIndex={-1} className="block">
            {slot}
          </Link>
        ) : (
          slot
        )}

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

        {badge ? (
          <span className="absolute bottom-2 left-2">
            <Badge className="h-6.5">{badge}</Badge>
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-body mt-2.5">
        {product.wholesalerName}
      </p>

      {/* line-clamp-2: 상품명이 길어도 카드 높이가 두 줄에서 멈춘다.
          한 줄로 자르면 비슷한 이름이 구분되지 않고, 안 자르면 격자가 어긋난다 */}
      <h3 className="mt-0.5 line-clamp-2 font-medium">
        {orderable ? (
          <Link href={href} className="hover:text-secondary-foreground">
            {product.name}
          </Link>
        ) : (
          product.name
        )}
      </h3>

      {orderable ? (
        <p className="mt-1.5 font-medium tabular-nums">{priceLabel(product)}</p>
      ) : (
        /* 주문할 수 없으면 가격을 지운다 — 못 사는 값을 보여 주면 장바구니를
           찾게 만든다. 자리에는 왜 못 사는지가 들어간다 */
        <p className="text-muted-foreground mt-1.5">더 주문할 수 없어요</p>
      )}

      <p className="text-muted-foreground text-body mt-0.5 tabular-nums">
        {optionSummary(product)}
      </p>
    </article>
  );
}
