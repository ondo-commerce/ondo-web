/**
 * settlement feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 정산·미수와 거래처 관리 **두 화면이 한 feature**에 있다. 거래처 목록의
 * `미수 잔액` 열이 정산 원장에서 파생되는데, feature를 나누면 원장 더미가
 * 복제되고 그 순간 두 화면이 서로 다른 금액을 말한다
 * (`CLAUDE.md` — feature끼리 직접 import하지 않는다).
 */
export { PartnersView } from "./components/PartnersView";
export { SettlementView } from "./components/SettlementView";
/* 도매처 홈(`features/catalog`)이 쓰는 거래 지표. 화면이 아니라 값 하나를 내보내는
   이유는 그 화면의 `진행 중`·`미송`·`미결제 잔액`이 전부 이쪽 원장에서 나오기
   때문이다 — 저쪽에 한 벌 더 적어 두었다가 두 화면이 다른 말을 했다(F1 · #128).
   feature끼리 직접 잇지 않으므로 합치는 자리는 `app/`이다(`CLAUDE.md`) */
export { partnerStatsOf } from "./derive";
