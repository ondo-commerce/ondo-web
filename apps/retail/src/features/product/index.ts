/**
 * product feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 서버 컴포넌트(`app/(shop)/(browse)/products/[productId]/page.tsx`)가
 * `serverApi()`로 받을 때 쓰는 경로와 변환을 같이 연다. fetch 자체는 `app/`이 하고
 * 여기는 경로·변환만 준다(`features/cart/index.ts`와 같은 이유).
 *
 * `장바구니 담기`의 뮤테이션은 `features/cart`에 있다 — feature끼리 직접 잇지
 * 않으므로 `app/`의 클라이언트 조립부(`ProductDetailClient.tsx`)가 둘을 붙인다.
 */
export { ProductDetailView } from "./components/ProductDetailView";
export { PRODUCT_PATH } from "./api/paths";
export { toProductDetail } from "./derive";
export type {
  AddToCartResult,
  CartItemDraft,
  ListingDetailWire,
  ProductDetail,
} from "./types";
