/**
 * cart feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 헤더 뱃지(`CartButton`)가 화면(`CartView`)과 나란히 나가는 것은 둘이 같은
 * 스토어를 읽어야 하기 때문이다. 셸(`shared/components/Header`)은 이것을 직접
 * 읽지 않고 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 — 그래야 import 방향이
 * `app → features → shared` 한 방향으로 남는다.
 */
export { CartView } from "./components/CartView";
export { CartButton } from "./components/CartButton";

/**
 * 주문서가 담긴 목록을 읽어야 해서 밖으로 여는 것들.
 *
 * `features/order`가 이걸 직접 부르지 않는다 — feature끼리 참조하지 않는 대신
 * `app/(shop)/checkout`이 여기서 읽어 `CheckoutLine[]`으로 바꿔 넘긴다.
 * `lineQty`가 같이 나가는 이유: 수량은 칸에 친 **글자**라 숫자로 읽는 곳이
 * `parseQty` 하나여야 하고, 그 통로가 이 함수다. 조립부가 다시 파싱하면
 * 판정이 두 벌이 된다.
 */
export { useCartLines, useCartSelected, removeLines } from "./store";
export { lineQty } from "./derive";
export type { CartLine } from "./types";
