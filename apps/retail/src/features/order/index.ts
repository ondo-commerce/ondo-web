/**
 * order feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 서버 컴포넌트(`app/(shop)/{checkout,orders}`)가 `serverApi()`로 받을 때 쓰는
 * 경로·변환·주소 해석을 함께 연다. feature 안에 `server-only` 모듈을 두지 않는
 * 이유: 이 barrel을 클라이언트 컴포넌트도 import 해서, 서버 전용 모듈이 섞이면
 * 번들이 깨진다. fetch 자체는 `app/`이 하고 여기는 경로·변환만 준다.
 */
export { CheckoutView } from "./components/CheckoutView";
export { OrderCompleteView } from "./components/OrderCompleteView";
export { OrderListView } from "./components/OrderListView";
export { OrderDetailView, OrderNotFound } from "./components/OrderDetailView";
export { ORDER_API_PATH, ORDERS_PAGE_SIZE } from "./constants";
export {
  periodFrom,
  resolveCheckoutIds,
  resolveOpen,
  resolveOrderFilter,
  resolveOrderId,
  resolveOrderSort,
  resolvePage,
  toCheckoutGroups,
  toOrderDetail,
  toOrderPage,
  toOrderSummary,
} from "./derive";
export type { OrdersLocation } from "./derive";
export type {
  CheckoutWire,
  OrderDetailWire,
  OrderRecord,
  OrderSummaryWire,
} from "./types";
