/**
 * 통합 검색이 부르는 경로. `features/catalog`의 목록 경로와 같은 값이다 —
 * feature끼리 직접 import 하지 않으므로 중복 정의가 정답이다(`CLAUDE.md`).
 */
export const SEARCH_PATH = {
  listings: "/api/retail/listings",
} as const;
