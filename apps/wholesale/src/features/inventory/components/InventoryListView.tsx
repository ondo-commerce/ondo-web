"use client";

import { AccordionRows, Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { InventoryInboundPanel } from "./InventoryInboundPanel";
import { InventoryProductRow } from "./InventoryProductRow";
import type { InboundEntry } from "../types";
import type { Product } from "@/features/product";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 재고 관리 — 좌 목록(아코디언 + SKU 표) + 우 작업 패널.
 *
 * 우측은 한 화면 안에서 모드가 바뀐다. 다른 페이지가 아니다.
 *
 *   아무 상품도 안 펼침 → 빈 상태 문구
 *   상품 행 펼침        → 모드 A (상품 단위 일괄 입고 표)
 *
 * **다른 상품을 펼치면 SKU 선택이 반드시 풀린다.** 안 풀면 A상품 목록 옆에
 * B상품 SKU 카드가 남는다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 이 컴포넌트가
 * 목록을 받는 자리(products prop)에서 세 상태를 갈라야 한다.
 */
export function InventoryListView({
  products: initialProducts,
}: {
  products: Product[];
}) {
  /*
   * 입고 처리는 서버가 없어서 로컬 상태로 반영한다. 그래서 목록을 prop 그대로
   * 그리지 않고 state로 들고 있는다 — 현재고가 늘면 판매가능도 같이 움직여야 한다.
   */
  const [products, setProducts] = useState(initialProducts);
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

  const openProduct = products.find((p) => p.id === openProductId) ?? null;

  const handleOpenChange = (productId: string, open: boolean) => {
    setOpenProductId(open ? productId : null);
    setSelectedSkuId(null);
  };

  /** 같은 행을 다시 누르면 선택이 풀린다 */
  const handleSelectSku = (skuId: string) =>
    setSelectedSkuId((prev) => (prev === skuId ? null : skuId));

  const receive = (entries: InboundEntry[]) => {
    if (!openProduct || entries.length === 0) return;

    setProducts((prev) =>
      prev.map((p) =>
        p.id !== openProduct.id
          ? p
          : {
              ...p,
              skus: p.skus.map((s) => {
                const entry = entries.find((e) => e.skuId === s.id);
                return entry ? { ...s, stock: s.stock + entry.qty } : s;
              }),
            },
      ),
    );
  };

  const detail = () => {
    if (!openProduct) return undefined;

    /* key: 다른 상품으로 바뀌면 입력값이 남지 않게 상태째 새로 만든다 */
    return (
      <InventoryInboundPanel
        key={openProduct.id}
        product={openProduct}
        onReceive={receive}
      />
    );
  };

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
      detail={detail()}
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}
