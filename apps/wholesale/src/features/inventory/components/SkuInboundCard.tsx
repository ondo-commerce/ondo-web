"use client";

import { Button, Chip, Input, Panel, cn } from "@ondo/ui";
import { useState, type ReactNode } from "react";
import { InboundConfirmDialog } from "./InboundConfirmDialog";
import { parseNumberInput, stockAfterInbound, totalAmount } from "../derive";
import type { InboundEntry } from "../types";
import type { Sku } from "@/features/product";
import { formatNumber } from "@/shared/lib/format";

/**
 * 라벨-값 한 줄. 좌우 두 열이 같은 높이로 맞아야 `현재고 / +추가 재고 / 변동 후 재고`가
 * 위아래 계산식으로 읽힌다 — 그래서 높이를 고정한다.
 */
function Row({
  label,
  children,
  divider,
}: {
  label: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between gap-3",
        divider && "border-border border-b",
      )}
    >
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      {children}
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-sm tabular-nums">{children}</span>;
}

/** 파생값 두 개는 이 카드에서 가장 큰 글자다. 입력의 결과가 결론이기 때문이다 */
function Result({ children }: { children: ReactNode }) {
  return <span className="text-lg font-bold tabular-nums">{children}</span>;
}

/**
 * 우측 모드 B 카드 1 — SKU 한 줄 입고.
 *
 * `입력재고`는 별도 입력이 아니라 **`추가 재고`의 미러**다. 라벨 앞의 `+` `×`는
 * 장식이 아니라 위아래 값의 연산 관계를 읽히게 하는 기호다.
 */
export function SkuInboundCard({
  productName,
  productCode,
  sku,
  onReceive,
}: {
  productName: string;
  productCode: string;
  sku: Sku;
  onReceive: (entry: InboundEntry) => void;
}) {
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const added = parseNumberInput(qty);
  const price = parseNumberInput(unitPrice);
  const after = stockAfterInbound(sku.stock, added);
  const amount = totalAmount(added, price);

  const confirm = () => {
    if (added === null || added === 0) return;
    onReceive({ skuId: sku.id, qty: added, unitPrice: price });
    setQty("");
    setUnitPrice("");
    setConfirmOpen(false);
  };

  return (
    <Panel className="shrink-0">
      <Panel.Title action={<Chip tone="sub">{productCode}</Chip>}>
        {productName} · {sku.color}/{sku.size}
      </Panel.Title>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <Row label="현재고">
            <Value>{formatNumber(sku.stock)}</Value>
          </Row>
          <Row label="+ 추가 재고" divider>
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              className="w-24"
              aria-label="추가 재고"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </Row>
          <Row label="변동 후 재고">
            <Result>{formatNumber(after)}개</Result>
          </Row>
        </div>

        <div>
          {/* 입력재고 = 추가 재고의 미러. 따로 적는 값이 아니라 읽기 전용이다 */}
          <Row label="입력재고">
            <Value>{formatNumber(added ?? 0)}</Value>
          </Row>
          <Row label="× 매입단가" divider>
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              className="w-24"
              aria-label="매입단가"
              value={unitPrice}
              onChange={(e) =>
                setUnitPrice(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </Row>
          <Row label="총 금액">
            {/* 수량·단가 중 하나만 적혀 있으면 빈칸이다(§7 Q5와 같은 규칙) */}
            <Result>
              {amount === null ? "" : `${formatNumber(amount)}원`}
            </Result>
          </Row>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          disabled={added === null || added === 0}
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
            {sku.color}/{sku.size} · 현재고 {formatNumber(sku.stock)}개 →{" "}
            <b className="text-foreground">{formatNumber(after)}개</b>로
            늘립니다.
            <br />
            처리하면 변동 이력 맨 위에 입고 한 줄이 남습니다.
          </>
        }
      />
    </Panel>
  );
}
