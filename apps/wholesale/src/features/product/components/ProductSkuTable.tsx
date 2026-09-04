"use client";

import { ColorDot, Table } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ProductView, SkuView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/** 색상 단위로 묶는다. SKU = 색상 × 사이즈라서 색상이 그룹 축이 된다 */
function groupByColor(skus: readonly SkuView[]): Map<number, SkuView[]> {
  const map = new Map<number, SkuView[]>();
  for (const s of skus) {
    const list = map.get(s.colorId);
    if (list) list.push(s);
    else map.set(s.colorId, [s]);
  }
  return map;
}

/** 게시글이 등록된 상품의 펼침 내용. 가격이 붙어 있어 열이 많다 */
export function ProductSkuTable({ product }: { product: ProductView }) {
  const groups = [...groupByColor(product.skus)];
  // 첫 색상만 펼쳐 둔다 — 한 화면에 정보가 과하게 쏟아지지 않도록
  const [openColors, setOpenColors] = useState<number[]>(() => {
    const firstColor = groups[0]?.[0];
    return firstColor === undefined ? [] : [firstColor];
  });

  const toggle = (colorId: number) =>
    setOpenColors((prev) =>
      prev.includes(colorId)
        ? prev.filter((c) => c !== colorId)
        : [...prev, colorId],
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
        {groups.map(([colorId, skus]) => {
          const open = openColors.includes(colorId);
          const option = product.colors.find((c) => c.id === colorId);

          return skus.map((s, i) => {
            if (i > 0 && !open) return null;

            return (
              <Table.Row key={s.id}>
                <Table.Td align="left">
                  {i === 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(colorId)}
                      aria-expanded={open}
                      className="focus-visible:ring-ring flex items-center gap-1.5 rounded-button focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <ChevronRight
                        aria-hidden
                        className={`text-border-strong size-4 transition-transform ${open ? "rotate-90" : ""}`}
                      />
                      {/* hex는 서버 값이다. 색을 못 찾는 건 응답이 깨진 경우뿐이라 흰 점으로 눕힌다 */}
                      <ColorDot color={option?.hex ?? "#ffffff"} />
                      <span>{s.color}</span>
                    </button>
                  ) : null}
                </Table.Td>
                <Table.Td align="center">{s.size}</Table.Td>
                <Table.Td align="left" tone="muted">
                  {s.code}
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
