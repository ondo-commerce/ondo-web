import type {
  OrderStatus,
  PaymentMethod,
  ReceiveMethod,
  SettlementStatus,
} from "./types";

/** 주문 상태 라벨. 코드값은 영문 그대로 두고 한국어는 이 표에서만 만든다 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "신규 주문",
  CONFIRMED: "주문 확정",
  PARTIALLY_SHIPPED: "부분 출고",
  SHIPPED: "출고 완료",
  CANCELED: "취소",
};

/**
 * 정산 상태 라벨. **`미정산`이 아니라 `미결제`다** (screen_spec §9.4 · glossary §5.1).
 * Figma 카드에 `미정산`으로 그려져 있지만 Figma 쪽이 틀린 것이다.
 */
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  UNPAID: "미결제",
  PARTIAL: "부분 정산",
  SETTLED: "정산 완료",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  BANK_TRANSFER: "계좌 이체",
};

/** 표준어는 붙여쓰기 `사입삼촌`이다 (glossary §4.3 > screen_spec §3.2) */
export const RECEIVE_METHOD_LABEL: Record<ReceiveMethod, string> = {
  AGENT_VISIT: "사입삼촌",
  SELF_PICKUP: "직접 수령",
};

/**
 * 필터 칩 줄에 나오는 상태 4종 + `전체`.
 *
 * **`취소`는 칩이 없다**(01-pm.md 게이트 결정 Q2). 취소된 주문은 `전체`에서만 보인다 —
 * 칩을 늘리면 Figma를 고쳐야 하고, 취소는 되돌릴 수 없어 목록에서 따로 훑을 일이 없다.
 */
export const FILTER_STATUSES: readonly OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
];

/** 필터 칩의 `전체` 값. 상태 코드와 섞이지 않게 별도 값으로 둔다 */
export const STATUS_FILTER_ALL = "ALL";

/**
 * 색상·사이즈 필터의 "전체" 값. 단일 선택이라 비어 있는 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다). 재고 탭 `FILTER_ALL`과 같은 규칙이다.
 */
export const LINE_FILTER_ALL = "전체";

/**
 * 파랑 배지(`tone="active"`)를 다는 상태.
 * **`Badge`는 파랑·회색 2색뿐이다** — 상태가 늘어나도 색을 늘리지 않는다.
 * 진행 중인 것이 파랑, 끝났거나 무효인 것이 회색이다.
 */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "PARTIALLY_SHIPPED",
];

/** 정산 배지도 같은 규칙 — 아직 받을 돈이 남았으면 파랑, 다 받았으면 회색 */
export const ACTIVE_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "UNPAID",
  "PARTIAL",
];
