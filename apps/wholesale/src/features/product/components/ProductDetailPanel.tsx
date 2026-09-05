"use client";

import { Button, Chip, ImageSlot, Panel, SlotGrid } from "@ondo/ui";
import Image from "next/image";
import Link from "next/link";
import { useProductDetailQuery } from "../api/queries";
import { isImageUrl } from "../derive";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-1 text-sm">
      <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line">{value}</dd>
    </div>
  );
}

/**
 * 게시글 이미지 한 칸. 서버가 URL을 주므로 실제 그림을 그린다.
 * `unoptimized`인 이유: 이미지 호스트가 아직 정해지지 않아 `next.config`의
 * `remotePatterns`에 적을 값이 없다. 최적화 프록시를 거치면 그 목록에 없는 호스트는 400이다.
 */
function ListingImage({ src, alt }: { src: string; alt: string }) {
  if (!isImageUrl(src)) return <>{src}</>;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="88px"
      unoptimized
      className="rounded-control object-cover"
    />
  );
}

/**
 * 목록에서 고른 상품 하나의 상세. 게시글이 없으면 게시글 블록 자체가 없다.
 *
 * `Panel`은 부르는 쪽(`ProductListView`)이 그린다 — 경계(`QueryBoundary`)가 패널 안에
 * 들어가야 기다리는 동안에도 우측 폭이 유지되기 때문이다. 여기는 패널 속만 채운다.
 */
export function ProductDetailPanel({ productId }: { productId: number }) {
  const { data: product } = useProductDetailQuery(productId);
  // 콜백 안에서는 `product.post`의 null 좁힘이 풀린다. 한 번 꺼내 둔다
  const post = product.post;

  return (
    <>
      <Panel.Title suffix={<Chip tone="sub">{product.code}</Chip>}>
        {product.name}
      </Panel.Title>

      <Panel.Body>
        <Panel.Section title="기본 정보">
          <dl>
            <Row label="카테고리" value={product.categoryLabel} />
            <Row
              label="옵션"
              value={product.colors.map((c) => c.name).join(", ")}
            />
          </dl>
        </Panel.Section>

        {post ? (
          <>
            <Panel.Section title="게시글 정보">
              <dl>
                <Row label="게시글 이름" value={post.name} />
                <Row label="상세 설명" value={post.description} />
              </dl>
            </Panel.Section>

            <Panel.Section title="게시글 이미지">
              <SlotGrid>
                {post.images.map((img, i) => (
                  <ImageSlot
                    key={`${i}-${img}`}
                    overlay={
                      i === 0 ? (
                        <Chip
                          tone="accent"
                          className="absolute top-0.5 left-0.5 h-5 px-2 text-xs"
                        >
                          대표
                        </Chip>
                      ) : null
                    }
                  >
                    <ListingImage
                      src={img}
                      alt={`${post.name} 이미지 ${i + 1}`}
                    />
                  </ImageSlot>
                ))}
              </SlotGrid>
            </Panel.Section>
          </>
        ) : null}
      </Panel.Body>

      <div className="flex shrink-0 gap-2 pt-2">
        {/* 재고 탭은 상품별 URL이 없다(/inventory 한 장). 그래서 어느 상품을 보던
            중이었는지는 넘어가지 않고, 도착하면 목록이 접힌 상태로 열린다 */}
        <Button asChild variant="soft" size="lg" className="flex-1">
          <Link href="/inventory">재고 등록 →</Link>
        </Button>
        <Button asChild size="lg" className="flex-1">
          <Link href={`/products/${product.id}/edit`}>상품 관리</Link>
        </Button>
      </div>
    </>
  );
}
