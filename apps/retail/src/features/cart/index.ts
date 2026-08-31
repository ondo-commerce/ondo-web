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
