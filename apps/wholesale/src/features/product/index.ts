/**
 * product feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { ProductCreateView } from "./components/ProductCreateView";
export { ProductEditView } from "./components/ProductEditView";
export { ProductListView } from "./components/ProductListView";
export type {
  ProductView,
  SkuView,
  PostView,
  SkuSize,
  PostStatus,
} from "./types";

/*
 * ⚠️ 아래는 연동 전 화면용이다. 재고·주문 탭이 아직 fixtures로 돌아서 남겨 둔다 —
 * 그 feature가 연동되는 회차에 지운다. 상품 탭 자신은 쓰지 않는다.
 */
export { PRODUCTS, findProduct } from "./fixtures";
export type { Product, Post, Sku, SizeName } from "./types";
