/**
 * order feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * **`features/cart`를 읽지 않는다.** 주문서가 장바구니 목록을 받아야 하지만
 * feature끼리 직접 참조하는 대신 `app/(shop)/checkout`이 조립한다 —
 * 그래서 밖으로 나가는 것에 `CheckoutLine` 타입이 들어 있다(가정 A10).
 */
export { CheckoutView } from "./components/CheckoutView";
export { OrderCompleteView } from "./components/OrderCompleteView";
export { resolveScenario } from "./derive";
export type { CheckoutLine, OrderScenario } from "./types";
