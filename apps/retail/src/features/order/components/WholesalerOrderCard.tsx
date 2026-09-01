"use client";

import type { ReactNode } from "react";
import { OrderLineItem } from "./OrderLineItem";
import {
  comboSheetsLabel,
  formatWon,
  productBlocks,
  totalsOf,
  type CheckoutGroup,
} from "../derive";

/**
 * 도매처 하나의 상자(`.grp-box`).
 *
 * **접수·확정·출고가 도매처마다 따로 돌기 때문에** 묶는다(RT-32). 장바구니의
 * `WholesalerGroup`과 같은 모양이고, 머리의 `N개 조합 · N장`·금액 표기도 같은
 * 문자열이다 — 두 화면을 오가며 비교할 때 다른 숫자가 나오면 안 된다.
 *
 * 머리 금액 · 명세 소계 · (완료 화면의) 입금액이 전부 `totalsOf` 하나에서
 * 나온다. 원본은 소계 327,000인데 입금액이 318,000이었다(§6-1) — 두 값이 서로
 * 다른 상수에서 오면 언제든 다시 갈린다.
 */
export function WholesalerOrderCard({
  group,
  badge,
  meta,
  children,
  foot,
}: {
  group: CheckoutGroup;
  /** 머리의 상태 배지. 주문서에는 없고 완료·모달에만 붙는다 */
  badge?: ReactNode;
  /** 배지 옆 회색 보조값(도매처별 주문번호 등) */
  meta?: ReactNode;
  /** 명세 아래에 붙는 것 — 수령·결제 줄, 계좌 안내 */
  children?: ReactNode;
  /** 상자 바닥 줄(`.grp-box__foot`) */
  foot?: ReactNode;
}) {
  const totals = totalsOf(group.lines);

  return (
    <section
      aria-label={`${group.wholesalerName} 주문`}
      className="border-border mt-3 overflow-hidden rounded-control border first:mt-0"
    >
      <div className="bg-accent border-border text-body flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3.5 py-2.5">
        <h4 className="text-sm font-medium">{group.wholesalerName}</h4>
        {badge}
        {meta ?? (
          <span className="text-muted-foreground min-w-0 truncate">
            {group.wholesalerLocation}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
          <span className="text-muted-foreground">
            {comboSheetsLabel(totals)}
          </span>
          <span className="font-medium tabular-nums">
            {formatWon(totals.amount)}
          </span>
        </span>
      </div>

      <div className="px-3.5">
        <ul>
          {productBlocks(group.lines).map((block) => (
            <OrderLineItem key={block.productId} block={block} />
          ))}
        </ul>
        {children ? <div className="pt-3 pb-1">{children}</div> : null}
      </div>

      {foot ? (
        <div className="bg-accent border-border text-body flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t px-3.5 py-2.5">
          {foot}
        </div>
      ) : null}
    </section>
  );
}
