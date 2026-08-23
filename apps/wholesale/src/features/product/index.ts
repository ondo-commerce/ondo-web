/**
 * product feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { ProductCreateView } from "./components/ProductCreateView";
export { ProductEditView } from "./components/ProductEditView";
export { ProductListView } from "./components/ProductListView";
export { PRODUCTS, findProduct } from "./fixtures";
export type { Product, Post, Sku, SizeName, PostStatus } from "./types";
