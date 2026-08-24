"use client";

import { Button, Chip, ColorDot, Input, Panel, Table } from "@ondo/ui";
import { useState } from "react";
import { InboundConfirmDialog } from "./InboundConfirmDialog";
import { estimatedAmount, parseNumberInput } from "../derive";
import type { InboundEntry } from "../types";
import type { Product } from "@/features/product";
import { formatNumber } from "@/shared/lib/format";

/** 입력칸은 문자열로 들고 있는다 — 빈칸과 0을 구분해야 해서 숫자로 바로 못 바꾼다 */
interface InboundInput {
  qty: string;
  unitPrice: string;
}

const EMPTY: InboundInput = { qty: "", unitPrice: "" };

/**
 * 우측 모드 A — 상품 단위 일괄 입고 표.
 * 상품 행을 펼쳤고 SKU 행은 아직 고르지 않은 상태에서 보인다.
 *
 * 행은 **그 상품의 SKU 전부**다. 좌측 표에서 색상을 접거나 필터를 걸어도
 * 여기서는 줄지 않는다 — 좌측은 보는 화면이고 여기는 적는 화면이라, 안 보이는
 * 줄에 값이 남아 있는 채로 입고되는 상황을 만들지 않기 위해서다.
 *
 * 매입단가는 **빈칸으로 시작한다**(§7 Q3). 직전 값이 남아 있으면 이번 입고분의
 * 단가가 아닌 값이 그대로 확정된다.
 */
export function InventoryInboundPanel({
  product,
  onReceive,
}: {
  product: Product;
  onReceive: (entries: InboundEntry[]) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, InboundInput>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const inputOf = (skuId: string) => inputs[skuId] ?? EMPTY;

  const setField = (skuId: string, field: keyof InboundInput, raw: string) =>
    setInputs((prev) => ({
      ...prev,
      [skuId]: {
        ...(prev[skuId] ?? EMPTY),
        [field]: raw.replace(/[^0-9]/g, ""),
      },
    }));

  /* 수량을 적은 줄만 입고 대상이다. 단가만 적힌 줄은 입고가 아니다 */
  const entries: InboundEntry[] = product.skus.flatMap((s) => {
    const qty = parseNumberInput(inputOf(s.id).qty);
    if (qty === null || qty === 0) return [];
    return [
      {
        skuId: s.id,
        qty,
        unitPrice: parseNumberInput(inputOf(s.id).unitPrice),
      },
    ];
  });

  const totalQty = entries.reduce((sum, e) => sum + e.qty, 0);

  const confirm = () => {
    onReceive(entries);
    setInputs({});
    setConfirmOpen(false);
  };

  /* 색상은 그룹의 첫 행에만 그린다. 좌측 표와 같은 규칙이다 */
  const firstOfColor = new Map<string, string>();
  for (const s of product.skus) {
    if (!firstOfColor.has(s.color)) firstOfColor.set(s.color, s.id);
  }

  return (
    <Panel className="flex-1">
      <Panel.Title action={<Chip tone="sub">{product.code}</Chip>}>
        {product.name}
      </Panel.Title>

      <Panel.Body>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Th align="left">색상</Table.Th>
              <Table.Th align="center">사이즈</Table.Th>
              <Table.Th>입고수량</Table.Th>
              <Table.Th>매입단가</Table.Th>
              <Table.Th>예상 금액</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {product.skus.map((s) => {
              const value = inputOf(s.id);
              const amount = estimatedAmount(
                parseNumberInput(value.qty),
                parseNumberInput(value.unitPrice),
              );
              const option = product.colors.find((c) => c.name === s.color);

              return (
                <Table.Row key={s.id}>
                  <Table.Td align="left">
                    {firstOfColor.get(s.color) === s.id ? (
                      <span className="flex items-center gap-1.5">
                        <ColorDot color={option?.hex ?? "#ffffff"} />
                        <span>{option?.displayName ?? s.color}</span>
                      </span>
                    ) : null}
                  </Table.Td>
                  <Table.Td align="center">{s.size}</Table.Td>
                  <Table.Td>
                    <Input
                      size="sm"
                      numeric
                      inputMode="numeric"
                      className="w-20"
                      aria-label={`${s.color} ${s.size} 입고수량`}
                      value={value.qty}
                      onChange={(e) => setField(s.id, "qty", e.target.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Input
                      size="sm"
                      numeric
                      inputMode="numeric"
                      className="w-20"
                      aria-label={`${s.color} ${s.size} 매입단가`}
                      value={value.unitPrice}
                      onChange={(e) =>
                        setField(s.id, "unitPrice", e.target.value)
                      }
                    />
                  </Table.Td>
                  {/* 둘 중 하나만 적혀 있으면 빈칸이다. 0원은 "공짜로 받았다"로 읽힌다(§7 Q5) */}
                  <Table.Td>
                    {amount === null ? "" : formatNumber(amount)}
                  </Table.Td>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </Panel.Body>

      <div className="mt-4 flex shrink-0 justify-end">
        <Button
          disabled={entries.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          입고 처리
        </Button>
      </div>

      <InboundConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirm}
        description={
          <>
            {product.name} · SKU {entries.length}줄에 총{" "}
            <b className="text-foreground">{formatNumber(totalQty)}개</b>를
            입고합니다.
            <br />
            처리하면 좌측 표의 현재고가 바로 늘어납니다.
          </>
        }
      />
    </Panel>
  );
}
