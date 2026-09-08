import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response/Request 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 *
 * 용어 대응: 화면의 `거래처` = 서버 `retailer`(소매처), 화면의 `판매`/`입금` 원장 줄 = `SALE`/`PAYMENT`,
 * 화면의 `결제 주체` = `paidBy`, `입금 방식` = `method`.
 *
 * 정산의 단위는 주문이 아니라 **거래관계(소매처)**다(`settlement_data_model.md` §1).
 * 돈은 소매처별로 쌓이고(원장) 입금은 그 잔액에서 빠진다 — 주문은 그 잔액을 나눠 갖는 쪽이다(배정).
 * ------------------------------------------------------------------------ */

/** 소매처별 미수 한 행(아코디언 머리). `ledgerBalance`는 부호 그대로 — 음수 = 소매처 채무, 양수 = 선수금 */
export type ReceivableRetailer = WholesaleSchema<"ReceivableRetailerResponse">;
/** 미수원장 한 줄. `balanceChange`는 부호 포함(판매 음수·입금 양수), `balanceAfter`는 그 시점 잔액 */
export type LedgerEntry = WholesaleSchema<"LedgerEntryResponse">;
/** 원장 한 페이지(`data` + `meta`). `meta.ledgerBalance`가 화면 하단 `현재 잔액`이다(필터·페이지와 무관한 전체 잔액) */
export type ReceivableLedgerPage = WholesaleSchema<"ReceivableLedgerResponse">;
/**
 * 정산 상태 세그먼트·배분 표의 주문 한 건. **주문 탭 목록과 같은 스키마**다(스펙: "정산 탭 [정산 상태]
 * 세그먼트가 같은 스키마를 쓴다 — `retailerId`를 넣으면 확정 주문만"). 정산 상태·미수 잔액은 서버값이다
 */
export type SettlementOrder = WholesaleSchema<"OrderSummaryResponse">;
export type PaymentCreateRequest = WholesaleSchema<"PaymentCreateRequest">;
export type PaymentAllocationRequest =
  WholesaleSchema<"PaymentAllocationRequest">;
export type PaymentCreated = WholesaleSchema<"PaymentCreatedResponse">;
export type BankAccount = WholesaleSchema<"BankAccountResponse">;
export type BankAccountCreateRequest =
  WholesaleSchema<"BankAccountCreateRequest">;
export type BankAccountUpdateRequest =
  WholesaleSchema<"BankAccountUpdateRequest">;

/** 원장 구분 2종 — 스펙 enum 그대로. 반품·수기 조정은 스펙에도 없다 */
export type LedgerEntryType = LedgerEntry["entryType"];
/** 주문 이행 상태 5종. 라벨은 서버 `status.label`을 그대로 쓰고 색만 constants에서 고른다 */
export type OrderStatus = SettlementOrder["status"]["key"];
/** 정산 축 3종 — 스펙 enum 그대로. 화면 문구는 `미결제 · 부분 정산 · 정산 완료`(glossary §5.1) */
export type SettlementStatus = SettlementOrder["settlementStatus"];
/**
 * 정산 상태 배지가 그리는 값 = 서버 3종 + 화면이 파생하는 `UNSHIPPED`(미출고).
 * 미수는 **출고 확정이 만드는 유일한 것**(glossary §4 · 스펙)이라 확정만 되고 안 나간 주문은 받을 돈이 아직 없다 —
 * 서버는 그것도 `UNPAID`로 내리지만 `미결제`라고 쓰면 원장 잔액과 표 합계가 갈린다(F1). `derive.toOrderView`
 */
export type SettlementBadgeStatus = SettlementStatus | "UNSHIPPED";
/**
 * 결제 주체. 대납은 **입금 방식이 아니라 주체**다(`settlement_data_model.md` §2.5 결정 S1).
 * `AGENT` = 사입삼촌 대납. 스펙: "`paidBy`(누구 손)와 `method`(무슨 수단)는 다른 축이다"
 */
export type PayerType = PaymentCreateRequest["paidBy"];
/** 입금 방식 2종뿐이다. 세 번째 선택지(대납 등)를 만들지 않는다 */
export type PaymentMethod = PaymentCreateRequest["method"];

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/** 소매처. 관리 화면이 없어 이 탭에서는 읽기만 한다 */
export interface RetailerView {
  id: number;
  name: string;
  /** 소매처코드. 시드(V900)에 코드가 없어 목은 빈 문자열이 온다 — 화면은 `-` */
  code: string;
}

/** 거래처 목록 한 행 */
export interface RetailerRowView {
  retailer: RetailerView;
  /** 확정 주문 건수. 서버값 — 주문 배열 길이로 세지 않는다 */
  orderCount: number;
  /** 미수 잔액(양수). `ledgerBalance`(계정 잔액, 채무면 음수)를 뒤집은 값 — `derive.outstandingOf` */
  receivable: number;
}

/** 정산 상태 표·배분 표의 주문 한 줄 */
export interface OrderRowView {
  id: number;
  /** `orderNumber`를 문자열로. `ORD-001` 같은 표기는 서버에 없다 */
  orderNumber: string;
  /** 표시용 `9월 7일 08:00`(KST) */
  orderedAt: string;
  /** 정렬용 원본(ISO). 배분 표의 FIFO 순서가 이것으로 정해진다 */
  orderedAtIso: string;
  orderAmount: number;
  status: OrderStatus;
  /** 서버가 내려준 라벨(`신규 주문` …). 화면 표에 라벨을 두지 않는다 */
  statusLabel: string;
  /** 출고분이 있는 주문은 서버값, 없으면 `UNSHIPPED` */
  settlementStatus: SettlementBadgeStatus;
  /**
   * 미수 잔액 = **출고된 금액 − 배정액**(한 정의, 거래처 행의 원장 잔액과 같은 기준).
   * 출고분이 있는 주문(`PARTIALLY_SHIPPED`·`SHIPPED`)은 서버 `outstandingAmount` 그대로, 출고 전 주문은 0 —
   * 응답에 출고 금액 필드가 없어 `status.key`로 근사한다(04-wire §3-6)
   */
  outstanding: number;
}

/** 원장 표 한 줄 */
export interface LedgerRowView {
  id: number;
  /** 표시용 `8월 12일 11:42`(KST) */
  date: string;
  entryType: LedgerEntryType;
  /** 부호 있는 금액. **입금 +, 판매 −** — 거래처 계정 잔액 관점(서버 `balanceChange` 그대로) */
  amount: number;
  /** 이 줄 시점의 잔액. 서버값 — 화면에서 누적하지 않는다 */
  balanceAfter: number;
}

/** 원장 한 페이지 + 전체 잔액 */
export interface LedgerView {
  rows: LedgerRowView[];
  /** 전체 원장의 현재 잔액(`meta.ledgerBalance`). 필터·페이지와 무관 */
  balance: number;
  totalElements: number;
  totalPages: number;
}

/**
 * 입금 등록 폼의 입력 한 벌. **소매처별로 부모가 든다** — 행을 접었다 펴도 적던 값이 남아야 한다(⑥).
 * 금액은 문자열로 든다: 빈칸과 0을 구분해야 해서 숫자로 바로 못 바꾼다.
 */
export interface DepositDraft {
  amountRaw: string;
  /** 입금 일시 텍스트(`2025-08-14 15:30`). Figma가 텍스트 한 줄이라 피커를 두지 않는다 */
  receivedAt: string;
  payerType: PayerType;
  method: PaymentMethod;
  memo: string;
  /**
   * 사람이 직접 고친 배분액만. 손대지 않은 행은 자동 배분값을 쓴다 —
   * 전부 상태로 들면 입금액이 바뀔 때 어느 값이 자동이고 어느 값이 사람 것인지 구분할 수 없다
   */
  editedAllocations: Record<number, number>;
  /**
   * `Idempotency-Key`. 입력이 바뀔 때마다 새로 만들고 같은 입력의 재전송은 같은 키를 쓴다 —
   * 스펙: "같은 키 재요청은 200 + 동일 본문". 입금은 중복 등록을 되돌릴 수단이 없다
   */
  idempotencyKey: string;
}

/**
 * 입금 등록 버튼 2개. 같은 엔드포인트다(스펙) — 차이는 `allocations`를 보내느냐뿐:
 * - `paymentOnly` — `allocations: []`. 전액이 미배정(선수금)으로 남는다. 통장에 돈이 먼저 들어왔는데
 *   어느 주문 값인지 아직 모를 때
 * - `settle` — 배분 표의 값이 그대로 배정된다
 */
export type DepositMode = "paymentOnly" | "settle";

/** 입금 요청의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸으로 간다 */
export type DepositField = keyof PaymentCreateRequest;

/** 입금 직후 남기는 결과. 재조회가 실패했으면(`refreshed=false`) 옛 숫자라는 걸 말하고 새 입금을 잠근다 */
export interface SettlementNotice {
  retailerName: string;
  amount: number;
  /** 어느 주문에도 안 붙은 금액(서버 `unallocatedAmount`). 선수금 칸이 화면에 없어 문구로만 */
  unallocated: number;
  refreshed: boolean;
}

/** 정산 계좌 한 건(목록·수정 폼이 같이 본다) */
export interface BankAccountView {
  id: number;
  bankName: string;
  accountNo: string;
  accountHolder: string;
  /** 없으면 빈 문자열. 스펙에 nullable이 없어 wire는 `string`이지만 실제로는 null이 온다 */
  memo: string;
  isPrimary: boolean;
  /** 표시용 `2025.01.15`(KST) */
  createdAt: string;
}

/** 계좌 추가·수정 폼의 입력 한 벌 */
export interface BankAccountDraft {
  bankName: string;
  accountNo: string;
  accountHolder: string;
  memo: string;
  isPrimary: boolean;
}

/** 계좌 요청의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸으로 간다 */
export type BankAccountField = keyof BankAccountCreateRequest;
