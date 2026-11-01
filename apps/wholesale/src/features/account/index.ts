/**
 * account feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
/*
 * `AccountMenu`·`ErpGuard`도 여기로 나간다: 셸 자리에 서지만 세션을 읽어야 하는데
 * 셸이 직접 읽으면 `shared → features` 역방향 참조다. `app/(erp)/layout.tsx`가
 * 여기서 가져다 끼워 넣는다.
 */
export { AccountMenu } from "./components/AccountMenu";
export { ApprovalRejectedView } from "./components/ApprovalRejectedView";
export { ApprovalStatusView } from "./components/ApprovalStatusView";
export { ErpGuard } from "./components/ErpGuard";
export { LoginView } from "./components/LoginView";
export { SignupView } from "./components/SignupView";
/*
 * 채팅 쓰던 글(loop-08b S3)이 이메일을 키로 쓰고 로그아웃 때 지워진다. chat feature가 여기를 직접 못 읽어서
 * `app/`이 이 둘로 잇는다
 */
export { onSignOut, useSessionEmail } from "./store";
