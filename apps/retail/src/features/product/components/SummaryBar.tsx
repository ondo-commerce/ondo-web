"use client";

import { Button, cn } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { QTY_UNIT } from "../constants";
import { formatWon, type OrderTotals } from "../derive";

/**
 * 패널 바닥의 합계 바 — `선택한 수량` · `합계` · 액션 3개.
 *
 * 숫자는 전부 `orderTotals` 한 함수에서 온다. 장수와 금액을 각자 세면 한쪽만
 * 안 따라오는 화면이 된다.
 *
 * **비활성 버튼 옆에 이유를 글자로 둔다.** `disabled`만 걸면 왜 못 누르는지
 * 화면에 아무 말도 없어서, 사장이 버튼을 반복해서 누르다 만다.
 *
 * `바로 주문하기`는 **주문서로 가는 링크다.** onClick도 href도 없이 눌리기만
 * 하던 자리라 사장이 누르고 또 눌러도 주소·화면·문구 어느 것도 안 바뀌었다.
 * 확정 와이어프레임도 `06_checkout.html`로 간다. 담은 수량을 주문서가 아직
 * 받지 못하는 것은 장바구니 회차 몫이고, 그 전이라도 **눌린 결과는 보여야 한다.**
 */
export function SummaryBar({
  totals,
  disabledReason,
  favorited,
  onToggleFavorite,
  onAddToCart,
  addedNotice,
  alreadyAdded,
}: {
  totals: OrderTotals;
  /** 못 담는 이유. null이면 담을 수 있다 */
  disabledReason: string | null;
  favorited: boolean;
  onToggleFavorite: () => void;
  onAddToCart: () => void;
  /** 담은 결과. 무엇이 몇 장 들어갔는지 */
  addedNotice: string | null;
  /** 담은 뒤 수량이 그대로다. 또 누를 이유가 없다는 것을 버튼이 스스로 말한다 */
  alreadyAdded: boolean;
}) {
  const blocked = disabledReason !== null;

  return (
    <div className="border-border bg-accent -mx-4 -mb-4 mt-4 rounded-b-panel border-t px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
        <div>
          <p className="text-muted-foreground text-body">선택한 수량</p>
          <p className="text-xl font-medium tabular-nums">
            총 {totals.sheets}
            {QTY_UNIT}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-body">합계</p>
          <p className="text-xl font-medium tabular-nums">
            {formatWon(totals.amount)}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 phone:ml-0 phone:w-full">
          <Button
            variant="line"
            aria-pressed={favorited}
            onClick={onToggleFavorite}
            className={cn(favorited && "text-foreground")}
          >
            <Heart
              aria-hidden
              className="size-4"
              fill={favorited ? "currentColor" : "none"}
            />
            {favorited ? "찜 해제" : "찜"}
          </Button>
          <Button
            variant="line"
            disabled={blocked || alreadyAdded}
            onClick={onAddToCart}
          >
            {alreadyAdded ? "장바구니에 담김" : "장바구니 담기"}
          </Button>
          {/* 못 누를 때는 진짜 disabled 버튼이다 — asChild + Link 로 두면
              `disabled`가 <a>에 아무 효력이 없어 잠긴 상품에서도 이동한다 */}
          {blocked ? (
            <Button disabled>바로 주문하기</Button>
          ) : (
            <Button asChild>
              <Link href="/checkout">바로 주문하기</Link>
            </Button>
          )}
        </div>
      </div>

      {/* 결과와 이유가 같은 자리에서 바뀐다 — 눈이 한 곳만 보면 된다.
          role=status라 스크린리더도 누른 뒤에 무슨 일이 있었는지 듣는다 */}
      <p
        role="status"
        className={cn(
          "text-body mt-2.5",
          blocked ? "text-muted-foreground" : "text-secondary-foreground",
        )}
      >
        {disabledReason ?? addedNotice ?? ""}
      </p>
    </div>
  );
}
