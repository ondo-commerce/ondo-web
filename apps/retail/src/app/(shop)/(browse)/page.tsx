import {
  CATALOG_PRODUCTS,
  HomeView,
  LIST_SORTS,
  resolveFilter,
  resolveSort,
} from "@/features/catalog";
import { CATEGORIES, DEFAULT_CATEGORY_SLUG } from "@/shared/config/nav";

/* 셸 카테고리 바의 `all`(= 전체)은 좁히는 값이 아니다. 허용 목록에서 빼 두면
   `?category=all`로 들어와도 필터의 `전체`로 떨어진다 — 안 빼면 `all`이라는
   카테고리를 가진 상품을 찾다가 0건이 된다 */
const NARROWING_SLUGS = CATEGORIES.filter(
  (c) => c.slug !== DEFAULT_CATEGORY_SLUG,
).map((c) => c.slug);

/**
 * 쇼핑몰 홈. **좁혀 둔 조건은 주소가 원본이라 서버에서 읽어 내려준다** —
 * 화면이 자기 안에 기억하면 상품 상세를 갔다 왔을 때 초기화된다.
 *
 * `(browse)` 레이아웃이 `force-dynamic`이라 첫 HTML부터 좁혀진 목록이 온다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <HomeView
      products={CATALOG_PRODUCTS}
      filter={resolveFilter(params, NARROWING_SLUGS)}
      sort={resolveSort(params, LIST_SORTS)}
    />
  );
}
