"use client";

import { Button, cn } from "@ondo/ui";
import { Heart, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlobalSearch } from "@/shared/components/GlobalSearch";

/**
 * 소매 상단 헤더 — 로고 · 통합 검색 · 주문 내역 · 찜 · 채팅 · 장바구니 · 계정.
 *
 * 도매 `Topbar`를 복사하지 않았다. 도매 헤더의 내용물은 주 메뉴 7탭이고
 * 소매는 검색 + 아이콘 + 계정 드롭다운이다. 도매 쪽은 화면 전체 스크롤이 없어
 * sticky가 필요 없지만, 문서형으로 흐르는 소매는 sticky여야 늘 같은 자리에 남는다.
 *
 * 규격은 확정 와이어프레임 `15_retail-hallmark/_base.css` 실측값이다 —
 * 높이 56 · 좌우 20 · 간격 20 · 아이콘 버튼 32 · 검색 340×36(SearchInput 기본값) ·
 * 로고 14(본문 크기 그대로).
 * 알림 아이콘은 채팅(loop-06 06a)과 알림 종(06b) 둘이다. 종은 채팅 오른쪽, 장바구니 왼쪽(디자인 결정 47).
 *
 * **채팅 배지, 알림 종, 장바구니 뱃지, 계정 칩은 이 파일이 만들지 않는다.** 안 읽은 수를 아는 것은
 * `features/chat`과 `features/notification`, 담긴 수를 아는 것은 `features/cart`, 로그인한 상호명을 아는 것은
 * `features/account`인데, 셸은 `shared/`라 그쪽을 읽을 수 없다(import 한 방향). 자리만
 * 비워 두고 부모 `app/(shop)/layout.tsx`가 실물을 끼워 넣는다.
 *
 * 폰 폭(≤40rem) 배치(06b 디자인 결정 48, 49, 기획 Q3): 아이콘이 하나 늘어 검색칸이 좁아진 만큼 찜을 숨기고
 * (계정 메뉴에 `찜 목록`이 원래 있다, D39) 줄 여백 20 → 16, 칸 사이 → 8로 줄인다. 360 미만(`narrow`)은 그래도
 * 검색칸이 25px 남짓이라 돋보기 버튼으로 접고, 누르면 그 줄 전체가 검색 입력 + `닫기`가 된다. 그래서 클라이언트
 * 컴포넌트다(펼침 상태 하나). 펼친 동안은 같은 줄을 쓰므로 종과 패널이 안 보인다(결정 58).
 */
export function Header({
  chat,
  notifications,
  cart,
  account,
}: {
  chat: ReactNode;
  notifications: ReactNode;
  cart: ReactNode;
  account: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  /* 닫을 때만 돋보기로 포커스를 돌린다 — 첫 렌더에 포커스를 뺏으면 안 된다 */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !searchOpen) searchButton.current?.focus();
    wasOpen.current = searchOpen;
  }, [searchOpen]);
  const closeSearch = () => setSearchOpen(false);

  return (
    /* 아래 선을 카테고리 줄에 넘긴다 — 그 줄이 따라오는 화면(홈·상품 상세)에서는
       기능줄이 자기 선을 그으면 흰 블록이 둘로 갈린다. 와이어프레임 `.topbar`는
       두 줄을 한 상자에 담고 선을 맨 아래 하나만 긋는다. `(browse)` 레이아웃은
       이 레이아웃의 자식이라 prop을 올려 보낼 수 없어 선택자로 알아본다 */
    <header className="bg-card border-border sticky top-0 z-30 border-b has-[~main_[data-category-bar]]:border-b-0">
      {/* 간격 20→12는 확정 와이어프레임 `_base.css:330`(`.topbar__row{gap:12px}`) 그대로다.
          1512px에서는 이 규칙이 걸리지 않으므로 회차 이전 렌더와 같다.
          ≤40rem 좌우 16, 칸 사이 8(06b 결정 48): 디자인 셈으로는 찜만 숨기면 390 검색칸이 77px라 여백에서 더 받는다.
          앱 실측 390 107px, 360 77px(하한 90/60은 S2-8 e2e). 16은 열린 알림 패널의 좌우 여백과 같은 선이다.
          검색을 펼친 동안 이 줄은 360 미만에서만 숨는다 — 폭이 넓어지면 펼침 상태여도 원래 줄이 보인다 */}
      <div
        className={cn(
          "flex h-14 items-center gap-5 px-5 tablet:gap-3 phone:gap-2 phone:px-4",
          searchOpen && "narrow:hidden",
        )}
      >
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

        <GlobalSearch className="narrow:hidden" />

        {/* 360 미만은 아이콘 사이 4 → 0(결정 49). 44 버튼 넷 + 계정 칩이 288px에 들어간다 */}
        <div className="ml-auto flex shrink-0 items-center gap-1 narrow:gap-0">
          {/* 텍스트 링크는 ≤40rem에서 사라진다 — `_base.css:338` `.tlink`.
              같은 자리는 계정 드롭다운의 `주문 내역` 항목이 대신 받는다 */}
          <Button asChild variant="ghost" className="px-3 phone:hidden">
            <Link href="/orders">주문 내역</Link>
          </Button>

          {/* 360 미만에서 검색칸 대신. 주문 내역 자리(채팅 앞)에 선다(결정 49) */}
          {/* ref는 안쪽 button에 — packages/ui `Button` 타입이 ref를 받지 않는다(읽기 전용이라 asChild로 넘긴다) */}
          <Button
            asChild
            variant="ghost"
            className="hidden size-11 px-0 narrow:inline-flex"
          >
            <button
              ref={searchButton}
              type="button"
              aria-label="통합 검색 열기"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              data-ac="S2-8"
            >
              <Search aria-hidden className="size-4.5" />
            </button>
          </Button>

          {/* 찜에는 뱃지가 없다 — 개수를 알려 줄 근거가 원본에 없다. ≤40rem에서 숨긴다(06b 결정 48, D39) —
              배지가 없어 놓치는 숫자가 없고, 계정 메뉴 `찜 목록`이 같은 곳으로 간다 */}
          <Button
            asChild
            variant="ghost"
            className="size-8 px-0 phone:hidden"
            data-ac="S2-8"
          >
            <Link href="/wishlist" aria-label="찜 목록">
              <Heart aria-hidden className="size-4.5" />
            </Link>
          </Button>

          {/* 채팅은 장바구니 왼쪽(디자인 결정 30), 종은 그 둘 사이(결정 47) */}
          {chat}
          {notifications}
          {cart}
          {account}
        </div>
      </div>

      {/* 360 미만에서 펼친 검색 줄. Enter → `/search?q=`, `닫기`나 Esc → 원래 줄 + 돋보기로 포커스.
          버린 대안: 검색을 둘째 줄로 내리기(모든 화면 세로 52px 손해, sticky라 계속 가린다, 결정 49) */}
      {searchOpen ? (
        <div className="hidden h-14 items-center gap-2 px-4 narrow:flex">
          <GlobalSearch className="flex-1" autoFocus onClose={closeSearch} />
          <Button
            type="button"
            variant="ghost"
            className="h-11 shrink-0 px-2"
            onClick={closeSearch}
          >
            닫기
          </Button>
        </div>
      ) : null}
    </header>
  );
}
