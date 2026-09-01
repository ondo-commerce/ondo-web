import { AcceptStatusBadge } from "./OrderStatusBadge";
import { WholesalerOrderCard } from "./WholesalerOrderCard";
import { formatWon, methodLabel, totalsOf } from "../derive";
import { bankAccountOf } from "../fixtures";
import type { ReceiptLeg } from "../types";

/**
 * 접수된 도매처 한 건.
 *
 * 바닥 줄(`.grp-box__foot`)이 **주문서에서 고른 것을 그대로 되돌려 준다.**
 * 코튼클럽을 `사입삼촌 방문 · 현금`으로 골랐으면 여기도 그렇고, 수령인은
 * 주문서에 친 이름이다 — 완료 화면이 자기 더미를 갖는 순간 두 화면이 다른
 * 말을 하게 된다.
 *
 * 계좌 이체면 `입금액`, 사입삼촌 방문이면 `수령인`이 붙는다. **입금액은 상자
 * 머리 금액과 같은 `totalsOf` 하나에서 나온다** — 원본은 소계 327,000인데
 * 입금액이 318,000이었다(§6-1). 두 값이 다른 상수에서 오면 언제든 또 갈린다.
 */
export function OrderResultCard({
  leg,
  agentName,
  agentPhone,
}: {
  leg: ReceiptLeg;
  agentName: string;
  agentPhone: string;
}) {
  const amount = totalsOf(leg.lines).amount;
  const account = bankAccountOf(leg.wholesalerName);

  return (
    <WholesalerOrderCard
      group={{
        wholesalerId: leg.wholesalerId,
        wholesalerName: leg.wholesalerName,
        wholesalerLocation: leg.wholesalerLocation,
        lines: leg.lines,
      }}
      badge={<AcceptStatusBadge status={leg.status} />}
      meta={
        <span className="text-muted-foreground tabular-nums">
          {leg.orderNo}
        </span>
      }
      foot={
        <>
          <span className="text-muted-foreground">
            {methodLabel(leg.pickup, leg.payment)}
          </span>

          <span className="ml-auto tabular-nums phone:ml-0 phone:w-full">
            {leg.payment === "TRANSFER" ? (
              <>
                입금 계좌{" "}
                <span className="font-medium">
                  {account.bankName} {account.accountNo}
                </span>{" "}
                <span className="text-muted-foreground">
                  예금주 {account.holder}
                </span>{" "}
                · 입금액{" "}
                <span className="font-medium">{formatWon(amount)}</span>
              </>
            ) : null}

            {leg.pickup === "AGENT" ? (
              <>
                {leg.payment === "TRANSFER" ? " · " : null}
                수령인 <span className="font-medium">{agentName}</span>{" "}
                <span className="text-muted-foreground">{agentPhone}</span>
              </>
            ) : null}
          </span>
        </>
      }
    />
  );
}
