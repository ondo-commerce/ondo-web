"use client";

import { Button } from "@ondo/ui";
import Link from "next/link";
import type { MouseEvent } from "react";
import { QTY_UNIT } from "@/shared/qty";
import { LEAVING_TO_CHECKOUT } from "../constants";
import { formatWon, type CartTotals } from "../derive";

/**
 * 패널 바닥의 요약 바 — `선택한 조합` · `총 주문 금액` · `주문하기`.
 *
 * **선택된 것만 센다**(RT-32). 그룹 머리가 담긴 전부를 세는 것과 다르다 —
 * 선택을 하나 풀면 여기 숫자가 즉시 줄어야 사장이 자기가 얼마를 사는지 안다.
 * 숫자는 전부 `totalsOf` 한 함수에서 온다.
 *
 * 화면 하단 고정이 아니라 **패널 바닥**이다. `CONTEXT-retail.md` §3은 하단
 * 고정이라고 적었지만 확정 와이어프레임(`.sumbar`)과 이미 구현된 상품 상세
 * `SummaryBar`가 둘 다 패널 바닥이다 — 바깥 구조는 코드가 이긴다(§9.6).
 *
 * `주문하기`가 못 눌릴 때는 **진짜 `disabled` 버튼**이다. `asChild + Link`로
 * 두면 `disabled`가 `<a>`에 아무 효력이 없어 0개를 고른 채로도 넘어간다
 * (직전 회차 F11).
 *
 * `주문하기`는 **주문서로 가는 것까지**다. 고른 조합의 `cartItemId`를 주소에
 * 실어 넘기고(`checkoutHref`), 접수는 주문서(`features/order`)가 한다.
 *
 * **보통 클릭은 가로채서 `onOrder`에 넘긴다.** 주문서는 서버 수량을 읽는데, 칸을
 * 고치고 400ms 안에 누르면 주문서 요청이 저장(PATCH)보다 먼저 나가 옛 수량으로
 * 그려진다(#179). 부르는 쪽이 기다리던 저장을 끝낸 뒤 이동한다. `<a>`는 그대로
 * 둔다 — 새 탭 열기·미리보기가 살아야 하고(`Button` 규칙), 수식키 클릭은
 * 브라우저에 맡긴다. 기다리는 동안(`leaving`)은 진짜 `disabled` 버튼이다.
 */
export function CartSummaryBar({
  totals,
  blockedReason,
  href,
  leaving,
  onOrder,
}: {
  totals: CartTotals;
  /** 못 넘어가는 이유. null이면 넘어갈 수 있다 */
  blockedReason: string | null;
  /** 주문서 주소. 고른 조합의 id가 실려 있다 */
  href: string;
  /** `주문하기`를 눌러 저장이 끝나기를 기다리는 중 */
  leaving: boolean;
  /** 보통 클릭. 저장을 끝내고 `href`로 가는 것은 부르는 쪽 몫이다 */
  onOrder: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onOrder();
  };

  return (
    <div className="border-border bg-accent -mx-4 -mb-4 mt-4 rounded-b-panel border-t px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
        <div>
          <p className="text-muted-foreground text-body">선택한 조합</p>
          <p className="text-xl font-medium tabular-nums">
            {totals.comboCount}개 · {totals.sheets}
            {QTY_UNIT}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-body">총 주문 금액</p>
          <p className="text-xl font-medium tabular-nums">
            {formatWon(totals.amount)}
          </p>
        </div>

        <div className="ml-auto phone:ml-0 phone:w-full">
          {blockedReason || leaving ? (
            <Button disabled className="phone:w-full">
              주문하기
            </Button>
          ) : (
            <Button asChild className="phone:w-full">
              <Link href={href} onClick={handleClick}>
                주문하기
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* 못 누르는 이유(또는 기다리는 이유)가 버튼 옆에 글자로 있다. disabled만
          걸면 사장이 버튼을 반복해서 누르다 만다 */}
      <p
        role="status"
        className="text-muted-foreground text-body mt-2.5 min-h-5"
      >
        {blockedReason ?? (leaving ? LEAVING_TO_CHECKOUT : "")}
      </p>
    </div>
  );
}
