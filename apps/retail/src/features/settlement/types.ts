/**
 * 정산 · 거래처가 다루는 단위.
 *
 * **원장(`LedgerEntry`)이 돈의 유일한 원본이다.** 미수 잔액 · 연체 · 마지막 입금 ·
 * 이번 주 입금은 전부 원장에서 파생되고(`derive.ts`), 어디에도 따로 적지 않는다.
 * 잔액을 fixture에 한 번 더 적는 순간 화면마다 다른 금액이 박히고, 나중에는
 * 어느 것이 맞는지 아무도 모른다 — 실제로 도매처 홈(#98)이 그렇게 갈라져 있었다.
 */

/**
 * 원장 한 줄의 성격. **두 값뿐이다.**
 *
 * 사양 §4가 `판매 ↑`로 적어 둔 것을 쓰지 않는다 — 미수는 물건을 받은(출고된)
 * 시점에 생기므로(RT-64) 소매가 보는 사건은 `출고`다.
 */
export type LedgerKind = "SHIPMENT" | "PAYMENT";

/**
 * 결제 수단. **`현장 결제`는 없다** — 게이트 D2(2026-08-31)로 폐기됐고
 * `glossary` S1의 `현금`/`계좌 이체` 둘만 남았다.
 */
export type PayMethod = "CASH" | "TRANSFER";

/** 거래 원장 한 줄. 표시는 최신순이지만 fixture는 오래된 순으로 적는다(누적을 따라가려고) */
export interface LedgerEntry {
  id: string;
  wholesalerId: string;
  /** ISO 날짜. 화면에는 `formatDate`로 `2026.08.28` 형태로 나간다 */
  date: string;
  kind: LedgerKind;
  /**
   * 장끼(거래명세서) 번호. **출고 행만 갖는다.** 형식은 `JG-YYYYMMDD-NNN`이다
   * (§4 라벨 통일). 와이어프레임 여기저기의 `OUT-…`는 쓰지 않는다.
   */
  statementNo: string | null;
  /** 이 줄이 걸린 주문번호. 출고는 그 출고의 주문, 입금은 배정된 주문이다 */
  orderNo: string;
  /**
   * 이 입금 중 `orderNo`에 배정된 금액. **출고 행은 null**이다.
   *
   * 배정은 도매 사장이 수기로 정하고(게이트 §3-0 D) 소매는 받아 적기만 한다.
   * FIFO 자동 배정은 폐기됐으므로 소매가 계산으로 만들어 내지 않는다.
   */
  allocated: number | null;
  /**
   * 아직 어느 주문에도 안 걸린 금액. 출고 행은 null, 전액 배정된 입금은 0이다.
   * 남으면 잔액이 음수로 내려가고 그것을 `선수금`이라 부른다(§3-0 E).
   */
  unallocated: number | null;
  /** 입금 행만 갖는다. 출고 행은 화면에 `—`로 나간다 */
  method: PayMethod | null;
  /** 증감. **출고는 양수, 입금은 음수**다. 누적 잔액은 이 값만 더해서 나온다 */
  delta: number;
}

/** 입금 계좌 안내. 소매는 이걸 보고 자기 은행 앱에서 보낸다 — 화면에서 돈이 움직이지 않는다 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  /** 예금주. 도매처를 바꾸면 이것도 같이 바뀐다 */
  holder: string;
}

/** 거래한 적 있는 도매처 한 곳. 목록에 서는 기준은 **주문 이력**뿐이다(승인 층은 §3-0 A로 폐기) */
export interface TradePartner {
  wholesalerId: string;
  name: string;
  bank: BankAccount;
}

/** 연체 판정 결과. 금액·건수·최장 일수를 같이 들고 다닌다 — 카드와 표가 따로 세지 않게 */
export interface OverdueInfo {
  /** 기한이 지난 주문들의 잔여 합 */
  amount: number;
  count: number;
  /** 가장 오래 밀린 것의 D+n. 연체가 없으면 0 */
  maxDays: number;
}

/** 도매처별 미수 표 한 줄. **전부 원장에서 나온 값이다** */
export interface PartnerSettlement {
  wholesalerId: string;
  name: string;
  /** 미수 잔액. **음수면 선수금**이다 — 화면에는 부호가 아니라 말로 나간다(A4) */
  balance: number;
  overdue: OverdueInfo;
  /** 마지막 입금일(ISO). 입금 이력이 없으면 null */
  lastPaidAt: string | null;
  bank: BankAccount;
}

/** 원장 표 한 줄 = 원장 항목 + 그 줄까지의 누적 잔액 */
export interface LedgerRow {
  entry: LedgerEntry;
  /** 오래된 줄부터 `delta`를 더해 온 값. 화면은 최신순이라 위에서 아래로 줄어든다 */
  balance: number;
}
