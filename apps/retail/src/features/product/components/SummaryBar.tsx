"use client";

import { Button, cn } from "@ondo/ui";
import { Heart } from "lucide-react";
import { QTY_UNIT } from "../constants";
import { formatWon, type OrderTotals } from "../derive";

/**
 * 패널 바닥의 합계 바 — `선택한 수량` · `합계` · 액션 3개. 스크롤해도 화면 바닥에 남는다.
 *
 * 숫자는 전부 `orderTotals` 한 함수에서 온다. 장수와 금액을 각자 세면 한쪽만
 * 안 따라오는 화면이 된다.
 *
 * **비활성 버튼 옆에 이유를 글자로 둔다.** `disabled`만 걸면 왜 못 누르는지
 * 화면에 아무 말도 없어서, 사장이 버튼을 반복해서 누르다 만다.
 *
 * `바로 주문하기`는 **고른 수량을 담고 그 줄만 들고 주문서로 간다**(부르는 쪽
 * `orderNow`). 링크가 아니라 버튼이다 — 담기(POST)가 끝나야 갈 주소가 생긴다.
 * 예전에는 `/checkout`으로 가는 링크라 고른 수량이 안 넘어가 빈 주문서가 떴다.
 * 담는 중과 넘어가는 중(`leaving`)에는 두 버튼(장바구니 담기, 바로 주문하기)이
 * 잠긴다 — 또 눌리면 같은 옵션이 한 번 더 담긴다. 찜은 담기와 상관없어 그대로 둔다.
 */
export function SummaryBar({
  totals,
  disabledReason,
  favorited,
  onToggleFavorite,
  onAddToCart,
  onOrderNow,
  leaving,
  adding,
  addedNotice,
  failed,
  alreadyAdded,
}: {
  totals: OrderTotals;
  /** 못 담는 이유. null이면 담을 수 있다 */
  disabledReason: string | null;
  favorited: boolean;
  onToggleFavorite: () => void;
  onAddToCart: () => void;
  /** `바로 주문하기`. 담고 주문서로 가는 것은 부르는 쪽 몫이다 */
  onOrderNow: () => void;
  /** 담기가 끝나 주문서로 넘어가는 중 */
  leaving: boolean;
  /** 요청이 나가 있는 동안. 두 번 눌리면 같은 조합이 두 번 더해진다(스펙) */
  adding: boolean;
  /** 담은 결과 또는 실패 이유. 무엇이 몇 장 들어갔는지 */
  addedNotice: string | null;
  /** `addedNotice`가 실패 문구인가 — 색만 다르고 자리는 같다 */
  failed: boolean;
  /** 담은 뒤 수량이 그대로다. 또 누를 이유가 없다는 것을 버튼이 스스로 말한다 */
  alreadyAdded: boolean;
}) {
  const blocked = disabledReason !== null;

  return (
    /* 화면 바닥에 붙는다(sticky). 색상이 많은 상품은 옵션 줄이 길어서 합계와
       `장바구니 담기`가 화면 밖으로 밀렸다. 디자인 규칙 4절 "바닥 합계 띠" */
    <div
      /* 이 표식이 있는 화면은 `globals.css`가 스크롤 아래 여백을 준다 — Tab으로 내려간
         수량 칸이 이 줄 뒤에 가린 채 포커스를 받지 않게 */
      data-sticky-summary
      className="border-border bg-card sticky bottom-0 z-10 mt-6 border-t py-4"
    >
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 phone:justify-start">
        <div>
          <p className="text-muted-foreground text-body">선택한 수량</p>
          <p className="mt-1 text-base font-medium tabular-nums">
            총 {totals.sheets}
            {QTY_UNIT}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-body">합계</p>
          <p className="mt-1 text-base font-medium tabular-nums">
            {formatWon(totals.amount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 phone:w-full">
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
            disabled={blocked || alreadyAdded || adding || leaving}
            onClick={onAddToCart}
          >
            {adding
              ? "담는 중…"
              : alreadyAdded
                ? "장바구니에 담김"
                : "장바구니 담기"}
          </Button>
          <Button disabled={blocked || adding || leaving} onClick={onOrderNow}>
            바로 주문하기
          </Button>
        </div>
      </div>

      {/* 결과와 이유가 같은 자리에서 바뀐다 — 눈이 한 곳만 보면 된다.
          role=status라 스크린리더도 누른 뒤에 무슨 일이 있었는지 듣는다.
          비어도 한 줄(`text-body` 줄높이 20px)을 남긴다. 바닥에 붙은 줄이라 이 줄이
          사라지면 위의 버튼이 내려가서, 수량을 넣고 바로 누르면 빗나갔다(#451) */}
      <p
        role="status"
        className={cn(
          "text-body mt-2 min-h-5 text-right",
          /* 못 누르는 이유는 안내라 회색이다. 화면을 열자마자 보이는 글이 빨가면
             오류가 난 것처럼 읽힌다. 빨강은 담기가 실패했을 때뿐이다 */
          failed ? "text-destructive-strong" : "text-muted-foreground",
        )}
      >
        {disabledReason ?? addedNotice ?? ""}
      </p>
    </div>
  );
}
