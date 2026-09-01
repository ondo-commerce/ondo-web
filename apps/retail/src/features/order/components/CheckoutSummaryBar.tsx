"use client";

import { Button } from "@ondo/ui";
import Link from "next/link";
import { CHECKOUT_TEXT } from "../constants";
import { formatWon } from "../derive";

/**
 * 패널 바닥의 합계 바(`.sumbar`). 장바구니의 `CartSummaryBar`와 같은 구조다.
 *
 * **화면 하단 고정이 아니라 패널 바닥이다** — 확정 와이어프레임의 `.sumbar`가
 * sticky가 아니고, 이미 만든 장바구니·상품 상세도 패널 바닥이다. 바깥 구조는
 * 코드가 이긴다.
 *
 * `주문 접수하기`는 **되돌릴 수 없는 실행**이라 두 가지를 지킨다.
 * ① 누르기 전에 그 사실을 글자로 말한다(`접수한 뒤에는 …`).
 * ② 못 누를 때는 **진짜 `disabled` 버튼**이고 그 옆에 이유가 있다.
 *    `asChild + Link`로 두면 `disabled`가 `<a>`에 아무 효력이 없어 잠긴 채로도
 *    넘어가고, `aria-disabled`만 걸면 눌리기까지 한다(직전 회차 F11).
 */
export function CheckoutSummaryBar({
  amount,
  blockedReason,
  onSubmit,
}: {
  amount: number;
  /** 못 누르는 이유. null이면 누를 수 있다 */
  blockedReason: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="border-border bg-accent -mx-4 -mb-4 mt-4 rounded-b-panel border-t px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
        <div>
          <p className="text-muted-foreground text-body">
            {CHECKOUT_TEXT.finalAmount}
          </p>
          <p className="text-xl font-medium tabular-nums">
            {formatWon(amount)}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 phone:ml-0 phone:w-full">
          <Button asChild variant="line" className="phone:flex-1">
            <Link href="/cart">{CHECKOUT_TEXT.backToCart}</Link>
          </Button>
          <Button
            disabled={blockedReason !== null}
            onClick={onSubmit}
            className="phone:flex-1"
          >
            {CHECKOUT_TEXT.submit}
          </Button>
        </div>
      </div>

      {/* 못 누르는 이유와 "되돌릴 수 없다"는 고지가 같은 자리에서 바뀐다 —
          눈이 한 곳만 보면 된다. role=status라 낭독기도 바뀐 것을 듣는다 */}
      <p
        role="status"
        className="text-muted-foreground text-body mt-2.5 min-h-5"
      >
        {blockedReason ?? CHECKOUT_TEXT.irreversible}
      </p>
    </div>
  );
}
