"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { ProductRow } from "./ProductRow";
import type { Product } from "../types";

/**
 * 상품 목록 표 5열 + 맨 앞의 펼침 열.
 *
 * 주문 탭(`OrderTable`)과 같은 구조다. 첫 열은 머리글이 없다 — chevron만 들어가는
 * 자리라 이름 붙일 값이 없다. 행 하나를 그리는 책임은 `ProductRow`에 있다
 * (펼침 영역이 두 번째 `<tr>`이라 여기서 행을 직접 그리면 `<tbody>` 자식 구조가 읽히지 않는다).
 *
 * 주문 표와 달리 금액 열이 없어서 열이 5개뿐이다. 그래도 표로 두는 이유는
 * 품번과 구성이 세로로 훑히기 때문이다 — 아코디언에서는 같은 값이 행마다 다른 자리에 놓였다.
 */
export function ProductTable({
  products,
  openProductId,
  onToggle,
  renderDetail,
}: {
  products: readonly Product[];
  openProductId: string | null;
  onToggle: (productId: string) => void;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (product: Product) => ReactNode;
}) {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th className="w-8" />
          <Table.Th align="left">품번</Table.Th>
          <Table.Th align="left">품명</Table.Th>
          <Table.Th align="left">카테고리</Table.Th>
          <Table.Th align="center">구성</Table.Th>
          <Table.Th align="center">게시</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {products.map((product) => {
          const open = openProductId === product.id;
          return (
            <ProductRow
              key={product.id}
              product={product}
              open={open}
              onToggle={() => onToggle(product.id)}
            >
              {open ? renderDetail(product) : null}
            </ProductRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}
