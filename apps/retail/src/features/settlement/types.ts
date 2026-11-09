/**
 * 정산 · 거래처가 다루는 단위.
 *
 * **잔액·연체·마지막 입금·최근 7일 입금은 서버 값이다.** 원장에서 다시 계산하지
 * 않는다 — 원장 합산과 서버 잔액이 다르면 서버가 맞다. 소매가 못 보는 줄(취소된
 * 입금 · 수기 조정)이 서버 잔액에는 반영돼 있을 수 있어서, 화면이 원장을 더해
 * 잔액을 만들면 그 순간부터 두 숫자가 갈린다. fixtures 시절엔 원장이 유일한
 * 원본이었지만(#122) 이제 원본은 서버다(#240).
 */

import type { RetailSchema } from "@ondo/api";

/* ────────────────────────────────────────────────────────────────────────
   wire — 생성 타입 별칭(ADR-0002). 두 op는 소매 스냅샷에 **초안 op**로 들어 있다
   (`packages/api/openapi/drafts/retail.json`, #420). 서버 자동 스펙엔 nullable·enum
   표시가 없어 초안이 retail-api DTO 코드를 읽고 적은 것이다.

   예전엔 손으로 쓴 타입이었고, 계좌 칸 이름을 주문서 응답(`WholesalerWithBank`의
   `bankAccountNo`)에서 빌려 와 서버 `bank.accountNo`와 어긋났다 — 계좌가 있는데
   "계좌 미등록"이 섰다(wire-01 W1-1). 손 타입은 그래서 막는다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * `GET /api/retail/settlements` 한 줄 = 거래한 적 있는 도매처 하나.
 * 실측(2026-11-09, bombom): `{"wholesalerId":101,"name":"무드온","balance":…,
 * "overdue":{…},"lastPaidAt":null,"paidLast7Days":0,
 * "bank":{"bankName":"국민은행","accountNo":"101-0101-0001","holder":"김무드"}}`.
 * `lastPaidAt`은 서버 `LocalDate`라 날짜만 온다(`2026-11-09`). 계좌 미등록은 `bank: null`.
 */
export type PartnerSettlementWire = RetailSchema<"PartnerSettlementResponse">;

/**
 * `GET /api/retail/settlements/{wholesalerId}/ledger` 한 줄.
 * 실측: `{"id":1,"date":"2026-09-08","kind":"SHIPMENT","statementNo":"JG-20260908-001",
 * "orderNo":"20260908-0230-0002","method":null,"delta":46000,"allocations":null,"unallocated":null}`
 *
 * `kind`는 `SHIPMENT` | `PAYMENT`, `method`는 `CASH` | `TRANSFER` | null 로 좁혀져 있다.
 * 예전엔 도매 원장의 `PAYMENT_VOID`·`ADJUST`가 올까 봐 string으로 뒀지만, 소매 서버
 * (`SettlementService.toResponse`)가 SHIPMENT 가 아닌 줄을 전부 `PAYMENT`로 내보내고
 * 도매 `BANK_TRANSFER`를 `TRANSFER`로 바꿔 준다(2026-11-09 코드 확인). 그 밖의 값은 오지 않는다.
 */
export type LedgerEntryWire = RetailSchema<"LedgerEntryResponse">;

/* ────────────────────────────────────────────────────────────────────────
   뷰 — 화면이 읽는 모양. wire → 뷰 변환은 `derive.ts`의 `toXxx`뿐이다
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 원장 줄의 성격. 서버가 이 둘만 보낸다(`LedgerEntryWire` 주석) — 생성 타입에서 가져온다.
 *
 * 미수는 물건을 받은(출고된) 시점에 생기므로(RT-64) 소매가 보는 사건은 `출고`다 —
 * 사양 §4의 `판매 ↑`를 쓰지 않는다.
 */
export type LedgerKind = LedgerEntryWire["kind"];

/** 입금 줄의 결제 수단. 출고 줄은 null */
export type LedgerMethod = NonNullable<LedgerEntryWire["method"]>;

/** 거래 원장 한 줄. 표시는 최신순이다 */
export interface LedgerEntry {
  /** `String(id)`. React key */
  id: string;
  /** ISO 날짜. 화면에는 `formatDate`로 `2026.09.08` 형태로 나간다 */
  date: string;
  /** 서버 코드값 그대로. 한글은 `derive.kindLabel`이 붙인다 */
  kind: LedgerKind;
  /** 장끼 번호. **출고 행만 갖는다.** 형식은 `JG-YYYYMMDD-NNN`(§4 라벨 통일) */
  statementNo: string | null;
  /** 이 줄이 걸린 통합 주문번호. 어느 주문에도 안 걸린 입금은 null */
  orderNo: string | null;
  /** 결제 수단 코드값. 출고 행은 null이고 화면에 `—`로 나간다 */
  method: LedgerMethod | null;
  /** 증감. **출고는 양수, 입금은 음수**다 */
  delta: number;
  /**
   * 아직 어느 주문에도 안 걸린 금액. 출고 행은 null, 전액 배정된 입금은 0이다.
   * 남으면 잔액이 음수로 내려가고 그것을 `선수금`이라 부른다(§3-0 E).
   * 배정된 금액은 따로 안 온다 — `|delta| − unallocated`로 근거 칸이 계산한다.
   */
  unallocated: number | null;
}

/** 입금 계좌 안내. 소매는 이걸 보고 자기 은행 앱에서 보낸다 — 화면에서 돈이 움직이지 않는다 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  /** 예금주. 도매처를 바꾸면 이것도 같이 바뀐다 */
  holder: string;
}

/** 연체 판정 결과. 서버가 세서 준다 — 카드와 표가 같은 값을 읽는다 */
export interface OverdueInfo {
  /** 기한이 지난 출고들의 잔여 합 */
  amount: number;
  count: number;
  /** 가장 오래 밀린 것의 D+n. 연체가 없으면 0 */
  maxDays: number;
}

/**
 * 거래한 적 있는 도매처 한 곳 = `settlements` 한 줄. 정산 표·거래처 표·도매처 홈
 * 통계가 **전부 이 하나를 읽는다** — 화면마다 다른 금액을 말할 자리가 없다.
 */
export interface PartnerSettlement {
  /** `String(wholesalerId)`. 주소(`?wholesaler=` · `/wholesalers/[id]`)와 React key에 그대로 쓴다 */
  wholesalerId: string;
  name: string;
  /** 미수 잔액. **음수면 선수금**이다 — 화면에는 부호가 아니라 말로 나간다(A4) */
  balance: number;
  overdue: OverdueInfo;
  /** 마지막 입금일(ISO). 입금 이력이 없으면 null */
  lastPaidAt: string | null;
  /** 오늘 포함 최근 7일 입금 합 */
  paidLast7Days: number;
  /** null이면 계좌 미등록 — 계좌 줄에 `계좌 미등록`이 서고 복사 버튼이 없다 */
  bank: BankAccount | null;
}

/** 원장 표 한 줄 = 원장 항목 + 그 줄까지의 잔액 */
export interface LedgerRow {
  entry: LedgerEntry;
  /** 서버 잔액에서 위 줄들의 `delta`를 빼 내려온 값. 맨 윗줄이 곧 서버 `balance`다 */
  balance: number;
}
