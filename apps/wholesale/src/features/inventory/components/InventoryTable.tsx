"use client";

import { Table } from "@ondo/ui";
import { InventoryProductRow } from "./InventoryProductRow";
import type { Product } from "@/features/product";

/**
 * 재고 목록 표 5열 + 맨 앞의 펼침 열. 주문 탭(`OrderTable`)과 같은 구조다.
 *
 * **아코디언에서 표로 바뀌었다.** 예전에는 `SKU 수 N`이 행 우측 끝에 회색 꼬리로 붙어
 * 있었는데, 꼬리는 폭이 내용 길이를 따라가서 행마다 숫자가 다른 자리에 놓였다.
 * 열로 세우면 세로로 훑힌다 — 재고 탭에서 실제로 하는 일이 그것이다.
 *
 * 현재고·판매가능은 SKU 합계다. **공식은 `derive.ts`에만 있다**(`sumQuantities` →
 * `availableQty`) — 판매가능을 여기서 다시 빼면 우측 입고 패널의 숫자와 갈린다.
 *
 * `stickyHead`를 켜므로 부르는 쪽이 `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function InventoryTable({
  products,
  openProductId,
  onToggle,
  selectedSkuId,
  onSelectSku,
}: {
  products: readonly Product[];
  openProductId: string | null;
  onToggle: (productId: string) => void;
  selectedSkuId: string | null;
  onSelectSku: (skuId: string) => void;
}) {
  return (
    <Table stickyHead>
      <Table.Head>
        <Table.Row>
          {/* 첫 열은 chevron만 들어가는 자리라 붙일 이름이 없다 */}
          <Table.Th className="w-8" />
          <Table.Th align="left">품번</Table.Th>
          <Table.Th align="left">품명</Table.Th>
          <Table.Th>SKU 수</Table.Th>
          <Table.Th>현재고</Table.Th>
          <Table.Th>판매가능</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {products.map((product) => (
          <InventoryProductRow
            key={product.id}
            product={product}
            open={openProductId === product.id}
            onToggle={() => onToggle(product.id)}
            selectedSkuId={selectedSkuId}
            onSelectSku={onSelectSku}
          />
        ))}
      </Table.Body>
    </Table>
  );
}
