"use client";

import { Badge, Button, IconButton, cn } from "@ondo/ui";
import { Heart, ImageIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { orderMeta, rowMeta, rowPriceLabel } from "../derive";
import type { MatchedProduct, SearchOrder, SearchWholesaler } from "../types";

/**
 * 검색 결과의 줄. 카드가 아니라 줄인 이유는 세 축(상품·도매처·주문)이 한 화면에
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

export function ProductResultRow({ product }: { product: MatchedProduct }) {
  const href = `/products/${product.id}`;

  return (
    <Row>
      <span
        aria-hidden
        className="bg-secondary text-border-strong grid size-14 shrink-0 place-items-center rounded-md"
      >
        <ImageIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          <Link href={href} className="hover:text-secondary-foreground">
            {product.name}
          </Link>
          {/* 왜 이 줄이 맨 위인지를 배지가 말한다 — 없으면 순서가 임의로 보인다 */}
          {product.exactCode ? <Badge>품번 정확 일치</Badge> : null}
        </p>
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
        {/* 찜은 결과 줄에서도 누를 수 있다. 서버 저장이 없어 초기값만 보여 준다 —
            누른 결과를 화면에 남기는 토글은 목록 화면(찜 목록)이 갖는다 */}
        <IconButton
          variant="ghost"
          aria-label={product.favorited ? "찜 해제" : "찜하기"}
          aria-pressed={product.favorited}
          className={cn(
            product.favorited ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Heart
            aria-hidden
            fill={product.favorited ? "currentColor" : "none"}
          />
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
        <p className="font-medium">
          <Link
            href={`/wholesalers/${wholesaler.id}`}
            className="hover:text-secondary-foreground"
          >
            {wholesaler.name}
          </Link>
        </p>
        <p className="text-muted-foreground text-body mt-0.5 truncate">
          {wholesaler.location}
        </p>
      </div>

      <div className="ml-auto phone:ml-0">
        <Button asChild variant="line" size="sm">
          <Link href={`/wholesalers/${wholesaler.id}`}>도매처 홈</Link>
        </Button>
      </div>
    </Row>
  );
}

export function OrderResultRow({ order }: { order: SearchOrder }) {
  return (
    <Row>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {order.productName}{" "}
          <span className="text-muted-foreground font-normal">
            {order.optionSummary}
          </span>
        </p>
        <p className="text-muted-foreground text-body mt-0.5 truncate tabular-nums">
          {orderMeta(order)}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-end">
        <Badge>{order.statusLabel}</Badge>
        {/* 다시 주문 모달은 주문 회차가 만든다. 여기서는 그 화면까지 데려다만 준다 */}
        <Button asChild variant="line" size="sm">
          <Link href={`/orders/${order.id}?reorder=1`}>다시 주문</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/orders/${order.id}`}>주문 보기</Link>
        </Button>
      </div>
    </Row>
  );
}
