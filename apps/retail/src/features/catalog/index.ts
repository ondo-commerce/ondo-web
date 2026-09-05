/**
 * catalog feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { HomeView } from "./components/HomeView";
export { WholesalerHomeView } from "./components/WholesalerHomeView";
export { WishlistView } from "./components/WishlistView";

/**
 * 서버 컴포넌트(`app/(shop)/(browse)/…` · `wholesalers/[id]`)가 `serverApi()`로
 * 받을 때 쓰는 경로와 변환. feature 안에 `server-only` 모듈을 두지 않는 이유는
 * `features/cart`와 같다 — 이 barrel을 클라이언트 컴포넌트(주문 상세)도 import
 * 해서, 서버 전용 모듈이 섞이면 번들이 깨진다. fetch 자체는 `app/`이 한다.
 */
export { LISTING_PATH } from "./api/paths";
export { MAX_PAGE_SIZE, WISHLIST_SORTS } from "./constants";
export {
  productsOfWholesaler,
  resolveFilter,
  resolveSeller,
  resolveShown,
  resolveSort,
  toCatalogOptions,
  toCatalogPaging,
  toCatalogProduct,
  toListingParams,
  wholesalerOf,
} from "./derive";
export type {
  CatalogFilter,
  CatalogOptions,
  CatalogProduct,
  CatalogSort,
  CategoryOption,
  CategoryWire,
  FilterOptionsWire,
  ListingSummaryWire,
} from "./types";

/* 찜은 세 화면(홈·도매처 홈·찜 목록)과 세 feature(상품 상세·검색·주문 상세)가
   같은 값을 봐야 해서 catalog가 저장소를 갖고 밖으로 훅만 연다.
   `useFavorites`가 같이 나가는 것은 주문 상세 때문이다 — 표 한 줄마다 훅을
   부를 수 없어서 집합 하나와 토글 함수를 통째로 받는다 */
export { useFavorites, useProductFavorite } from "./useFavorites";
