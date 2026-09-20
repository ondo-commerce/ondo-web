import type { SearchTab } from "./types";

/**
 * 탭의 순서·라벨. 화면이 `Object.keys`로 역산하지 않도록 배열을 손으로 적는다.
 *
 * `내 주문` 탭이 없다 — 스펙의 `GET /orders`에 검색어 파라미터가 없다(`from`·`to`·
 * `page`·`size`뿐). 검색한 척하고 "주문한 내역이 없어요"를 보여 주는 것보다 탭을
 * 안 두는 편이 정직하다. path가 생기면 되살린다(`04-wire.md` §3).
 */
export const SEARCH_TABS: readonly SearchTab[] = [
  "all",
  "products",
  "wholesalers",
];

export const SEARCH_TAB_LABEL: Record<SearchTab, string> = {
  all: "전체",
  products: "상품",
  wholesalers: "도매처",
};

/** 아무것도 안 고른 탭. 주소에 `?tab=`이 없으면 이것이다 */
export const DEFAULT_SEARCH_TAB: SearchTab = "all";

/**
 * 화면 제목 아래 안내 한 줄. **이 화면이 무엇으로 찾는지를 미리 말한다.**
 *
 * fixtures 시절의 "품번이 정확히 일치하는 상품을 먼저 보여줘요"는 지웠다 —
 * 서버 `q`가 무엇을 어떻게 맞추는지(품번 포함 여부·대소문자·정렬)가 스펙에
 * 없다. 모르는 약속을 화면에 적지 않는다.
 */
export const SEARCH_LEAD =
  "검색어와 맞는 상품을 보여줘요. 도매처는 결과에 나온 상품의 도매처 중 이름이 맞는 곳이에요.";

/** 0건 섹션에 그리는 문구. **섹션을 감추지 않는다** — 찾아봤다는 사실이 남아야 한다 */
export const EMPTY_SECTION_TEXT: Record<
  Exclude<SearchTab, "all">,
  (query: string) => string
> = {
  products: (q) => `“${q}” 와 맞는 상품이 없어요.`,
  wholesalers: (q) => `“${q}” 와 이름이 맞는 도매처가 없어요.`,
};

/**
 * 한 번에 받는 상품 결과 수. **서버 상한(100)과 같다** — `size=101`은 400이다
 * (dev 실측). 검색 결과에는 페이저가 없어서 이보다 많으면 `전체 N건`으로만 말한다.
 */
export const SEARCH_PAGE_SIZE = 100;
