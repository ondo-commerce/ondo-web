"use client";

import { AccordionRow } from "@ondo/ui";
import type { ReactNode } from "react";
import type { TradeRelation } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 정산 목록의 거래처 한 행.
 *
 * tail의 두 숫자는 **파생값이다** — 주문 목록에서 센 건수와 원장에서 뒤집은 미수 잔액이다.
 * 상수로 적어 두면 입금 한 건만 등록해도 tail이 화면의 다른 숫자와 갈린다(01-pm.md §1.8).
 *
 * 펼친 영역의 내용은 이 컴포넌트가 정하지 않는다. 세그먼트(정산 상태·미수원장)를
 * 어느 쪽으로 볼지는 화면 상태이므로 호출부가 children으로 넣는다.
 */
export function RetailerRow({
  relation,
  orderCount,
  receivable,
  open,
  onOpenChange,
  children,
}: {
  relation: TradeRelation;
  orderCount: number;
  /** 미수 잔액(양수). 계정 잔액을 뒤집은 값이다 — `derive.outstandingReceivable` */
  receivable: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AccordionRow
      open={open}
      onOpenChange={onOpenChange}
      header={
        <span className="flex items-baseline gap-2">
          <span className="font-normal">{relation.retailerName}</span>
          <span className="text-muted-foreground text-sm">
            {relation.retailerCode}
          </span>
        </span>
      }
      tail={
        <span className="flex items-baseline gap-1.5">
          <span>주문 {orderCount}건 / 미수 잔액</span>
          <span className="text-foreground font-medium tabular-nums">
            {formatNumber(receivable)}원
          </span>
        </span>
      }
    >
      {children}
    </AccordionRow>
  );
}
