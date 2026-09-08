import type {
  LineFilter,
  OrderFilterKey,
  OrderStatus,
  PaymentMethod,
  ReceiveBy,
  SettlementStatus,
} from "./types";

/**
 * 주문 상태 라벨. 코드값은 스펙 enum 그대로 두고 한국어는 이 표에서만 만든다.
 *
 * 서버도 `status.label`을 내려주지만 **안 쓴다** — 화면 문구는 glossary §4.3이 원본이고,
 * 서버는 `CANCELLED`를 `주문 취소`로 준다(화면은 `취소`). 표가 `Record`라 상태가 늘면
 * 컴파일이 깨져서 알 수 있다.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "신규 주문",
  CONFIRMED: "주문 확정",
  PARTIALLY_SHIPPED: "부분 출고",
  SHIPPED: "출고 완료",
  CANCELLED: "취소",
};

/**
 * 정산 상태 라벨. **`미정산`이 아니라 `미결제`다** (screen_spec §9.4 · glossary §5.1).
 * Figma 카드에 `미정산`으로 그려져 있지만 Figma 쪽이 틀린 것이다.
 */
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  UNPAID: "미결제",
  PARTIALLY_SETTLED: "부분 정산",
  SETTLED: "정산 완료",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  BANK_TRANSFER: "계좌 이체",
};

/** 표준어는 붙여쓰기 `사입삼촌`이다 (glossary §4.3 > screen_spec §3.2) */
export const RECEIVE_METHOD_LABEL: Record<ReceiveBy, string> = {
  AGENT: "사입삼촌",
  RETAILER: "직접 수령",
};

/**
 * 필터의 `전체` 값. 서버 칩 키의 `ALL`과 같은 글자라 상태 세그먼트 값이 곧 `filter`
 * 파라미터가 된다. 정산 상태 드롭다운도 **같은 값을 쓴다** — 축은 다르지만
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
 */
export type SettlementFilterValue = SettlementStatus | typeof STATUS_FILTER_ALL;

/**
 * 정산 필터 세그먼트에 세울 값과 그 순서. `전체` 다음 미결제 → 부분 → 완료로
 * 진행 방향을 따른다. 라벨은 `SETTLEMENT_STATUS_LABEL`에서 꺼내므로 여기 두지 않는다.
 */
export const SETTLEMENT_FILTER_VALUES: readonly SettlementFilterValue[] = [
  STATUS_FILTER_ALL,
  "UNPAID",
  "PARTIALLY_SETTLED",
  "SETTLED",
];

/**
 * 정산 필터 칸의 라벨. `전체`까지 포함해 **한 표에서 다 찾힌다** — 화면에서
 * `ALL`만 따로 삼항으로 갈라내지 않아도 된다. 배지와 필터가 같은 문구를 쓰게
 * `SETTLEMENT_STATUS_LABEL`을 펼친다.
 */
export const SETTLEMENT_FILTER_LABEL: Record<SettlementFilterValue, string> = {
  ...ALL_STATUS_LABEL,
  ...SETTLEMENT_STATUS_LABEL,
};

/** 이행 축 필터 값 = 서버 칩 키. `filter` 파라미터에 그대로 실린다 */
export type OrderFilterValue = OrderFilterKey;

/**
 * 주문 상태 필터 세그먼트에 세울 값과 그 순서.
 *
 * **`취소`는 칸이 없다**(01-pm.md 게이트 결정 Q2). 서버 칩(`GET /orders/filters`)에는
 * `CANCELLED`가 오지만 세우지 않는다 — 취소된 주문은 `전체`에서만 보인다.
 * 서버 배열 순서("곧 칩 표시 순서")와 같지만 세울 칸을 정하는 건 이 배열이다.
 */
export const ORDER_FILTER_VALUES: readonly OrderFilterValue[] = [
  STATUS_FILTER_ALL,
  "NEW",
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

/** 아무것도 안 건 라인 필터. 행을 펼칠 때의 초기값이다 */
export const LINE_FILTER_NONE: LineFilter = {
  color: LINE_FILTER_ALL,
  size: LINE_FILTER_ALL,
};

/**
 * 파랑 배지(`tone="active"`)를 다는 상태.
 * **`Badge`는 파랑·회색 2색뿐이다** — 상태가 늘어나도 색을 늘리지 않는다.
 * 진행 중인 것이 파랑, 끝났거나 무효인 것이 회색이다.
 */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "PARTIALLY_SHIPPED",
];

/** 정산 배지도 같은 규칙 — 아직 받을 돈이 남았으면 파랑, 다 받았으면 회색 */
export const ACTIVE_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "UNPAID",
  "PARTIALLY_SETTLED",
];

/**
 * 목록 한 페이지 크기. 스펙 상한(`size > 100`이면 400)이다.
 * 기본값 20을 안 쓰는 이유: 이 표는 세로 스크롤을 직접 받는 밀도로 설계됐고,
 * 더미 시절 75건이 한 화면에 흘렀다. 그 밀도를 유지한다.
 */
export const PAGE_SIZE = 100;

/**
 * 확정·취소·포장이 거절됐을 때 사장이 읽을 문구. 코드로만 가른다 — 서버 `message`는
 * 개발자 문장이라 제목으로 안 쓰고 그 아래 보조로만 붙인다(`describeError`와 같은 규칙).
 *
 * 스펙 설명(`@Operation`)에 적힌 코드만 있다. 여기 없는 코드는 `describeError`의 종류별
 * 제목으로 떨어진다 — 사장이 아무 말도 못 보는 일은 없다.
 *
 * 409·404 문구는 "새로 불러왔다"고 말한다 — 뮤테이션 `onError`가 그 자리에서 상세·목록·칩을
 * 무효화하므로(#198) 문구가 뜰 때는 이미 재조회가 나간 뒤다. "다시 불러온 뒤 확인하라"는
 * 말은 다시 불러올 길이 화면에 없어 사장을 같은 버튼으로 되돌려 보냈다(F3).
 */
export const ORDER_ERROR_TEXT: Readonly<Record<string, string>> = {
  TRANSITION_NOT_ALLOWED:
    "지금 상태에서는 할 수 없는 작업이에요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  ALLOCATION_EXCEEDS_ORDER: "이번 출고가 주문 수량을 넘겼어요.",
  ALLOCATION_EXCEEDS_REMAINING: "이번 출고가 남은 미송 수량을 넘겼어요.",
  INSUFFICIENT_STOCK: "재고가 모자라요. 가용재고를 다시 확인해 주세요.",
  ORDER_ITEM_MISSING: "빠진 라인이 있어요. 모든 라인의 수량을 보내야 해요.",
  ORDER_ITEM_NOT_IN_ORDER: "이 주문에 없는 라인이 섞였어요.",
  DUPLICATE_ORDER_ITEM: "같은 라인이 두 번 들어갔어요.",
  INVARIANT_VIOLATED: "수량이 맞지 않아요. 다시 입력해 주세요.",
  DOCUMENT_FROZEN: "이미 출고에 묶인 포장이라 여기서는 지울 수 없어요.",
  RESOURCE_NOT_FOUND: "이미 없어진 항목이에요. 목록을 새로 불러왔어요.",
};
