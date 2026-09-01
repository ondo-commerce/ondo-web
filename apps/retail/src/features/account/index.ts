/**
 * account feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
/*
 * `AccountChip`이 화면들과 나란히 나가는 것은 헤더의 계정 칩과 설정 화면이 같은
 * 보관소(`store.ts`)를 읽어야 하기 때문이다. 셸(`shared/components/Header`)은
 * 이것을 직접 읽지 않고 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 — 그래야
 * import 방향이 `app → features → shared` 한 방향으로 남는다.
 */
export { AccountChip } from "./components/AccountChip";
export { ApprovalRejectedView } from "./components/ApprovalRejectedView";
export { ApprovalStatusView } from "./components/ApprovalStatusView";
export { LoginView } from "./components/LoginView";
export { SettingsView } from "./components/SettingsView";
export { SignupView } from "./components/SignupView";
export { readStoreName } from "./derive";
/*
 * `useStoreName`이 public API 로 나가는 이유: 주문 상세의 조립부
 * (`app/(shop)/orders/[orderId]/OrderDetailClient.tsx`)가 수령인 상호를
 * 헤더 계정 칩·설정 화면과 **같은 보관소**에서 읽어야 한다. 예전에는
 * `shared/fixtures`의 `SHELL_ACCOUNT`가 상호명을 한 벌 더 들고 있었는데,
 * 그러면 설정에서 상호를 바꿔도 주문 상세만 옛 이름을 말한다.
 */
export { useStoreName } from "./store";
