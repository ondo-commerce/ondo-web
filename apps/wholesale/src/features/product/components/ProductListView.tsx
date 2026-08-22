"use client";

import { AccordionRows, Button, Panel, SearchInput } from "@ondo/ui";
import Link from "next/link";
import { useState } from "react";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { ProductRow } from "./ProductRow";
import type { Product } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 상품 관리 — 좌 목록(아코디언) + 우 상세.
 * 행을 펼치는 것과 우측 상세를 고르는 것은 같은 동작이다. 한 번에 한 행만 펼친다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A). 딥링크가 필요해지면
 * 그때 쿼리스트링으로 올린다.
 */
export function ProductListView({ products }: { products: Product[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = products.find((p) => p.id === selectedId) ?? null;

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <div className="mb-4 flex shrink-0 justify-between gap-3">
            <SearchInput
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
            />
            <Button asChild variant="line" className="mr-4">
              <Link href="/products/new">상품 등록</Link>
            </Button>
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            <AccordionRows>
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  open={selectedId === product.id}
                  onOpenChange={(open) =>
                    setSelectedId(open ? product.id : null)
                  }
                />
              ))}
            </AccordionRows>
          </Panel.Body>
        </Panel>
      }
      detail={selected ? <ProductDetailPanel product={selected} /> : undefined}
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}
