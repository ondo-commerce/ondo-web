import type { BadgeProps } from "@ondo/ui";
import type {
  BankAccountDraft,
  BankAccountField,
  DepositField,
  LedgerEntryType,
  OrderStatus,
  PayerType,
  PaymentMethod,
  SettlementBadgeStatus,
  SettlementStatus,
} from "./types";

/** `Badge`가 가진 색은 이 둘뿐이다 — 늘리지 않는다(게이트 G-2) */
type BadgeTone = NonNullable<BadgeProps["tone"]>;

/**
 * 주문 상태 배지 색 규칙: **진행 중인 것만 파랑, 나머지는 회색.**
 * 라벨은 서버 `status.label`을 그대로 쓴다 — 여기 두면 서버 문구와 갈린다.
 *
 * Figma는 초록·파랑·회색 3색으로 그려져 있지만 `packages/ui`의 `Badge`는 2색이고
 * 게이트 결정(G-2)이 **feature 안에서도 색을 늘리지 않기로** 정했다.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  NEW: "active",
  CONFIRMED: "active",
  PARTIALLY_SHIPPED: "active",
  SHIPPED: "done",
  CANCELLED: "done",
};

/**
 * 정산 축 라벨 3종 고정(glossary §5.1) + 화면 파생 `미출고`(출고 전이라 미수가 아직 없는 확정 주문).
 * 폐기어 `정산 대기`·`미정산`은 여기 없다
 */
export const SETTLEMENT_LABEL: Record<SettlementBadgeStatus, string> = {
  UNSHIPPED: "미출고",
  UNPAID: "미결제",
  PARTIALLY_SETTLED: "부분 정산",
  SETTLED: "정산 완료",
};

/**
 * 진행 중인 `부분 정산`만 파랑이다.
 * `미결제`와 `정산 완료`가 같은 회색이 되는 것은 **의도된 결과**다(게이트 Q2) —
 * 둘의 구분은 배지 글자와 같은 행의 `미수 잔액` 숫자가 맡는다. `미출고`도 받을 돈이 없는 줄이라 회색이다.
 */
export const SETTLEMENT_TONE: Record<SettlementBadgeStatus, BadgeTone> = {
  UNSHIPPED: "done",
  UNPAID: "done",
  PARTIALLY_SETTLED: "active",
  SETTLED: "done",
};

/** 정산 상태 필터에 세울 순서 = 진행 방향 */
export const SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "UNPAID",
  "PARTIALLY_SETTLED",
  "SETTLED",
];

/**
 * 결제 주체 라벨. 화면은 표준어 `사입삼촌 대납`을 그대로 쓴다(§9.1 G8) —
 * 현장에서 부르는 말이 그것이고, 코드값은 스펙 enum(`AGENT`)이다.
 */
export const PAYER_LABEL: Record<PayerType, string> = {
  RETAILER: "소매처 직접",
  AGENT: "사입삼촌 대납",
};

/** 입금 방식 **2종뿐이다**(스펙 enum). 대납은 방식이 아니라 결제 주체가 표현한다 */
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  BANK_TRANSFER: "계좌 이체",
};

/** 원장 구분 2종(스펙 enum). 반품·수기 조정은 스펙에도 화면에도 없다 */
export const LEDGER_LABEL: Record<LedgerEntryType, string> = {
  PAYMENT: "입금",
  SALE: "판매",
};

/**
 * 원장 구분의 화살표. **색 대신 이 기호가 구분을 맡는다**(게이트 Q2) —
 * 돈이 들어오면 ↓, 나가면(외상이 늘면) ↑다. 배지 색은 둘 다 회색 하나뿐이라
 * 이 기호와 금액 부호(`+` / `-`)를 빼면 두 줄이 같아 보인다. 지우지 말 것.
 */
export const LEDGER_ARROW: Record<LedgerEntryType, string> = {
  PAYMENT: "↓",
  SALE: "↑",
};

/** 원장 구분 필터에 세울 순서 */
export const LEDGER_ENTRY_TYPES: readonly LedgerEntryType[] = [
  "PAYMENT",
  "SALE",
];

/**
 * 필터의 "전체" 값. 단일 선택이라 비어 있는 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다). 재고 탭과 같은 규칙이다.
 */
export const FILTER_ALL = "전체";

/**
 * 소매처 목록 한 페이지. 화면에 페이저가 없어(Figma) 첫 페이지만 보인다 — 그 안에 최대한 담는다.
 * 상한은 상품 목록과 같은 100으로 본다(이 경로의 상한은 스펙에 없다, 04-wire §3).
 */
export const RETAILER_PAGE_SIZE = 100;
/** 소매처 하나의 확정 주문 한 페이지. 정산 상태 표와 배분 표가 같은 응답을 본다 */
export const ORDER_PAGE_SIZE = 100;
/** 소매처 하나의 원장 한 페이지(최신순). 넘치면 표 아래 한 줄로 알린다 */
export const LEDGER_PAGE_SIZE = 100;

/** 입금 요청의 칸. `toFieldErrors`가 이 이름의 `VALIDATION_FAILED`를 그 칸에 붙인다 */
export const DEPOSIT_FIELDS: readonly DepositField[] = [
  "retailerId",
  "amount",
  "paidAt",
  "paidBy",
  "method",
  "memo",
  "allocations",
];

/**
 * 입금이 거절됐을 때 사장에게 보일 문구. 코드로만 가른다 — 서버 `message`는 개발자용이라
 * 바뀔 수 있고, 그 아래 보조로만 쓴다(`derive.depositErrorText`).
 *
 * 409·404 문구는 "새로 불러왔다"고 말한다 — 뮤테이션 `onError`가 그 자리에서 소매처·주문·원장을
 * 무효화하므로 문구가 뜰 때는 배분 표가 이미 새 숫자다. "다시 불러온 뒤 확인하라"는 말은
 * 이미 불러온 화면 앞에서 거짓이었다(wire-settlement F8, #198).
 */
export const DEPOSIT_ERROR_TEXT: Readonly<Record<string, string>> = {
  PAID_AT_IN_FUTURE: "입금 일시가 미래예요. 지금 이전 시각으로 적어 주세요.",
  DUPLICATE_ORDER:
    "같은 주문에 두 번 배분했어요. 배분 표를 다시 확인해 주세요.",
  ORDER_RETAILER_MISMATCH: "다른 거래처의 주문이 섞여 있어요.",
  RESOURCE_NOT_FOUND:
    "거래처나 주문이 이미 없어요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  IDEMPOTENCY_KEY_REUSED:
    "같은 요청이 이미 처리됐어요. 목록을 새로 불러왔으니 확인해 주세요.",
  STATE_CONFLICT:
    "지금 상태에서는 등록할 수 없어요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  ORDER_NOT_CONFIRMED:
    "확정되지 않은 주문에는 배분할 수 없어요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  ALLOCATION_EXCEEDS_PAYMENT: "배분 합계가 입금액을 넘었어요.",
  ALLOCATION_EXCEEDS_OUTSTANDING:
    "미수보다 많이 배분한 주문이 있어요. 목록을 새로 불러왔으니 배분을 확인하고 다시 눌러 주세요.",
};

/** 계좌 요청의 칸 */
export const BANK_ACCOUNT_FIELDS: readonly BankAccountField[] = [
  "bankName",
  "accountNo",
  "accountHolder",
  "memo",
  "isPrimary",
];

/** 계좌 등록·수정·삭제가 거절됐을 때의 문구 */
export const BANK_ACCOUNT_ERROR_TEXT: Readonly<Record<string, string>> = {
  DUPLICATE_BANK_ACCOUNT: "이미 등록된 계좌예요.",
  PRIMARY_ACCOUNT_CANNOT_BE_UNSET:
    "주계좌는 직접 해제할 수 없어요. 다른 계좌를 주계좌로 지정하면 내려가요.",
  RESOURCE_NOT_FOUND: "이미 없어진 계좌예요. 목록을 다시 불러왔어요.",
};

/**
 * 계좌 폼 빈 값. 은행 목록 API·상수가 없어 은행명은 자유 입력이다(04-wire §3) —
 * 스펙도 "계좌번호 형식은 검증하지 않는다(은행마다 달라 자유 입력)".
 */
export const EMPTY_BANK_ACCOUNT_DRAFT: BankAccountDraft = {
  bankName: "",
  accountNo: "",
  accountHolder: "",
  memo: "",
  isPrimary: false,
};

/** 목록이 비었을 때(검색어 없이). 검색 결과 0건은 따로 `검색 결과가 없습니다` */
export const EMPTY_LIST_TEXT = "미수 거래처가 없습니다";
export const EMPTY_DETAIL_TEXT = "좌측 목록에서 거래처를 펼쳐 주세요";
