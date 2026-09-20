/**
 * 상품 상세가 부르는 경로. 여기 없는 경로는 이 feature가 부르지 않는다.
 *
 * `features/catalog/api/paths.ts`에도 같은 상세 경로가 있다 — feature끼리 직접
 * import 하지 않으므로 중복 정의가 정답이다(`CLAUDE.md`). 담기는 `features/cart`의
 * 뮤테이션이 부르고, 조립은 `app/`이 한다.
 */
export const PRODUCT_PATH = {
  detail: (listingId: number) => `/api/retail/listings/${listingId}`,
} as const;
