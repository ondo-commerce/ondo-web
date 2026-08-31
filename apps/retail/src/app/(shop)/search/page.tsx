import type { Metadata } from "next";
import {
  SEARCH_ORDERS,
  SEARCH_PRODUCTS,
  SEARCH_WHOLESALERS,
  SearchGuide,
  SearchResultView,
  isBlankQuery,
  normalizeQuery,
  resolveTab,
  runSearch,
} from "@/features/search";

export const metadata: Metadata = { title: "검색 결과" };

/**
 * 요청마다 서버에서 그린다. 헤더의 통합 검색이 `?q=`를 읽어 자기 값으로 되돌리는데,
 * 이 화면을 정적으로 굳히면 첫 HTML의 검색창이 **늘 빈 칸**이다 — 주소로 직접 들어온
 * 사장은 하이드레이션이 끝날 때까지(느린 망에서 1초 가까이) 자기가 뭘 검색했는지
 * 화면에서 읽을 수 없다. 주소가 곧 상태인 화면이라 정적 생성과 맞바꾼다.
 * (SEO는 잃지 않는다. 크롤러도 완성된 HTML을 그대로 받는다.)
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;

  /* 셸 검색창이 required·pattern으로 빈 제출을 막지만 주소로 직접 들어오는 길이
     열려 있다. 결과 0건 화면을 주면 검색한 적 없는 사장이 "없다"고 읽는다 */
  if (isBlankQuery(raw)) return <SearchGuide />;

  const query = (raw ?? "").trim();
  const result = runSearch(normalizeQuery(raw), {
    products: SEARCH_PRODUCTS,
    wholesalers: SEARCH_WHOLESALERS,
    orders: SEARCH_ORDERS,
  });

  return (
    <SearchResultView
      /* 화면에는 **친 그대로**를 되돌려 준다. 소문자로 바꾼 값은 비교용이라
         `“st-002” 검색 결과`처럼 사장이 안 친 문자열이 제목에 뜨면 안 된다 */
      query={query}
      tab={resolveTab(Array.isArray(params.tab) ? params.tab[0] : params.tab)}
      result={result}
    />
  );
}
