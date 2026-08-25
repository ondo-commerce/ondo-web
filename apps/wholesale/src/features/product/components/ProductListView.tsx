"use client";

import { Button, Panel, SearchInput } from "@ondo/ui";
import Link from "next/link";
import { useState } from "react";
import { ProductColorSizeList } from "./ProductColorSizeList";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { ProductSkuTable } from "./ProductSkuTable";
import { ProductTable } from "./ProductTable";
import type { Product } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 상품 관리 — 좌 목록(확장형 표) + 우 상세.
 *
 * 행을 펼치는 것과 우측 상세를 고르는 것은 같은 동작이다. 한 번에 한 행만 펼친다
 * — 우측 상세 패널이 한 장뿐이기 때문이다.
 *
 * 목록은 주문 탭과 같은 확장형 표다(`ProductTable`). 아코디언(div)이 아니라 표인 이유는
 * 품번·구성이 열로 서서 세로로 훑히기 때문이다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A). 딥링크가 필요해지면
 * 그때 쿼리스트링으로 올린다.
 */
export function ProductListView({ products }: { products: Product[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = products.find((p) => p.id === selectedId) ?? null;

  const toggleProduct = (productId: string) =>
    setSelectedId((prev) => (prev === productId ? null : productId));

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 한 줄 — 좌: 검색 / 우: 필터와 주 액션.
              검색창의 `mr-auto`가 나머지를 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(필터·버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-4 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
            />
            <Button asChild variant="line">
              <Link href="/products/new">상품 등록</Link>
            </Button>
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            <ProductTable
              products={products}
              openProductId={selectedId}
              onToggle={toggleProduct}
              /* 게시글 등록 여부에 따라 펼친 내용이 완전히 다르다 */
              renderDetail={(product) =>
                product.post ? (
                  <ProductSkuTable product={product} />
                ) : (
                  <ProductColorSizeList product={product} />
                )
              }
            />
          </Panel.Body>
        </Panel>
      }
      detail={selected ? <ProductDetailPanel product={selected} /> : undefined}
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}
