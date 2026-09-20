/**
 * search feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * fetch는 `app/(shop)/search/page.tsx`가 `serverApi()`로 한다 — 여기는 경로·
 * 파라미터·변환만 준다(`features/cart/index.ts`와 같은 이유).
 */
export { SearchGuide, SearchResultView } from "./components/SearchResultView";
export { SEARCH_PATH } from "./api/paths";
export {
  isBlankQuery,
  normalizeQuery,
  resolveTab,
  toSearchParams,
  toSearchResult,
} from "./derive";
export type { ListingSummaryWire, SearchTab } from "./types";
