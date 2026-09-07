"use client";

import { ColorDot, Chip, Table } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { InventoryFilterBar } from "./InventoryFilterBar";
import { FILTER_ALL } from "../constants";
import { filterSkus, groupByColor, sumQuantities } from "../derive";
import type { InventoryProductView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/** 판매가능은 양수만 파랑이다. 0과 음수는 같은 회색 — 팔 수 없다는 뜻이 같다(§7 Q4) */
function availableClass(value: number): string {
  return value > 0 ? "text-primary" : "text-muted-foreground";
}

/**
 * 상품 행을 펼쳤을 때 나오는 SKU 재고 표. 상세 응답(`GET /products/{id}`)이 원본이고
 * 목록이 이미 받아 둔 것이라 펼칠 때 요청이 더 나가지 않는다.
 *
 * 행을 고르는 것 = 우측 패널을 모드 B로 바꾸는 것이다. 접힌 색상 그룹 행은
 * SKU 하나가 아니라 합계라서 **선택 대상이 아니다** — 누르면 펼쳐지기만 한다.
 */
export function InventoryStockTable({
  product,
  selectedSkuId,
  onSelectSku,
}: {
  product: InventoryProductView;
  selectedSkuId: number | null;
  onSelectSku: (variantId: number) => void;
}) {
  // 접힌 색상만 담는다. 재고를 훑는 화면이라 처음에는 전부 펼쳐 둔다
  const [closedColors, setClosedColors] = useState<string[]>([]);
  const [color, setColor] = useState(FILTER_ALL);
  const [size, setSize] = useState(FILTER_ALL);

  const colorNames = [...new Set(product.skus.map((s) => s.color))];
  const sizeNames = [...new Set(product.skus.map((s) => s.size))];

  const filtered = filterSkus(product.skus, color, size);
  const groups = groupByColor(filtered);

  const toggleColor = (name: string) =>
    setClosedColors((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );

  const colorCell = (name: string, hex: string, open: boolean) => (
    <button
      type="button"
      /* 행 클릭(=SKU 선택)과 겹치는 자리라 버블링을 끊는다 */
      onClick={(e) => {
        e.stopPropagation();
        toggleColor(name);
      }}
      aria-expanded={open}
      className="focus-visible:ring-ring flex items-center gap-1.5 rounded-button focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <ChevronRight
        aria-hidden
        className={`text-border-strong size-4 transition-transform ${open ? "rotate-90" : ""}`}
      />
      <ColorDot color={hex} />
      <span>{name}</span>
    </button>
  );

  return (
    <div>
      <InventoryFilterBar
        colors={colorNames}
        sizes={sizeNames}
        color={color}
        size={size}
        onColorChange={setColor}
        onSizeChange={setSize}
      />

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          조건에 맞는 SKU가 없습니다
        </p>
      ) : (
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Th align="left">색상</Table.Th>
              <Table.Th align="center">사이즈</Table.Th>
              <Table.Th align="left">SKU</Table.Th>
              <Table.Th>평균 원가</Table.Th>
              <Table.Th>현재고</Table.Th>
              <Table.Th>주문처리중</Table.Th>
              <Table.Th>미송대기</Table.Th>
              <Table.Th>판매가능</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {groups.map(([name, skus]) => {
              const open = !closedColors.includes(name);
              const hex = skus[0]?.colorHex ?? "#ffffff";

              /* 접힘 행 — 수량 4열은 그룹 합계다 */
              if (!open) {
                const totals = sumQuantities(skus);
                return (
                  <Table.Row key={name}>
                    <Table.Td align="left">
                      {colorCell(name, hex, false)}
                    </Table.Td>
                    <Table.Td align="center">
                      <span className="inline-block max-w-24 truncate align-middle">
                        {skus.map((s) => s.size).join(", ")}
                      </span>
                    </Table.Td>
                    <Table.Td align="left" tone="muted">
                      -
                    </Table.Td>
                    <Table.Td tone="muted">-</Table.Td>
                    <Table.Td>{formatNumber(totals.stock)}</Table.Td>
                    <Table.Td>{formatNumber(totals.reservedQty)}</Table.Td>
                    <Table.Td>{formatNumber(totals.backorderQty)}</Table.Td>
                    <Table.Td className={availableClass(totals.availableQty)}>
                      {formatNumber(totals.availableQty)}
                    </Table.Td>
                  </Table.Row>
                );
              }

              return skus.map((s, i) => (
                <Table.Row
                  key={s.id}
                  selected={selectedSkuId === s.id}
                  tabIndex={0}
                  aria-label={`${s.color} ${s.size} 재고 상세`}
                  className="cursor-pointer"
                  onClick={() => onSelectSku(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSku(s.id);
                    }
                  }}
                >
                  {/* 색상은 그룹 첫 행에만. 나머지 행의 색상 칸은 비운다 */}
                  <Table.Td align="left">
                    {i === 0 ? colorCell(name, hex, true) : null}
                  </Table.Td>
                  <Table.Td align="center">{s.size}</Table.Td>
                  <Table.Td align="left">
                    <Chip tone="sub" shape="square" className="text-body">
                      {s.code}
                    </Chip>
                  </Table.Td>
                  <Table.Td tone="muted">{formatNumber(s.avgCost)}</Table.Td>
                  <Table.Td>{formatNumber(s.stock)}</Table.Td>
                  <Table.Td>{formatNumber(s.reservedQty)}</Table.Td>
                  <Table.Td>{formatNumber(s.backorderQty)}</Table.Td>
                  <Table.Td className={availableClass(s.availableQty)}>
                    {formatNumber(s.availableQty)}
                  </Table.Td>
                </Table.Row>
              ));
            })}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}
