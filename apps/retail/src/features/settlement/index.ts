/**
 * settlement feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 *
 * 정산·미수와 거래처 관리 **두 화면이 한 feature**에 있다. 둘 다 같은 응답
 * (`GET /settlements`)으로 서고, 거래처 목록 전용 API는 없다(#240). feature를
 * 나누면 같은 응답을 두 번 변환하고 그 순간 두 화면이 서로 다른 금액을 말한다.
 *
 * 서버 컴포넌트(`app/(shop)/{settlements,wholesalers}`)가 `serverApi()`로 받을 때
 * 쓰는 경로·변환·주소 해석을 함께 연다. feature 안에 `server-only` 모듈을 두지
 * 않는 이유는 `features/order`와 같다 — 이 barrel을 클라이언트 컴포넌트도 import
 * 해서, 서버 전용 모듈이 섞이면 번들이 깨진다. fetch 자체는 `app/`이 한다.
 */
export { PartnersView } from "./components/PartnersView";
export { SettlementView } from "./components/SettlementView";
export { SETTLEMENT_API_PATH } from "./constants";
export {
  findSettlement,
  resolvePartnerId,
  toLedgerEntry,
  toPartnerSettlements,
} from "./derive";
export type {
  LedgerEntry,
  LedgerEntryWire,
  PartnerSettlement,
  PartnerSettlementWire,
} from "./types";
