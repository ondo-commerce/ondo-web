"use client";

import { ColorDot, Table } from "@ondo/ui";
import { useState } from "react";
import type { Product, Sku } from "../types";
import { formatNumber } from "@/shared/lib/format";

/** 색상 단위로 묶는다. SKU = 색상 × 사이즈라서 색상이 그룹 축이 된다 */
function groupByColor(skus: Sku[]): Map<string, Sku[]> {
  const map = new Map<string, Sku[]>();
  for (const s of skus) {
    const list = map.get(s.color);
    if (list) list.push(s);
    else map.set(s.color, [s]);
  }
  return map;
}

/** 게시글이 등록된 상품의 펼침 내용. 가격이 붙어 있어 열이 많다 */
export function ProductSkuTable({ product }: { product: Product }) {
  const groups = [...groupByColor(product.skus)];
  // 첫 색상만 펼쳐 둔다 — 한 화면에 정보가 과하게 쏟아지지 않도록
  const [openColors, setOpenColors] = useState<string[]>(() => {
    const firstColor = groups[0]?.[0];
    return firstColor ? [firstColor] : [];
  });

  const toggle = (color: string) =>
    setOpenColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    );

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">색상</Table.Th>
          <Table.Th align="center">사이즈</Table.Th>
          <Table.Th align="left">SKU</Table.Th>
          <Table.Th>현재고</Table.Th>
          <Table.Th>주문 제한</Table.Th>
          <Table.Th>평균원가(원)</Table.Th>
          <Table.Th>판매가(원)</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {groups.map(([color, skus]) => {
          const open = openColors.includes(color);
          const option = product.colors.find((c) => c.name === color);

          return skus.map((s, i) => {
            if (i > 0 && !open) return null;

            return (
              <Table.Row key={s.id}>
                <Table.Td align="left">
                  {i === 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(color)}
                      aria-expanded={open}
                      className="focus-visible:ring-ring flex items-center gap-1.5 rounded-button focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className={`text-border-strong size-3 transition-transform ${open ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M4.5 2.5 8 6l-3.5 3.5" />
                      </svg>
                      <ColorDot color={option?.hex ?? "#ffffff"} />
                      <span>{option?.displayName ?? color}</span>
                    </button>
                  ) : null}
                </Table.Td>
                <Table.Td align="center">{s.size}</Table.Td>
                <Table.Td align="left" tone="muted">
                  {s.id}
                </Table.Td>
                <Table.Td tone={s.stock === 0 ? "danger" : "default"}>
                  {formatNumber(s.stock)}
                </Table.Td>
                <Table.Td tone="muted">{formatNumber(s.orderLimit)}</Table.Td>
                <Table.Td tone="muted">{formatNumber(s.avgCost)}</Table.Td>
                <Table.Td>{formatNumber(s.price)}</Table.Td>
              </Table.Row>
            );
          });
        })}
      </Table.Body>
    </Table>
  );
}
