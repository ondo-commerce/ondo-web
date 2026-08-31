import type { SearchTab } from "./types";

/** 탭의 순서·라벨. 화면이 `Object.keys`로 역산하지 않도록 배열을 손으로 적는다 */
export const SEARCH_TABS: readonly SearchTab[] = [
  "all",
  "products",
  "wholesalers",
  "orders",
];

export const SEARCH_TAB_LABEL: Record<SearchTab, string> = {
  all: "전체",
  products: "상품",
  wholesalers: "도매처",
  orders: "내 주문",
};

/** 아무것도 안 고른 탭. 주소에 `?tab=`이 없으면 이것이다 */
export const DEFAULT_SEARCH_TAB: SearchTab = "all";

/**
 * 화면 제목 아래 안내 한 줄. **이 화면이 무엇으로 찾는지를 미리 말한다** —
 * 품번을 외워 온 사장이 왜 이 상품이 맨 위인지 알 수 있어야 한다.
 */
export const SEARCH_LEAD =
  "품번 · 상품명 · 도매처 이름으로 찾을 수 있어요. 품번이 정확히 일치하는 상품을 먼저 보여줘요. 대소문자는 구분하지 않아요.";

/** 0건 섹션에 그리는 문구. **섹션을 감추지 않는다** — 찾아봤다는 사실이 남아야 한다 */
export const EMPTY_SECTION_TEXT: Record<
  Exclude<SearchTab, "all">,
  (query: string) => string
> = {
  products: (q) => `“${q}” 와 맞는 상품이 없어요.`,
  wholesalers: (q) => `“${q}” 와 이름이 맞는 도매처가 없어요.`,
  orders: (q) => `“${q}” 로 주문한 내역이 없어요.`,
};
