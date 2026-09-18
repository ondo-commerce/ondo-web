/**
 * 정산 · 거래처가 다루는 단위.
 *
 * **잔액·연체·마지막 입금·최근 7일 입금은 서버 값이다.** 원장에서 다시 계산하지
 * 않는다 — 원장 합산과 서버 잔액이 다르면 서버가 맞다. 소매가 못 보는 줄(취소된
 * 입금 · 수기 조정)이 서버 잔액에는 반영돼 있을 수 있어서, 화면이 원장을 더해
 * 잔액을 만들면 그 순간부터 두 숫자가 갈린다. fixtures 시절엔 원장이 유일한
 * 원본이었지만(#122) 이제 원본은 서버다(#240).
 */

/* ────────────────────────────────────────────────────────────────────────
   wire — **손으로 적은 응답 타입이다.** 소매 스냅샷(`packages/api/openapi/retail.json`)에
   이 path가 없고 dev 서버에서 소매 스펙 문서를 못 받는다(#240). 도매 스냅샷의
   `retail-gateway/settlements`(도매 → 소매 백엔드)는 소매 서버가 한 번 더 모양을
   바꿔 내보내서(`wholesalerName`→`name` · 계좌 3필드→`bank` 객체 · `retailOrderId`→
   `orderNo` 문자열) 별칭으로 못 쓴다. **dev 실측(2026-09-18 · bombom@ondo.test)이
   원본이다.** 스냅샷에 실리면 `RetailSchema<"…">` 별칭으로 바꾼다(ADR-0002).
   ──────────────────────────────────────────────────────────────────────── */

/** `GET /api/retail/settlements` 한 줄의 `overdue`. 연체 기한은 서버 규칙(출고일 + 외상기간, 당일은 연체 아님)이다 */
export interface OverdueWire {
  amount: number;
  count: number;
  /** 가장 오래 밀린 것의 D+n. 연체가 없으면 0 */
  maxDays: number;
}

/**
 * 입금 계좌. 실측 세 줄이 전부 `bank: null`이라 **비null 모양은 미확정**이다 —
 * 도매 dev 계정 셋에 주계좌가 등록돼 있는데도 null이라 BE에 확인 중(#240).
 * 필드 이름은 스펙 `WholesalerWithBank`(주문서 응답)의 계좌 3필드와 같게 둔다.
 * 읽는 쪽(`derive.toBankAccount`)은 이 객체가 아니라 평평하게 와도 받는다.
 */
export interface BankAccountWire {
  bankName: string;
  bankAccountNo: string;
  bankAccountHolder: string;
}

/**
 * `GET /api/retail/settlements` 한 줄 = 거래한 적 있는 도매처 하나.
 * 실측: `{"wholesalerId":101,"name":"무드온","balance":46000,"overdue":{"amount":46000,
 * "count":1,"maxDays":9},"lastPaidAt":null,"paidLast7Days":0,"bank":null}`
 */
export interface PartnerSettlementWire {
  /** 숫자다. 도매처 홈(`/wholesalers/[id]`)·미송(`?wholesaler=`)이 받는 서버 id와 같은 축 */
  wholesalerId: number;
  name: string;
  /** 소매 화면 기준 부호 — 플러스 = 갚을 돈, 마이너스 = 선수금 */
  balance: number;
  overdue: OverdueWire;
  /** ISO 날짜. 입금 이력이 없으면 null */
  lastPaidAt: string | null;
  /** 오늘 포함 최근 7일 입금 합. 취소된 입금은 안 센다(서버 규칙) */
  paidLast7Days: number;
  bank: BankAccountWire | null;
  /**
   * 계좌 3필드가 `bank` 객체 대신 줄에 **평평하게** 실려 올 가능성. 도매 스냅샷의
   * gateway 스키마(`RetailSettlementSummaryResponse`)가 이 모양이고 소매 서버가 어떻게
   * 감싸는지 비null 실측이 없다 — `derive.toBankAccount`가 둘 다 읽는다
   */
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountHolder?: string | null;
}

/**
 * `GET /api/retail/settlements/{wholesalerId}/ledger` 한 줄.
 * 실측: `{"id":1,"date":"2026-09-08","kind":"SHIPMENT","statementNo":"JG-20260908-001",
 * "orderNo":"20260908-0230-0002","method":null,"delta":46000,"allocations":null,"unallocated":null}`
 *
 * `kind`·`method`를 union으로 좁히지 않는다 — 도매 원장에 `PAYMENT_VOID`(입금 취소)·`ADJUST`(조정)가
 * 2026-09-18 추가됐고 소매 원장에도 올 수 있다. 모르는 값은 화면이 코드값을 그대로 보인다.
 */
export interface LedgerEntryWire {
  id: number;
  /** ISO 날짜 */
  date: string;
  /** 실측 `SHIPMENT`. 입금은 `PAYMENT`(서버 설명) */
  kind: string;
  /** 장끼 번호 `JG-YYYYMMDD-NNN`. 출고 줄만 */
  statementNo: string | null;
  /** 통합 주문번호 `20260908-0230-0002`. 출고는 그 출고의 주문, 입금은 배정된 주문 */
  orderNo: string | null;
  /** 입금 줄만. `PAYMENT` 줄이 dev에 아직 없어 값(`CASH` / `BANK_TRANSFER` 추정)은 미실측 */
  method: string | null;
  /** 출고는 양수, 입금은 음수 */
  delta: number;
  /**
   * 입금 하나가 붙은 주문들. 항목 모양은 미실측이라 읽지 않는다 — 화면은 `orderNo` ·
   * `unallocated` · `delta`로 근거를 적는다. 모양이 확정되면 타입을 채운다
   */
  allocations: readonly unknown[] | null;
  /** 아직 어느 주문에도 안 붙은 돈. 출고 줄은 null */
  unallocated: number | null;
}

/* ────────────────────────────────────────────────────────────────────────
   뷰 — 화면이 읽는 모양. wire → 뷰 변환은 `derive.ts`의 `toXxx`뿐이다
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 원장 줄의 성격 중 화면이 **이름을 아는** 것. 서버 `kind`는 이보다 넓을 수 있어
 * `LedgerEntry.kind`는 `string`이고, 라벨은 `derive.kindLabel`이 여기 있는 값만 옮긴다.
 *
 * 미수는 물건을 받은(출고된) 시점에 생기므로(RT-64) 소매가 보는 사건은 `출고`다 —
 * 사양 §4의 `판매 ↑`를 쓰지 않는다.
 */
export type LedgerKind = "SHIPMENT" | "PAYMENT";

/** 거래 원장 한 줄. 표시는 최신순이다 */
export interface LedgerEntry {
  /** `String(id)`. React key */
  id: string;
  /** ISO 날짜. 화면에는 `formatDate`로 `2026.09.08` 형태로 나간다 */
  date: string;
  /** 서버 코드값 그대로. 아는 값(`LedgerKind`)만 한글이 되고 나머지는 코드가 보인다 */
  kind: string;
  /** 장끼 번호. **출고 행만 갖는다.** 형식은 `JG-YYYYMMDD-NNN`(§4 라벨 통일) */
  statementNo: string | null;
  /** 이 줄이 걸린 통합 주문번호. 어느 주문에도 안 걸린 입금은 null */
  orderNo: string | null;
  /** 결제 수단 코드값. 출고 행은 null이고 화면에 `—`로 나간다 */
  method: string | null;
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
