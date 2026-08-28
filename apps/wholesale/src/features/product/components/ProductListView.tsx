"use client";

import { Button, Panel, SearchInput } from "@ondo/ui";
import Link from "next/link";
import { useState } from "react";
import { ProductColorSizeList } from "./ProductColorSizeList";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { ProductPostFilter } from "./ProductPostFilter";
import { ProductSkuTable } from "./ProductSkuTable";
import { ProductTable } from "./ProductTable";
import { POST_FILTER_ALL, type PostFilterValue } from "../constants";
import { postStatusKey } from "../derive";
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
  const [query, setQuery] = useState("");
  const [postFilter, setPostFilter] =
    useState<PostFilterValue>(POST_FILTER_ALL);

  /* 검색은 품번·품명 두 축이다 — placeholder가 약속한 그대로다.
     게시 필터와 검색은 **함께 걸린다**(주문 탭과 같은 규칙) — 판매중만 켜 둔 채로
     품번을 쳐서 좁힐 수 있어야 한다 */
  const keyword = query.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      (postFilter === POST_FILTER_ALL || postStatusKey(p) === postFilter) &&
      (!keyword ||
        p.name.toLowerCase().includes(keyword) ||
        p.code.toLowerCase().includes(keyword)),
  );

  /* 우측 상세는 **검색으로 가려져도 펼쳐져 있으면 보여야** 하므로 products에서 찾는다 */
  const selected = products.find((p) => p.id === selectedId) ?? null;

  const toggleProduct = (productId: string) =>
    setSelectedId((prev) => (prev === productId ? null : productId));

  /* 검색·필터를 바꾸면 펼침을 푼다. 안 그러면 목록에서 사라진 상품의 상세가 우측에 남는다 */
  const changeQuery = (next: string) => {
    setQuery(next);
    setSelectedId(null);
  };

  const changePostFilter = (next: PostFilterValue) => {
    setPostFilter(next);
    setSelectedId(null);
  };

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 두 줄 — 첫 줄은 검색과 주 액션, 둘째 줄은 필터.
              **세그먼트는 검색줄 아래로 내린다.** 주문 탭과 같은 규칙이다 — 검색창은 폭이
              고정(340px)인데 필터는 칸 수·글자 길이에 따라 변해서, 한 줄에 두면 탭마다
              검색창 자리가 흔들리고 칸이 늘어날 때 제멋대로 접힌다. 변하는 쪽만 아래 줄에
              모아 두면 위쪽 줄의 모양이 탭을 옮겨도 같다.
              첫 줄의 `mr-auto`가 주 액션을 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-3 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
            />
            <Button asChild variant="line">
              <Link href="/products/new">상품 등록</Link>
            </Button>
          </div>

          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <ProductPostFilter value={postFilter} onChange={changePostFilter} />
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
              stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
              빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
          {visibleProducts.length === 0 ? (
            <Panel.Body>
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            </Panel.Body>
          ) : (
            <ProductTable
              products={visibleProducts}
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
          )}
        </Panel>
      }
      detail={selected ? <ProductDetailPanel product={selected} /> : undefined}
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}
