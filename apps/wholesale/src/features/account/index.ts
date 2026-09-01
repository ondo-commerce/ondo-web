/**
 * account feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
/*
 * `AccountMenu`와 `ErpGuard`가 화면들과 나란히 나가는 이유: 둘 다 셸
 * (`shared/components/AppShell`·`Topbar`) 자리에 서지만 세션을 읽어야 한다.
 * 셸이 직접 읽으면 `shared → features` 역방향 참조가 된다 — 대신
 * `app/(erp)/layout.tsx`가 여기서 가져다 셸에 끼워 넣는다.
 */
export { AccountMenu } from "./components/AccountMenu";
export { ApprovalRejectedView } from "./components/ApprovalRejectedView";
export { ApprovalStatusView } from "./components/ApprovalStatusView";
export { ErpGuard } from "./components/ErpGuard";
export { LoginView } from "./components/LoginView";
export { OnboardingBankView } from "./components/OnboardingBankView";
export { SignupView } from "./components/SignupView";
