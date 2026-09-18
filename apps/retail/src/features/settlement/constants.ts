/**
 * 정산 · 거래처 화면의 고정 값과 문구.
 *
 * **컴포넌트 안에 문장을 적지 않는다** — 같은 말이 두 곳에 있으면 한쪽만 고쳐진다.
 *
 * 기준일·연체 일수·입금 창 길이는 **여기 없다.** 연체 판정과 최근 7일 입금은 서버가
 * 세서 주므로(`overdue` · `paidLast7Days`) 화면이 날짜 계산을 하지 않는다(#240).
 */

/**
 * 서버 path. 이 feature가 부르는 path는 이 둘뿐이다 — 둘 다 Server Component가
 * `serverApi()`로 받는다. 거래처 목록 전용 path(`/wholesalers`)는 **없다**(404 실측) —
 * 거래처 화면도 `list`로 그린다.
 */
export const SETTLEMENT_API_PATH = {
  list: "/api/retail/settlements",
  ledger: (wholesalerId: string) =>
    `/api/retail/settlements/${wholesalerId}/ledger`,
} as const;

/** 정산 화면 패널 부제. 미수가 **언제** 생기는지(RT-64)와 누가 입금을 등록하는지(RT-63)를 한 줄에 담는다 */
export const SETTLEMENT_SUB =
  "미수는 물건을 받은(출고된) 시점에 생겨요. 입금은 도매처가 통장을 확인해 등록하면 반영돼요.";

/** 원장 패널 부제. 부호의 방향을 표 위에서 미리 말한다 */
export const LEDGER_SUB =
  "출고는 미수를 더하고(+), 입금은 미수를 뺍니다(−). 최신순이에요.";

/**
 * 계좌 안내 아래 ℹ 배너. **소매는 입금을 등록할 수 없다**(RT-63).
 * 이 말이 없으면 사장이 "입금 등록" 버튼을 찾다 만다.
 */
export const PAYMENT_NOTICE =
  "입금은 소매처가 등록할 수 없어요. 도매처가 통장을 확인해 등록하면 미수에 반영돼요.";

/**
 * 계좌가 없는 도매처의 계좌 줄. 빈칸으로 두면 "아직 안 그려진 것"으로 읽힌다 —
 * 없다는 사실을 글자로 말해야 사장이 도매처에 계좌를 물어본다.
 */
export const BANK_MISSING = "계좌 미등록";

/** 거래처가 한 곳도 없을 때. 아이콘 + 한 줄 + 다음 행동 버튼이 빈 상태 공통 형식이다(RT-33) */
export const EMPTY_PARTNERS = {
  title: "아직 거래한 도매처가 없어요",
  description: "마켓에서 첫 주문을 넣으면 여기에 정산 내역이 쌓여요.",
} as const;

/** 그 도매처에 원장이 한 줄도 없을 때. 표 자리만 비고 계좌 안내와 ℹ는 그대로 남는다 */
export const EMPTY_LEDGER = "아직 이 도매처와 오간 거래가 없어요.";

/**
 * 복사 버튼이 누른 뒤에 그 자리에서 하는 말.
 *
 * **눌렀는지 안 눌렀는지 화면이 말해야 한다** — 앞 회차 P0(`실행에 아무 확인 신호가
 * 없다`)가 이 자리다. 클립보드가 막힌 환경(비보안 컨텍스트·권한 거부)에서도 조용히
 * 넘어가지 않고 실패를 말한다.
 */
export const COPY_STATUS_TEXT = {
  copied: "복사했어요",
  failed: "복사 실패",
} as const;

/** 복사 표시가 남아 있는 시간(ms). 너무 짧으면 못 보고, 너무 길면 다음 줄을 눌렀을 때 헷갈린다 */
export const COPY_STATUS_MS = 2500;

/**
 * 거래처 관리 패널 부제. 이 화면이 **무엇으로 서는지**(주문 이력)와 어디로 이어지는지를
 * 표 위에서 미리 말한다. fixtures 시절의 미송 배지 안내는 열과 같이 빠졌다(#240).
 */
export const PARTNERS_SUB =
  "거래한 적 있는 도매처예요. 도매처 홈에서 그 집 상품을, 정산에서 거래 원장을 볼 수 있어요.";

/** 표 `tfoot`의 합계 라벨 */
export const TOTAL_LABEL = "합계";

/**
 * 합계 옆에 붙는 규칙 한 줄.
 *
 * 총 미수는 **양수 잔액만** 더한 값이다(§5 A5). 그 규칙이 화면에 없으면 미수 잔액
 * 열을 손으로 더한 값과 합계가 안 맞아서, 사장이 자기 계산을 의심한다(F5).
 * 선수금 줄이 있을 때만 붙는다.
 */
export const PREPAID_EXCLUDED = "선수금 제외";

/** `이번 주 보낸 입금` 카드의 보조 줄. 서버가 세는 창(오늘 포함 7일)을 글자로 말한다 */
export const PAID_WINDOW_LABEL = "오늘 포함 최근 7일";

/**
 * 원장 `구분` 칸의 한글. **여기 없는 코드는 코드값 그대로 보인다**(`derive.kindLabel`) —
 * 빈칸은 "구분 없음"으로 읽히고, `기타` 같은 대체 표기는 진짜 종류처럼 읽힌다.
 * 주문 내역의 `orderStatusLabel`과 같은 결이다.
 */
export const KIND_LABEL: Readonly<Record<string, string>> = {
  SHIPMENT: "출고",
  PAYMENT: "입금",
};

/**
 * 결제 수단 코드 → 한글. `BANK_TRANSFER`는 주문 스펙(`PaymentTerm`)의 값이고 `TRANSFER`는
 * fixtures 시절 값이다 — 소매 원장의 `PAYMENT` 줄이 dev에 아직 없어 어느 쪽이 올지
 * 미실측이라 둘 다 받는다(#240). 그 밖의 값은 코드값 그대로.
 */
export const METHOD_LABEL: Readonly<Record<string, string>> = {
  CASH: "현금",
  BANK_TRANSFER: "계좌 이체",
  TRANSFER: "계좌 이체",
};

/**
 * 좁은 폭(≤960px)에서 표 대신 세로로 쌓을 때 값 앞에 서는 라벨.
 *
 * 표에서는 머리글이 하던 일(이 숫자가 무엇인지)을 여기서는 이 라벨이 한다.
 * 머리글과 **같은 말**이어야 폭이 바뀌어도 같은 화면으로 읽힌다.
 */
export const CARD_LABEL = {
  balance: "미수 잔액",
  overdue: "연체",
  lastPaid: "마지막 입금",
  bank: "입금 계좌",
  basis: "근거",
  method: "결제 수단",
  delta: "증감",
  ledgerBalance: "잔액",
} as const;
