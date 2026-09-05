/**
 * 목록 feature가 부르는 경로. 여기 없는 경로는 이 feature가 부르지 않는다.
 *
 * 서버 컴포넌트(`app/(shop)/(browse)/…`)와 브라우저(`api/queries.ts`의 찜 목록)
 * 양쪽이 쓰므로 어느 쪽 지시어도 없는 이 파일에 둔다(`features/cart/api/paths.ts`와 같은 이유).
 */
export const LISTING_PATH = {
  list: "/api/retail/listings",
  detail: (listingId: number) => `/api/retail/listings/${listingId}`,
  categories: "/api/retail/categories",
  filterOptions: "/api/retail/filter-options",
} as const;
