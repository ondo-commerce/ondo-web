"use client";

import { AccordionRows, Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { InventoryProductRow } from "./InventoryProductRow";
import type { Product } from "@/features/product";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 재고 관리 — 좌 목록(아코디언 + SKU 표) + 우 작업 패널.
 *
 * 우측은 한 화면 안에서 모드가 바뀐다. 다른 페이지가 아니다.
 * 지금은 아무 상품도 안 펼친 빈 상태만 있고, 펼쳤을 때의 작업 패널은 뒤 이슈에서 붙는다.
 *
 * **다른 상품을 펼치면 SKU 선택이 반드시 풀린다.** 안 풀면 A상품 목록 옆에
 * B상품 SKU 카드가 남는다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 이 컴포넌트가
 * 목록을 받는 자리(products prop)에서 세 상태를 갈라야 한다.
 */
export function InventoryListView({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);

  const keyword = query.trim().toLowerCase();
  const visibleProducts = keyword
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.code.toLowerCase().includes(keyword),
      )
    : products;

  const handleOpenChange = (productId: string, open: boolean) => {
    setOpenProductId(open ? productId : null);
    setSelectedSkuId(null);
  };

  /** 같은 행을 다시 누르면 선택이 풀린다 */
  const handleSelectSku = (skuId: string) =>
    setSelectedSkuId((prev) => (prev === skuId ? null : skuId));

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <Panel.Title>재고 관리</Panel.Title>
          <div className="mb-4 shrink-0">
            <SearchInput
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            {visibleProducts.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            ) : (
              <AccordionRows>
                {visibleProducts.map((product) => (
                  <InventoryProductRow
                    key={product.id}
                    product={product}
                    open={openProductId === product.id}
                    onOpenChange={(open) => handleOpenChange(product.id, open)}
                    selectedSkuId={selectedSkuId}
                    onSelectSku={handleSelectSku}
                  />
                ))}
              </AccordionRows>
            )}
          </Panel.Body>
        </Panel>
      }
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}
