"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DescList, DescRow } from "./PaymentSummary";
import { OrderResultCard } from "./OrderResultCard";
import { PartialAcceptDialog } from "./PartialAcceptDialog";
import {
  COMPLETE_ACTION_ID,
  COMPLETE_EMPTY,
  COMPLETE_TEXT,
  ORDER_PATH,
} from "../constants";
import { formatSheets, formatWon, orderTotals } from "../derive";
import { useRejectedLegs } from "../store";
import type { OrderRecord } from "../types";

/**
 * 주문 완료 한 장(+ 조건부 모달 하나).
 *
 * 본문은 **`GET /orders/{orderId}`로 그린다** — 접수 응답을 주소로 옮길 수 없어서
 * (안 된 도매처의 사유가 자유 문장이다) 서버가 저장한 주문을 다시 읽는다. 수령·
 * 결제·수령인은 서버가 저장한 값이고, 도매처 머리 금액 · 입금액 · 아래 합계는
 * 같은 `totalsOf`를 부른다 — 원본 §6-1(소계 327,000인데 입금액 318,000)이
 * 코드로 옮겨오지 않게.
 *
 * 안 된 도매처는 주문에 없어 그 응답에 없다 — 접수 직후 세션에 남긴 것을
 * 읽어 모달을 띄운다(`useRejectedLegs`). 새로고침하면 모달만 사라진다.
 *
 * **`실패`라는 낱말이 이 화면 어디에도 없다**(RT-43).
 */
export function OrderCompleteView({ order }: { order: OrderRecord | null }) {
  const rejected = useRejectedLegs(order?.orderId ?? 0);
  /* 모달은 열린 채로 시작한다 — 접수 결과에 안 된 건이 있으면 그걸 먼저 봐야
     한다. 닫으면 그 아래 완료 화면이 그대로 남는다 */
  const [dismissed, setDismissed] = useState(false);

  if (order === null) {
    return (
      <div className="mx-auto max-w-wrap">
        <Panel>
          <div className="py-16 text-center">
            <h2 className="text-base font-medium">{COMPLETE_EMPTY.title}</h2>
            <p className="text-muted-foreground text-body mt-1.5">
              {COMPLETE_EMPTY.description}
            </p>
            <Button asChild variant="line" className="mt-3.5">
              <Link href={ORDER_PATH.orders}>{COMPLETE_TEXT.viewOrders}</Link>
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const totals = orderTotals(order);

  /* 모달을 닫으면 포커스가 `<body>`로 떨어진다 — 이 모달은 누른 버튼이 없어서
     Radix가 되돌릴 자리를 모른다. 화면에서 다음에 할 일이 `주문 내역 보기`라
     그쪽으로 옮긴다 */
  const focusNext = () => {
    document.getElementById(COMPLETE_ACTION_ID)?.focus();
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={
            <>
              통합 주문번호{" "}
              <b className="text-foreground font-medium tabular-nums">
                {order.orderNo}
              </b>{" "}
              · {order.orderedAt} · 도매처 {order.legs.length}곳
            </>
          }
          action={
            <div className="flex items-center gap-2">
              <Button asChild variant="line">
                <Link href={ORDER_PATH.order(order.orderId)}>
                  {COMPLETE_TEXT.viewDetail}
                </Link>
              </Button>
              <Button asChild variant="line">
                <Link id={COMPLETE_ACTION_ID} href={ORDER_PATH.orders}>
                  {COMPLETE_TEXT.viewOrders}
                </Link>
              </Button>
            </div>
          }
        >
          {COMPLETE_TEXT.title}
        </Panel.Title>

        <Notice>
          <span className="flex items-start gap-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {COMPLETE_TEXT.notice}
          </span>
        </Notice>

        <section className="mt-6">
          {order.legs.map((leg) => (
            <OrderResultCard
              key={leg.wholesaleOrderId}
              order={order}
              leg={leg}
            />
          ))}
        </section>

        <section className="mt-6">
          <DescList>
            <DescRow term="총 장수">{formatSheets(totals.sheets)}</DescRow>
            <DescRow term="도매처">{order.legs.length}곳</DescRow>
            <DescRow term="합계" strong>
              {formatWon(totals.amount)}
            </DescRow>
          </DescList>
        </section>
      </Panel>

      {rejected.length > 0 ? (
        <PartialAcceptDialog
          order={order}
          rejected={rejected}
          open={!dismissed}
          onOpenChange={(next) => setDismissed(!next)}
          onCloseFocus={focusNext}
        />
      ) : null}
    </div>
  );
}
