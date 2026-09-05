"use client";

import { Button, IconButton, cn } from "@ondo/ui";
import { Heart, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { rowMeta, rowPriceLabel } from "../derive";
import type { SearchProduct, SearchWholesaler } from "../types";
import { useProductFavorite } from "@/features/catalog";

/**
 * 검색 결과의 줄. 카드가 아니라 줄인 이유는 두 축(상품·도매처)이 한 화면에
 * 세로로 이어지기 때문이다 — 격자로 그리면 축이 바뀌는 지점이 안 보인다.
 */
function Row({ children }: { children: ReactNode }) {
  return (
    /* flex-wrap + phone:w-full 짝: 390px에서 우측 액션 묶음이 아랫줄로 내려간다.
       안 접으면 상품명이 한 글자씩 잘려 무슨 상품인지 못 읽는다 */
    <div className="border-border hover:bg-accent flex min-h-13 flex-wrap items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      {children}
    </div>
  );
}

export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

export function ProductResultRow({ product }: { product: SearchProduct }) {
  const href = `/products/${product.id}`;
  /* 찜은 검색이 아니라 catalog가 갖는다 — 여기서 켠 하트가 홈 카드·상품 상세에도
     그대로 켜져 있어야 한다 */
  const { favorited, toggleFavorite } = useProductFavorite(product.id);

  return (
    <Row>
      <span
        aria-hidden
        className="bg-secondary text-border-strong relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md"
      >
        {product.thumbnailUrl ? (
          /* 이미지 호스트가 `next.config`에 없어 최적화 파이프를 안 탄다 */
          <Image
            src={product.thumbnailUrl}
            alt=""
            fill
            unoptimized
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <ImageIcon className="size-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {/* 상품명은 **글자다.** 줄 안에 같은 곳으로 가는 링크가 둘이면
            스크린리더에 같은 목적지가 두 번 읽히고 둘의 이름이 어긋난다.
            줄에서 상세로 가는 문은 `상품 보기` 하나다 — 확정 와이어프레임
            `parts/01_search.html`도 상품명이 `div.b` 텍스트다 (카드에서
            이미지 링크를 눌러 둔 것과 같은 이유) */}
        <p className="font-medium">{product.name}</p>
        <p className="text-muted-foreground text-body mt-0.5 truncate">
          {rowMeta(product)}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-end">
        <span className="font-medium tabular-nums">
          {rowPriceLabel(product)}
        </span>
        <Button asChild variant="line" size="sm">
          <Link href={href}>상품 보기</Link>
        </Button>
        {/* 눌리는 모양이면 눌린 결과가 보여야 한다 — 예전에는 aria-pressed가
            달린 채로 아무것도 안 바뀌어서, 사장이 찜한 줄 알고 지나갔다 */}
        <IconButton
          variant="ghost"
          aria-label={favorited ? "찜 해제" : "찜하기"}
          aria-pressed={favorited}
          onClick={toggleFavorite}
          className={cn(
            favorited ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Heart aria-hidden fill={favorited ? "currentColor" : "none"} />
        </IconButton>
      </div>
    </Row>
  );
}

export function WholesalerResultRow({
  wholesaler,
}: {
  wholesaler: SearchWholesaler;
}) {
  return (
    <Row>
      <span
        aria-hidden
        className="bg-secondary text-secondary-foreground text-body grid size-9 shrink-0 place-items-center rounded-md"
      >
        {wholesaler.initial}
      </span>

      <div className="min-w-0 flex-1">
        {/* 상품 줄과 같은 규칙이다 — 문은 `도매처 홈` 하나.
            위치 줄이 없다 — 목록 응답의 `WholesalerBrief`는 id·상호뿐이다 */}
        <p className="font-medium">{wholesaler.name}</p>
      </div>

      <div className="ml-auto phone:ml-0">
        <Button asChild variant="line" size="sm">
          <Link href={`/wholesalers/${wholesaler.id}`}>도매처 홈</Link>
        </Button>
      </div>
    </Row>
  );
}
