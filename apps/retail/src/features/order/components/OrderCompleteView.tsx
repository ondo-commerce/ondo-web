"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DescList, DescRow } from "./PaymentSummary";
import { OrderResultCard } from "./OrderResultCard";
import { AcceptStatusBadge } from "./OrderStatusBadge";
import { PartialAcceptDialog } from "./PartialAcceptDialog";
import {
  COMPLETE_ACTION_ID,
  COMPLETE_EMPTY,
  COMPLETE_TEXT,
  PARTIAL_TEXT,
} from "../constants";
import {
  checkingLegs,
  comboSheetsLabel,
  formatSheets,
  formatWon,
  receiptTotals,
  rejectedLegs,
  totalsOf,
} from "../derive";
import { retryRejectedLegs, useOrderReceipt } from "../store";

/**
 * 주문 완료 한 장(+ 조건부 패널 하나 + 조건부 모달 하나).
 *
 * 화면에 뜨는 값이 **전부 접수 결과 하나에서 나온다.** 수령·결제·수령인은
 * 주문서에서 고른 값 그대로고, 도매처 머리 금액 · 입금액 · 아래 합계는 같은
 * `totalsOf`를 부른다 — 원본 §6-1(소계 327,000인데 입금액 318,000)이 코드로
 * 옮겨오지 않게.
 *
 * **`실패`라는 낱말이 이 화면 어디에도 없다**(RT-43).
 */
export function OrderCompleteView({
  onRetried,
}: {
  /**
   * 다시 시도한 조합의 lineId. 접수와 같은 이유로 장바구니에서 빠져야 한다 —
   * 다시 보낸 물건이 장바구니에도 남아 있으면 합계가 두 곳에서 서로 다른
   * 것을 세게 된다. 장바구니를 만지는 것은 조립부의 몫이다(가정 A10).
   */
  onRetried: (lineIds: readonly string[]) => void;
}) {
  const receipt = useOrderReceipt();
  /* 모달은 열린 채로 시작한다 — 접수 결과에 안 된 건이 있으면 그걸 먼저 봐야
     한다. 닫으면 그 아래 완료 화면이 그대로 남는다 */
  const [dismissed, setDismissed] = useState(false);
  const [retried, setRetried] = useState(false);

  if (!receipt) {
    return (
      <div className="mx-auto max-w-wrap">
        <Panel>
          <div className="py-16 text-center">
            <h2 className="text-base font-medium">{COMPLETE_EMPTY.title}</h2>
            <p className="text-muted-foreground text-body mt-1.5">
              {COMPLETE_EMPTY.description}
            </p>
            <Button asChild variant="line" className="mt-3.5">
              <Link href="/orders">{COMPLETE_TEXT.viewOrders}</Link>
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const accepted = receipt.legs.filter((leg) => leg.status === "ACCEPTED");
  const rejected = rejectedLegs(receipt);
  /* 합계·도매처 수는 **접수가 살아 있는 건 전부**를 센다 — 응답이 늦는
     도매처도 같은 주문의 일부라 아래 패널에 서 있다. 안 된 건만 빠진다 */
  const progressing = receipt.legs.filter((leg) => leg.status !== "REJECTED");
  const checking = checkingLegs(receipt);
  const totals = receiptTotals(receipt);

  /* 모달을 닫으면 포커스가 `<body>`로 떨어진다 — 이 모달은 누른 버튼이 없어서
     Radix가 되돌릴 자리를 모른다. 화면에서 다음에 할 일이 `주문 내역 보기`라
     그쪽으로 옮긴다 */
  const focusNext = () => {
    document.getElementById(COMPLETE_ACTION_ID)?.focus();
  };

  const handleRetry = () => {
    const resent = rejected.flatMap((leg) =>
      leg.lines.map((line) => line.lineId),
    );

    retryRejectedLegs();
    onRetried(resent);
    setRetried(true);
    setDismissed(true);
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={
            <>
              통합 주문번호{" "}
              <b className="text-foreground font-medium tabular-nums">
                {receipt.orderNo}
              </b>{" "}
              · {receipt.placedAt} · 도매처 {receipt.legs.length}곳
            </>
          }
          action={
            <Button asChild variant="line">
              <Link id={COMPLETE_ACTION_ID} href="/orders">
                {COMPLETE_TEXT.viewOrders}
              </Link>
            </Button>
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

        {/* 다시 시도한 결과를 화면에 남긴다. 모달을 닫고 나면 무슨 일이
            있었는지 말해 주는 자리가 여기밖에 없다 */}
        <p
          role="status"
          className="text-secondary-foreground text-body mt-2 empty:hidden"
        >
          {retried ? PARTIAL_TEXT.retried : ""}
        </p>

        <section className="mt-6">
          {accepted.map((leg) => (
            <OrderResultCard
              key={leg.wholesalerId}
              leg={leg}
              agentName={receipt.agentName}
              agentPhone={receipt.agentPhone}
            />
          ))}
        </section>

        <section className="mt-6">
          <DescList>
            <DescRow term="총 장수">{formatSheets(totals.sheets)}</DescRow>
            <DescRow term="도매처">{progressing.length}곳</DescRow>
            <DescRow term="합계" strong>
              {formatWon(totals.amount)}
            </DescRow>
          </DescList>
        </section>
      </Panel>

      {/* 지연된 도매처가 없으면 이 패널을 아예 그리지 않는다 — 아무 일도 없는데
          "늦어질 때" 상자가 서 있으면 사장이 자기 주문이 늦는 줄 안다 */}
      {checking.length > 0 ? (
        <Panel className="mt-2">
          <Panel.Title sub={COMPLETE_TEXT.delaySub}>
            {COMPLETE_TEXT.delayTitle}
          </Panel.Title>

          {checking.map((leg) => (
            <section
              key={leg.wholesalerId}
              aria-label={`${leg.wholesalerName} 접수 상태`}
              className="border-border bg-accent text-body mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control border px-3.5 py-2.5 first:mt-0"
            >
              <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
              <AcceptStatusBadge status={leg.status} />
              <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
                <span className="text-muted-foreground">
                  {comboSheetsLabel(totalsOf(leg.lines))}
                </span>
                <span className="font-medium tabular-nums">
                  {formatWon(totalsOf(leg.lines).amount)}
                </span>
              </span>
            </section>
          ))}
        </Panel>
      ) : null}

      {rejected.length > 0 ? (
        <PartialAcceptDialog
          receipt={receipt}
          open={!dismissed}
          onOpenChange={(next) => setDismissed(!next)}
          onCloseFocus={focusNext}
          onRetry={handleRetry}
        />
      ) : null}
    </div>
  );
}
