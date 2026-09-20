import type { ReactNode } from "react";
import { getCategories } from "@/app/(shop)/masters";
import { CategoryBar } from "@/shared/components/CategoryBar";

/**
 * 이 그룹은 요청마다 서버에서 그린다.
 *
 * 카테고리 줄이 주소의 `?category=`를 읽어 선택 표시를 옮기는데, 화면을 정적으로
 * 굳히면 첫 HTML이 **늘 `전체`**다 — `/?category=1` 링크를 받아 새로 연 사장은
 * 하이드레이션이 끝날 때까지(느린 망에서 1초 가까이) 어느 축으로 좁혀진 화면인지
 * 잘못 읽는다. 주소가 곧 상태인 화면이라 정적 생성과 맞바꾼다.
 *
 * `page.tsx`가 아니라 여기 두는 이유는 카테고리 줄을 그리는 자리가 여기여서다 —
 * 이 그룹에 화면이 늘어도 같은 보장이 따라간다. (SEO는 잃지 않는다. 크롤러도
 * 완성된 HTML을 그대로 받는다.)
 */
export const dynamic = "force-dynamic";

/**
 * 카테고리 바가 붙는 화면만 묶는 그룹 — 홈과 상품 상세 **둘뿐**이다
 * (확정 와이어프레임에서 `cats: on`인 파일이 이 둘이다. 도매처 홈에는 없다 —
 * 저긴 브레드크럼 + 페이지 안쪽 드롭다운 필터가 그 역할을 한다).
 *
 * 두 라우트가 같은 줄을 공유하므로 `page.tsx`가 각자 붙이지 않고 여기가 그린다.
 * 항목은 `GET /categories`의 **최상위 한 단**이다 — 스펙 `CategoryResponse`에
 * `children`이 없다(`04-wire.md` §3).
 */
export default async function BrowseLayout({
  children,
}: {
  children: ReactNode;
}) {
  const categories = await getCategories();

  return (
    <>
      <CategoryBar
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
      {children}
    </>
  );
}
