import { AcceptStatusBadge } from "./OrderStatusBadge";
import { WholesalerOrderCard } from "./WholesalerOrderCard";
import { DETAIL_TEXT } from "../constants";
import { formatWon, legGroup, methodLabel, totalsOf } from "../derive";
import type { OrderLeg, OrderRecord } from "../types";

/**
 * 접수된 도매처 한 건. 값은 `GET /orders/{id}`의 도매처 건에서 온다.
 *
 * 바닥 줄(`.grp-box__foot`)이 **주문서에서 고른 것을 그대로 되돌려 준다** —
 * 서버가 저장한 수령·결제·수령인이라 완료 화면이 지어낼 것이 없다.
 *
 * 계좌 이체면 `입금액`, 사입삼촌 방문이면 `수령인`이 붙는다. **입금액은 상자
 * 머리 금액과 같은 `totalsOf` 하나에서 나온다** — 원본은 소계 327,000인데
 * 입금액이 318,000이었다(§6-1).
 */
export function OrderResultCard({
  order,
  leg,
}: {
  order: OrderRecord;
  leg: OrderLeg;
}) {
  const group = legGroup(order, leg);
  const amount = totalsOf(group.lines).amount;

  return (
    <WholesalerOrderCard
      group={group}
      badge={<AcceptStatusBadge accepted />}
      meta={
        <span className="text-muted-foreground tabular-nums">
          {DETAIL_TEXT.legNo(leg.legNo)}
        </span>
      }
      foot={
        <>
          <span className="text-muted-foreground">
            {methodLabel(leg.pickup, leg.payment)}
          </span>

          <span className="ml-auto tabular-nums phone:ml-0 phone:w-full">
            {leg.payment === "BANK_TRANSFER" && leg.bank !== null ? (
              <>
                입금 계좌{" "}
                <span className="font-medium">
                  {leg.bank.bankName} {leg.bank.accountNo}
                </span>{" "}
                <span className="text-muted-foreground">
                  예금주 {leg.bank.holder}
                </span>{" "}
                · 입금액{" "}
                <span className="font-medium">{formatWon(amount)}</span>
              </>
            ) : null}

            {leg.pickup === "AGENT" ? (
              <>
                {leg.payment === "BANK_TRANSFER" ? " · " : null}
                수령인 <span className="font-medium">
                  {order.agentName}
                </span>{" "}
                <span className="text-muted-foreground">
                  {order.agentPhone}
                </span>
              </>
            ) : null}
          </span>
        </>
      }
    />
  );
}
