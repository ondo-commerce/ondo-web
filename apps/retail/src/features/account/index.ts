/**
 * account feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
/*
 * `AccountChip`이 화면들과 나란히 나가는 것은 계정 칩이 로그아웃(계정 도메인)을
 * 알아야 하기 때문이다. 셸(`shared/components/Header`)은
 * 이것을 직접 읽지 않고 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 — 그래야
 * import 방향이 `app → features → shared` 한 방향으로 남는다.
 */
export { AccountChip } from "./components/AccountChip";
export { ApprovalRejectedView } from "./components/ApprovalRejectedView";
export { ApprovalStatusView } from "./components/ApprovalStatusView";
export { LoginView } from "./components/LoginView";
export { SettingsView } from "./components/SettingsView";
export { SignupView } from "./components/SignupView";
/*
 * 승인 두 화면의 `page.tsx`가 서버에서 `/me`를 읽고 이 순수 함수들로 "이 화면이
 * 맞는 상태인가"와 "무엇을 그릴까"를 정한다. 세션 읽기(`requireSession`)는
 * `shared/api/server.ts`의 것을 page가 직접 부른다 — `server-only` 모듈을 여기서
 * 다시 내보내면 이 index를 읽는 클라이언트 컴포넌트(`AccountChip`)가 깨진다.
 */
export {
  homePathForStatus,
  /*
   * 헤더 칩·설정·주문 상세 수령 상호가 `/me.shopName`을 **같은 함수**로 세운다.
   * 예전에는 설정 더미 보관소(`useStoreName` → 고정 더미 상호)를 주문 상세가 읽어서
   * 어느 계정이든 수령 상호가 같았다(`side-02` N5).
   */
  storeNameLabel,
  toAccountStatus,
  toApplicationView,
  toRejectionView,
} from "./derive";
