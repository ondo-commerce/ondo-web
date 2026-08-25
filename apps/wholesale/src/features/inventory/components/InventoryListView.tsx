"use client";

import { AccordionRows, Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { InventoryInboundPanel } from "./InventoryInboundPanel";
import { InventoryProductRow } from "./InventoryProductRow";
import { SkuHistoryCard } from "./SkuHistoryCard";
import { SkuInboundCard } from "./SkuInboundCard";
import { formatMovementDate, inboundMovement } from "../derive";
import { stockHistory } from "../fixtures";
import type { InboundEntry, StockMovement } from "../types";
import type { Product } from "@/features/product";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 재고 관리 — 좌 목록(아코디언 + SKU 표) + 우 작업 패널.
 *
 * 우측은 한 화면 안에서 두 모드로 바뀐다. 다른 페이지가 아니다.
 *
 *   아무 상품도 안 펼침 → 빈 상태 문구
 *   상품 행 펼침        → 모드 A (상품 단위 일괄 입고 표)
 *     └ SKU 행 클릭     → 모드 B (입고 카드 + 변동 이력 카드)
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
  /** 화면에서 만든 입고 이력. 더미 이력은 fixtures에 있고 여기엔 새로 생긴 것만 쌓인다 */
  const [addedHistory, setAddedHistory] = useState<
    Record<string, StockMovement[]>
  >({});

  const keyword = query.trim().toLowerCase();
  const visibleProducts = keyword
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.code.toLowerCase().includes(keyword),
      )
    : products;

  const openProduct = products.find((p) => p.id === openProductId) ?? null;
  const selectedSku =
    openProduct?.skus.find((s) => s.id === selectedSkuId) ?? null;

  const handleOpenChange = (productId: string, open: boolean) => {
    setOpenProductId(open ? productId : null);
    setSelectedSkuId(null);
  };

  /** 같은 행을 다시 누르면 모드 A로 돌아간다 */
  const handleSelectSku = (skuId: string) =>
    setSelectedSkuId((prev) => (prev === skuId ? null : skuId));

  const receive = (entries: InboundEntry[]) => {
    if (!openProduct || entries.length === 0) return;
    // 오늘 날짜는 렌더가 아니라 버튼을 누른 이 순간에만 읽는다
    const date = formatMovementDate(new Date());

    const newRows: Record<string, StockMovement[]> = {};
    for (const entry of entries) {
      const sku = openProduct.skus.find((s) => s.id === entry.skuId);
      if (!sku) continue;
      newRows[entry.skuId] = [
        inboundMovement(entry.skuId, date, sku.stock, entry.qty),
      ];
    }

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

    setAddedHistory((prev) => {
      const next = { ...prev };
      for (const [skuId, rows] of Object.entries(newRows)) {
        next[skuId] = [...rows, ...(prev[skuId] ?? [])];
      }
      return next;
    });
  };

  const detail = () => {
    if (!openProduct) return undefined;

    if (selectedSku) {
      return (
        <>
          <SkuInboundCard
            key={selectedSku.id}
            productName={openProduct.name}
            productCode={openProduct.code}
            sku={selectedSku}
            onReceive={(entry) => receive([entry])}
          />
          <SkuHistoryCard
            movements={[
              ...(addedHistory[selectedSku.id] ?? []),
              ...stockHistory(selectedSku.id),
            ]}
          />
        </>
      );
    }

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
