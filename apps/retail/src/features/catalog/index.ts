/**
 * catalog feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { HomeView } from "./components/HomeView";
export { CATALOG_PRODUCTS } from "./fixtures";
export { LIST_SORTS } from "./constants";
/* 찜은 세 화면(홈·도매처 홈·찜 목록)과 두 feature(상품 상세·검색)가 같은 값을
   봐야 해서 catalog가 저장소를 갖고 밖으로 훅만 연다 */
export { useProductFavorite } from "./useFavorites";
export { resolveFilter, resolveSort } from "./derive";
export type { CatalogFilter, CatalogProduct, CatalogSort } from "./types";
