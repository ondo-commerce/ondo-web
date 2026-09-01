import type { ReactNode } from "react";
import { CHECKOUT_TEXT } from "../constants";
import { formatSheets, formatWon, type OrderTotals } from "../derive";

/**
 * `.dl` 한 줄 — 라벨은 회색, 값은 우측정렬 tabular.
 * 640px 이하에서 1열로 접히고 값도 좌측정렬이 된다(원본 `_base.css` 실측).
 */
export function DescRow({
  term,
  children,
  strong,
}: {
  term: string;
  children: ReactNode;
  /** 마지막 합계 줄. 라벨이 검어지고 값이 커진다 */
  strong?: boolean;
}) {
  return (
    <>
      <dt
        className={
          strong ? "text-foreground font-medium" : "text-muted-foreground"
        }
      >
        {term}
      </dt>
      <dd
        className={`m-0 text-right tabular-nums phone:text-left ${
          strong ? "text-lg font-medium" : ""
        }`}
      >
        {children}
      </dd>
    </>
  );
}

/** `.dl` 격자. `auto 1fr`, 좁아지면 1열 */
export function DescList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      className={`text-body grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 phone:grid-cols-[minmax(0,1fr)] ${className ?? ""}`}
    >
      {children}
    </dl>
  );
}

/**
 * 결제 요약 4줄.
 *
 * **합계 바와 같은 `totals` 하나를 읽는다.** 장바구니에서 한 줄을 지우고
 * 돌아오면 두 자리가 같이 바뀐다 — 각자 더하면 한쪽만 안 따라오는 화면이 된다.
 */
export function PaymentSummary({
  totals,
  wholesalerCount,
}: {
  totals: OrderTotals;
  wholesalerCount: number;
}) {
  return (
    <section className="mt-6">
      <h3 className="text-muted-foreground text-body mb-2.5">
        {CHECKOUT_TEXT.paymentSection}
      </h3>

      <DescList>
        <DescRow term="상품 금액">{formatWon(totals.amount)}</DescRow>
        <DescRow term="총 장수">{formatSheets(totals.sheets)}</DescRow>
        <DescRow term="도매처">{wholesalerCount}곳</DescRow>
      </DescList>

      <div className="bg-border my-3 h-px" />

      <DescList>
        <DescRow term={CHECKOUT_TEXT.finalAmount} strong>
          {formatWon(totals.amount)}
        </DescRow>
      </DescList>
    </section>
  );
}
