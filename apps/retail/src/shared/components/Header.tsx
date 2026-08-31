import { Button } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { CartButton } from "@/shared/components/CartButton";
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
 */
export function Header() {
  return (
    <header className="bg-card border-border sticky top-0 z-30 border-b">
      <div className="flex h-14 items-center gap-5 px-5">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          {/* 원본은 `On`이 파랑이지만 게이트 D1로 색을 쓰지 않는다 — 굵기로만 가른다 */}
          {/* 크기를 따로 주지 않는다 — 와이어프레임 `.brand`도 본문 14px 그대로다 */}
          <span className="text-sm tracking-tighter">
            <span className="font-bold">On</span>
            <span className="font-semibold">도마켓</span>
          </span>
          <span className="text-muted-foreground text-body">
            동대문 도매 직거래
          </span>
        </Link>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" className="px-3">
            <Link href="/orders">주문 내역</Link>
          </Button>

          {/* 찜에는 뱃지가 없다 — 개수를 알려 줄 근거가 원본에 없다 */}
          <Button asChild variant="ghost" className="size-8 px-0">
            <Link href="/wishlist" aria-label="찜 목록">
              <Heart aria-hidden className="size-4.5" />
            </Link>
          </Button>

          <CartButton />
        </div>
      </div>
    </header>
  );
}
