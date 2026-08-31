/**
 * search feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { SearchGuide, SearchResultView } from "./components/SearchResultView";
export { SEARCH_ORDERS, SEARCH_PRODUCTS, SEARCH_WHOLESALERS } from "./fixtures";
export { isBlankQuery, normalizeQuery, resolveTab, runSearch } from "./derive";
export type { SearchTab } from "./types";
