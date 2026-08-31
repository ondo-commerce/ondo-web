"use client";

import { cn } from "@ondo/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  CATEGORIES,
  DEFAULT_CATEGORY_SLUG,
  resolveCategorySlug,
} from "@/shared/config/nav";

/** 규격은 도매 GNB 탭과 같다 — h32 · radius 8 · px12. 선택은 밑줄이 아니라 회색 알약이다 */
function CategoryLinks({ current }: { current: string }) {
  return (
    <nav aria-label="카테고리" className="flex items-center gap-0.5 px-3 pb-2">
      {CATEGORIES.map(({ slug, label }) => {
        const active = slug === current;

        return (
          <Link
            key={slug}
            /* 상품 상세에서 눌러도 목록으로 돌아가야 한다 — 목적지는 늘 홈이다 */
            href={slug === DEFAULT_CATEGORY_SLUG ? "/" : `/?category=${slug}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-control px-3 whitespace-nowrap transition-colors",
              active
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function CategoryLinksFromQuery() {
  /* 주소가 선택 상태의 원본이다. 컴포넌트가 따로 기억하면 뒤로 가기에서 어긋난다.
     목록에 없는 값은 `전체`로 떨어뜨린다 — resolveCategorySlug 참조 */
  const current = resolveCategorySlug(useSearchParams().get("category"));

  return <CategoryLinks current={current} />;
}

/**
 * 헤더 아래 카테고리 줄. 붙는 화면은 홈과 상품 상세 **둘뿐**이고, 그래서 두 화면을
 * 묶는 `(browse)` 레이아웃이 그린다 — `page.tsx`마다 붙이면 둘이 갈라진다.
 *
 * **기능줄과 한 흰 블록이어야 한다.** 확정 와이어프레임 `.topbar`는 56px 줄과
 * `.cats`를 한 상자에 담고 선을 맨 아래 하나만 긋는다. 코드에서는 헤더가 `(shop)`
 * 레이아웃, 이 줄이 그 안쪽 `(browse)` 레이아웃이라 DOM 형제가 아니어서 각자 선을
 * 갖고 있었다(흰 블록이 둘로 갈려 보였다). 그래서 둘로 나눠 맡는다 —
 * 헤더는 이 줄이 따라올 때 자기 아래 선을 지우고(`Header.tsx`의 `:has`),
 * 이 줄이 아래 선과 sticky를 이어받아 기능줄에 붙어 남는다.
 *
 * `data-category-bar`는 헤더가 자기 뒤에 이 줄이 있는지 알아보는 표식이다.
 * 음수 여백은 `<main>`의 8px 안쪽 여백을 되돌려 헤더처럼 화면 끝까지 붙이기 위한 것.
 * sticky 기준 `top-14`는 선을 뺀 기능줄 높이(56px) 그대로다.
 */
export function CategoryBar() {
  return (
    <div
      data-category-bar
      className="bg-card border-border sticky top-14 z-30 -mx-2 -mt-2 mb-2 border-b"
    >
      {/* useSearchParams는 정적 프리렌더를 막는다 — 경계를 컴포넌트가 스스로 갖는다.
          홈은 `?category=`가 곧 상태라 화면 쪽을 force-dynamic으로 돌렸고,
          그래서 이 fallback은 실제 화면에는 나오지 않는다 */}
      <Suspense fallback={<CategoryLinks current={DEFAULT_CATEGORY_SLUG} />}>
        <CategoryLinksFromQuery />
      </Suspense>
    </div>
  );
}
