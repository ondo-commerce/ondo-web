import { Button, Chip, ImageSlot, Panel, SlotGrid } from "@ondo/ui";
import Link from "next/link";
import type { Product } from "../types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-1 text-sm">
      <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line">{value}</dd>
    </div>
  );
}

/** 목록에서 고른 상품 하나의 상세. 게시글이 없으면 게시글 블록 자체가 없다 */
export function ProductDetailPanel({ product }: { product: Product }) {
  return (
    <Panel className="flex-1">
      <Panel.Title suffix={<Chip tone="sub">{product.code}</Chip>}>
        {product.name}
      </Panel.Title>

      <Panel.Body>
        <Panel.Section title="기본 정보">
          <dl>
            <Row label="카테고리" value={product.category.join(" > ")} />
            <Row
              label="옵션"
              value={product.colors
                .map((c) => c.displayName ?? c.name)
                .join(", ")}
            />
          </dl>
        </Panel.Section>

        {product.post ? (
          <>
            <Panel.Section title="게시글 정보">
              <dl>
                <Row label="게시글 이름" value={product.post.name} />
                <Row label="상세 설명" value={product.post.description} />
              </dl>
            </Panel.Section>

            <Panel.Section title="게시글 이미지">
              <SlotGrid>
                {product.post.images.map((img, i) => (
                  <ImageSlot
                    key={i}
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
                    {img}
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
    </Panel>
  );
}
