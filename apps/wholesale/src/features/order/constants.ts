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
 * 필터의 `전체` 값. 상태 코드와 섞이지 않게 별도 값으로 둔다.
 * 주문 상태 세그먼트와 정산 상태 드롭다운이 **같은 값을 쓴다** — 축은 다르지만
 * "안 걸었다"는 뜻은 하나여서 상수를 둘로 늘리지 않는다.
 */
export const STATUS_FILTER_ALL = "ALL";

/** 필터의 `전체` 칸에 붙는 라벨. 두 축의 라벨 표가 같이 쓰므로 정의는 여기 한 번뿐이다 */
export const FILTER_ALL_LABEL = "전체";

export const ALL_STATUS_LABEL = {
  [STATUS_FILTER_ALL]: FILTER_ALL_LABEL,
};

/**
 * 정산 상태 필터가 가질 수 있는 값. **유니온을 손으로 쓴다** — 값 목록에서 역산하면
 * (`keyof typeof ...`) 정산 상태가 늘었을 때 컴파일이 안 깨져서 알 수가 없다.
 * 출고 탭 `PickupFilterValue`와 같은 꼴이고, 타입을 채우는 값 목록 바로 옆에 둔다.
 */
export type SettlementFilterValue = SettlementStatus | typeof STATUS_FILTER_ALL;

/**
 * 정산 필터 세그먼트에 세울 값과 그 순서. `전체` 다음 미결제 → 부분 → 완료로
 * 진행 방향을 따른다. 라벨은 `SETTLEMENT_STATUS_LABEL`에서 꺼내므로 여기 두지 않는다.
 *
 * 값 목록이 곧 세그먼트 칸이다 — 주문 축이 `취소`를 빼는 것처럼(`ORDER_FILTER_VALUES`),
 * 축의 값 전부를 세우지 않을 수 있어야 해서 `Record`가 아니라 배열이다.
 */
export const SETTLEMENT_FILTER_VALUES: readonly SettlementFilterValue[] = [
  STATUS_FILTER_ALL,
  "UNPAID",
  "PARTIAL",
  "SETTLED",
];

/**
 * 정산 필터 칸의 라벨. `전체`까지 포함해 **한 표에서 다 찾힌다** — 화면에서
 * `ALL`만 따로 삼항으로 갈라내지 않아도 된다.
 *
 * 상태 라벨을 다시 쓰지 않고 `SETTLEMENT_STATUS_LABEL`을 펼친다. 배지와 필터가
 * 같은 문구를 쓰게 강제하려는 것이다 — `미결제`는 스펙이 정한 말이라(위 참고)
 * 두 벌이 되면 한쪽만 고쳐질 수 있다.
 *
 * `Record`라서 정산 상태가 늘면 여기서 컴파일이 깨진다. 반대로 **어느 칸을 세울지는
 * 이 표가 정하지 않는다** — 그건 위의 값 배열이 정한다(`Object.keys`는 타입이 날아간다).
 */
export const SETTLEMENT_FILTER_LABEL: Record<SettlementFilterValue, string> = {
  ...ALL_STATUS_LABEL,
  ...SETTLEMENT_STATUS_LABEL,
};

/** 이행 축 필터가 가질 수 있는 값. 정산 축과 같은 꼴이다 */
export type OrderFilterValue = OrderStatus | typeof STATUS_FILTER_ALL;

/**
 * 주문 상태 필터 세그먼트에 세울 값과 그 순서.
 *
 * **`취소`는 칸이 없다**(01-pm.md 게이트 결정 Q2). 취소된 주문은 `전체`에서만 보인다 —
 * 칸을 늘리면 Figma를 고쳐야 하고, 취소는 되돌릴 수 없어 목록에서 따로 훑을 일이 없다.
 * 아래 라벨 표에는 `취소`가 있지만 여기 없다 — 세울 칸을 정하는 건 이 배열이다.
 */
export const ORDER_FILTER_VALUES: readonly OrderFilterValue[] = [
  STATUS_FILTER_ALL,
  "PLACED",
  "CONFIRMED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
];

/** 주문 상태 필터 칸의 라벨. 정산 축과 같은 규칙 — 상태 라벨 표를 펼쳐 한 벌로 유지한다 */
export const ORDER_FILTER_LABEL: Record<OrderFilterValue, string> = {
  ...ALL_STATUS_LABEL,
  ...ORDER_STATUS_LABEL,
};

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
