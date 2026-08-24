"use client";

import { AccordionRow } from "@ondo/ui";
import type { ReactNode } from "react";
import type { Retailer } from "../types";

/**
 * 목록의 소매처 한 행. **세 단계가 이 행을 공유한다** — 바뀌는 것은 꼬리 요약 단위
 * (`SKU 6건 · 55개` ↔ `PKG 3건 · 66개`)와 펼친 본문뿐이라, 단계마다 행을 따로 두면
 * 같은 셸이 세 벌이 된다.
 *
 * 무엇을 펼쳐 보여줄지는 부르는 쪽이 정한다. 이 행은 단계를 모른다.
 */
export function RetailerAccordionRow({
  retailer,
  summary,
  open,
  onOpenChange,
  children,
}: {
  retailer: Retailer;
  /** 행 우측 꼬리 문구. 단계별 요약 함수가 만든 값을 그대로 받는다 */
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AccordionRow
      open={open}
      onOpenChange={onOpenChange}
      tail={summary}
      header={
        <span className="flex items-baseline gap-2">
          <span className="font-medium">{retailer.name}</span>
          <span className="text-muted-foreground text-sm">{retailer.code}</span>
        </span>
      }
    >
      {children}
    </AccordionRow>
  );
}
