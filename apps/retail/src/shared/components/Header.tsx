import { Button } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { GlobalSearch } from "@/shared/components/GlobalSearch";

/**
 * 소매 상단 헤더 — 로고 · 통합 검색 · 주문 내역 · 찜 · 장바구니 · 계정.
 *
 * 도매 `Topbar`를 복사하지 않았다. 도매 헤더의 내용물은 주 메뉴 7탭이고
 * 소매는 검색 + 아이콘 + 계정 드롭다운이다. 도매 쪽은 화면 전체 스크롤이 없어
 * sticky가 필요 없지만, 문서형으로 흐르는 소매는 sticky여야 늘 같은 자리에 남는다.
 *
 * 규격은 확정 와이어프레임 `15_retail-hallmark/_base.css` 실측값이다 —
 * 높이 56 · 좌우 20 · 간격 20 · 아이콘 버튼 32 · 검색 340×36(SearchInput 기본값) ·
 * 로고 14(본문 크기 그대로).
 * 알림 아이콘은 없다. 소매에는 알림 채널 자체가 없어서 자리도 비워 두지 않는다.
 *
 * **장바구니 뱃지와 계정 칩은 이 파일이 만들지 않는다.** 담긴 수를 아는 것은
 * `features/cart`이고 로그인한 상호명을 아는 것은 `features/account`인데,
 * 셸은 `shared/`라 그쪽을 읽을 수 없다(import 한 방향). 자리만 비워 두고
 * 부모 `app/(shop)/layout.tsx`가 실물을 끼워 넣는다.
 */
export function Header({
  cart,
  account,
}: {
  cart: ReactNode;
  account: ReactNode;
}) {
  return (
    /* 아래 선을 카테고리 줄에 넘긴다 — 그 줄이 따라오는 화면(홈·상품 상세)에서는
       기능줄이 자기 선을 그으면 흰 블록이 둘로 갈린다. 와이어프레임 `.topbar`는
       두 줄을 한 상자에 담고 선을 맨 아래 하나만 긋는다. `(browse)` 레이아웃은
       이 레이아웃의 자식이라 prop을 올려 보낼 수 없어 선택자로 알아본다 */
    <header className="bg-card border-border sticky top-0 z-30 border-b has-[~main_[data-category-bar]]:border-b-0">
      {/* 간격 20→12는 확정 와이어프레임 `_base.css:330`(`.topbar__row{gap:12px}`) 그대로다.
          1512px에서는 이 규칙이 걸리지 않으므로 회차 이전 렌더와 같다 */}
      <div className="flex h-14 items-center gap-5 px-5 tablet:gap-3">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          {/* 원본은 `On`이 파랑이지만 게이트 D1로 색을 쓰지 않는다 — 굵기로만 가른다 */}
          {/* 크기를 따로 주지 않는다 — 와이어프레임 `.brand`도 본문 14px 그대로다 */}
          <span className="text-sm tracking-tighter">
            <span className="font-bold">On</span>
            <span className="font-semibold">도마켓</span>
          </span>
          {/* 꼬리표는 좁은 화면에서 사라진다 — `_base.css:331` `.brand .tag` */}
          <span className="text-muted-foreground text-body tablet:hidden">
            동대문 도매 직거래
          </span>
        </Link>

        <GlobalSearch />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 텍스트 링크는 ≤40rem에서 사라진다 — `_base.css:338` `.tlink`.
              같은 자리는 계정 드롭다운의 `주문 내역` 항목이 대신 받는다 */}
          <Button asChild variant="ghost" className="px-3 phone:hidden">
            <Link href="/orders">주문 내역</Link>
          </Button>

          {/* 찜에는 뱃지가 없다 — 개수를 알려 줄 근거가 원본에 없다.
              ≤40rem에서 44×44 — 손가락 최소 타깃(`_base.css:340`) */}
          <Button asChild variant="ghost" className="size-8 px-0 phone:size-11">
            <Link href="/wishlist" aria-label="찜 목록">
              <Heart aria-hidden className="size-4.5" />
            </Link>
          </Button>

          {cart}
          {account}
        </div>
      </div>
    </header>
  );
}
