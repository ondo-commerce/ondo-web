"use client";

import { AccordionRow } from "@ondo/ui";
import type { ReactNode } from "react";
import { EMPTY_MARK, SKU_GRID } from "../constants";
import { totalBackorderQty } from "../derive";
import type { BackorderSku } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 미송 목록의 SKU 한 행. 접힌 상태에서 6열이 다 보이고, 펼치면 그 SKU를 기다리는
 * 주문 배분 표가 아래에 붙는다.
 *
 * 재고 탭과 달리 **상품이 아니라 SKU가 행**이다 — 미송의 관리 단위가 SKU이기 때문이다
 * (glossary §4.8). 같은 상품의 다른 색·사이즈는 별개의 미송 줄이고 입고 시점도 다르다.
 */
export function BackorderSkuRow({
  sku,
  open,
  onOpenChange,
  children,
}: {
  sku: BackorderSku;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 펼친 본문(카운터 바 + 배분 표). 무엇을 펼칠지는 호출부가 정한다 */
  children: ReactNode;
}) {
  const total = totalBackorderQty(sku.lines);

  return (
    <AccordionRow
      open={open}
      onOpenChange={onOpenChange}
      header={
        /* 열 폭은 표 머리와 같은 상수를 쓴다. 여기만 고치면 목록이 어긋난다 */
        <span className={SKU_GRID}>
          <span className="truncate">{sku.id}</span>
          <span className="truncate">{sku.productName}</span>
          <span className="truncate text-center">{sku.color}</span>
          <span className="text-center">{sku.size}</span>
          <span className="text-right tabular-nums">{formatNumber(total)}</span>
          {/* 미등록은 `-`. 날짜가 들어오면 같은 자리에 그대로 그린다 */}
          <span className="text-muted-foreground text-right tabular-nums">
            {sku.eta ?? EMPTY_MARK}
          </span>
        </span>
      }
    >
      {children}
    </AccordionRow>
  );
}
