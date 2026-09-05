/**
 * cart feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 헤더 뱃지(`CartButton`)가 화면(`CartView`)과 나란히 나가는 것은 둘이 같은
 * 서버 값을 봐야 하기 때문이다. 셸(`shared/components/Header`)은 이것을 직접
 * 읽지 않고 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 — 그래야 import 방향이
 * `app → features → shared` 한 방향으로 남는다.
 */
export { CartView } from "./components/CartView";
export { CartButton } from "./components/CartButton";

/**
 * 서버 컴포넌트(`app/(shop)/cart/page.tsx` · `layout.tsx` · `checkout/page.tsx`)가
 * `serverApi()`로 받을 때 쓰는 경로와 변환. feature 안에 `server-only` 모듈을
 * 두지 않는 이유: 이 barrel을 클라이언트 컴포넌트도 import 해서, 서버 전용
 * 모듈이 섞이면 번들이 깨진다. fetch 자체는 `app/`이 하고 여기는 경로·변환만 준다.
 */
export { CART_PATH } from "./api/paths";
export { toCartLines } from "./derive";
export type { CartCountWire, CartWire } from "./types";

/**
 * 주문서가 담긴 목록을 읽어야 해서 밖으로 여는 것들.
 *
 * `features/order`가 이걸 직접 부르지 않는다 — feature끼리 참조하지 않는 대신
 * `app/(shop)/checkout`이 서버에서 목록을 받고 여기서 선택 상태를 읽어
 * `CheckoutLine[]`으로 바꿔 넘긴다. `lineQty`가 같이 나가는 이유: 수량은
 * 칸에 친 **글자**라 숫자로 읽는 곳이 `parseQty` 하나여야 하고, 그 통로가 이
 * 함수다. 조립부가 다시 파싱하면 판정이 두 벌이 된다.
 */
export { useCartDeselected } from "./store";
export { lineQty } from "./derive";
export type { CartLine } from "./types";

/**
 * 상품 상세의 `장바구니 담기`가 부를 뮤테이션. 이 회차는 만들어 두기만 한다 —
 * 상세 화면이 `variantId`를 아직 fixtures에서 읽고 있어 연결은 #163 몫이다.
 */
export { useAddCartItemMutation } from "./api/mutations";
