/**
 * settlement feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 정산·미수와 거래처 관리 **두 화면이 한 feature**에 있다. 거래처 목록의
 * `미수 잔액` 열이 정산 원장에서 파생되는데, feature를 나누면 원장 더미가
 * 복제되고 그 순간 두 화면이 서로 다른 금액을 말한다
 * (`CLAUDE.md` — feature끼리 직접 import하지 않는다).
 */
export { SettlementView } from "./components/SettlementView";
