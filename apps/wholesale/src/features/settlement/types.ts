/**
 * 정산의 단위는 주문이 아니라 **거래관계**다(`settlement_data_model.md` §1).
 * 돈은 거래처별로 쌓이고 입금은 그 잔액에서 빠진다 — 주문은 그 잔액을 나눠 갖는 쪽이다.
 * 화면 라벨은 `거래처`, 코드·타입은 소매처(`retailer`)를 쓴다(glossary §2.2).
 */
export interface TradeRelation {
  /** 거래관계 id. 주문·원장이 전부 이 id로 묶인다 */
  id: string;
  retailerName: string;
  /** 화면 행 좌측의 회색 코드 (`RT-007`) */
  retailerCode: string;
}

/**
 * 이행 축 5종(glossary §4.3). 정산 축과 **독립된 축**이라 여기에 정산 값이 섞이면 안 된다 —
 * Figma ORD-004의 주문 상태 칸에 `미결제`가 그려져 있지만 그건 정산 축의 값이고,
 * 화면에는 `신규 주문`(`placed`)으로 그린다(01-pm.md 게이트 Q1).
 */
export type FulfillmentStatus =
  "placed" | "confirmed" | "partialShipped" | "shipped" | "canceled";

/**
 * 정산 축 3종(glossary §5.1). **저장값이 아니라 파생값이다** —
 * 배정액과 주문 금액에서 매번 계산한다(`derive.ts`의 `settlementStatus`).
 * 폐기어 `정산 대기`·`미정산`은 이 집합에 없다.
 */
export type SettlementStatus = "unpaid" | "partial" | "settled";

/** 정산 화면이 쓰는 주문 한 건. 주문라인(품목)은 이 화면에 없다 — 금액만 본다 */
export interface SettlementOrder {
  id: string;
  /** 거래관계 id */
  relationId: string;
  orderNo: string;
  /**
   * `2025-08-12T09:14` 고정 폭 문자열.
   * **Date로 파싱하지 않는다** — 서버(UTC)와 브라우저(KST)의 날짜가 갈려 하이드레이션이 깨진다.
   * 정렬은 이 문자열의 사전순 비교로 하고, 표시는 잘라 붙인다(`formatDateTime`).
   */
  placedAt: string;
  totalAmount: number;
  fulfillmentStatus: FulfillmentStatus;
  /** 배정액 = Σ payment_allocation.amount. 정산 상태·미수 잔액이 전부 여기서 나온다 */
  allocatedAmount: number;
}

/**
 * 원장 엔트리 유형. 반품(`RETURN`)·수기 조정(`ADJUST`)은 화면 미설계·보류라
 * 타입에도 넣지 않는다(`settlement_data_model.md` §5.5).
 */
export type LedgerEntryType = "payment" | "charge";

/** 미수 원장 한 줄. append-only 원본이라 화면에서 고치지 않고 뒤에 붙이기만 한다 */
export interface LedgerEntry {
  id: string;
  relationId: string;
  /** `2025-08-10T14:30`. `SettlementOrder.placedAt`과 같은 규칙이다 */
  date: string;
  entryType: LedgerEntryType;
  /**
   * 부호 있는 금액. **입금 +, 판매 −** — 거래처 계정 잔액 관점이다.
   * ⚠️ `settlement_data_model.md` §2.4는 미수 잔액 관점이라 부호가 정반대(`CHARGE +`/`PAYMENT −`)다.
   *    화면(Figma)이 계정 잔액 관점이므로 이쪽을 따르고(01-pm.md 게이트 Q3),
   *    아코디언 tail의 `미수 잔액`은 `max(0, −잔액)`으로 뒤집어 파생시킨다.
   */
  amount: number;
}

/** 원장 표 한 줄 = 엔트리 + 그 줄까지의 누적 잔액. `balanceAfter`도 파생값이다 */
export interface LedgerRow extends LedgerEntry {
  /** 이 줄까지 누적한 계정 잔액. 미수가 남아 있으면 음수다 */
  balanceAfter: number;
}

/**
 * 결제 주체. 대납은 **입금 방식이 아니라 주체**로 표현한다
 * (`settlement_data_model.md` §2.5 결정 S1). 화면 라벨은 `사입삼촌 대납`(표준어)이다.
 */
export type PayerType = "retailer" | "purchasingAgent";

/** 입금 방식은 2종뿐이다. 세 번째 선택지(대납 등)를 만들지 않는다 */
export type PaymentMethod = "cash" | "bankTransfer";

/** 입금 등록 폼의 입력 한 벌. 제출 전까지는 화면 안에만 있다 */
export interface DepositDraft {
  /** 입금액. **빈칸과 0을 구분해야 해서** 빈칸은 null이다 */
  amount: number | null;
  /** 입금 일시. Figma가 텍스트 한 줄이라 형식 검증을 두지 않는다 */
  receivedAt: string;
  payerType: PayerType;
  method: PaymentMethod;
  memo: string;
}

/** 입금 1건이 주문 1건에 붙는 몫(`payment_allocation`). 입금 1 : 주문 N이다 */
export interface AllocationEntry {
  orderId: string;
  amount: number;
}

/**
 * 입금 등록 버튼 2개. **만드는 것이 다르다**(`settlement_data_model.md` §2.5):
 * - `paymentOnly` — `payment`만. 배분 입력값을 쓰지 않고 전액이 미배정으로 남는다.
 *   통장에 돈이 먼저 들어왔는데 어느 주문 값인지 아직 모를 때 쓴다.
 * - `settle` — `payment` + `payment_allocation`. 각 행의 배분액이 그대로 배정된다.
 */
export type DepositMode = "paymentOnly" | "settle";
