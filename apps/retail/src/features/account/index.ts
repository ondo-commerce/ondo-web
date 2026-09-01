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
