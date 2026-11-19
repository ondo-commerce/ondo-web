import { cn } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 본문 카드 오른쪽에 요약 카드를 붙이는 2단 배치. 장바구니 · 주문서 · 주문 완료 ·
 * 주문 상세가 쓴다.
 *
 * **요약이 스크롤을 따라온다**(`sticky`). 담은 옵션이 길면 바닥의 합계와 버튼이
 * 화면 밖으로 밀려서, 사장이 얼마를 사는지 보려고 끝까지 내려가야 했다.
 * `top-16`은 소매 헤더(`h-14`) 아래 카드 사이 간격(`gap-2`)만큼 띄운 값이다.
 *
 * `tablet` 폭 아래에서는 한 줄로 쌓고 따라오지 않는다 — 좁은 화면에서 따라오는
 * 카드는 본문을 가린다. 규칙은 디자인 규칙 4절 "오른쪽 요약 카드".
 */
export function SummaryLayout({
  children,
  aside,
  asideFirstWhenNarrow = false,
}: {
  /** 본문 카드들. 위에서부터 `gap-2`로 쌓인다 */
  children: ReactNode;
  /**
   * 요약 카드 한 장. 없으면(빈 장바구니) 본문이 전폭을 쓴다. 본문 노드는 그대로
   * 남아서 안쪽 상태(되돌리기 알림의 `role="status"`)가 끊기지 않는다
   */
  aside?: ReactNode;
  /**
   * 좁은 화면에서 요약을 본문 **위**에 둔다. 주문 상세처럼 요약 카드가 그 화면의
   * 제목(주문번호)을 들고 있을 때 켠다 — 아래로 내려가면 무엇을 보는 화면인지가
   * 카드 세 장 뒤에 나온다. 장바구니와 주문서는 목록을 본 뒤 합계라 끈 채로 둔다
   */
  asideFirstWhenNarrow?: boolean;
}) {
  /* 요약을 위에 둘 때는 **문서 순서도** 요약이 먼저다. 보이는 순서만 CSS로 바꾸면
     Tab과 낭독기는 본문 카드를 다 지난 뒤에야 주문번호와 취소 버튼에 닿는다.
     넓은 화면에서는 칸을 지정해 요약을 오른쪽 첫 줄로 보낸다 */
  const placed = aside !== undefined && aside !== null && asideFirstWhenNarrow;
  const main = (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2",
        placed &&
          "col-start-1 row-start-1 tablet:col-start-auto tablet:row-start-auto",
      )}
    >
      {children}
    </div>
  );
  const side = aside ? (
    <aside
      className={cn(
        "sticky top-16 tablet:static",
        placed &&
          "col-start-2 row-start-1 tablet:col-start-auto tablet:row-start-auto",
      )}
    >
      {aside}
    </aside>
  ) : null;

  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-wrap items-start gap-2",
        aside ? "grid-cols-[minmax(0,1fr)_22rem] tablet:grid-cols-1" : "",
      )}
    >
      {placed ? side : main}
      {placed ? main : side}
    </div>
  );
}
