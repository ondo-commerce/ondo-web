import type { ReceiveBy, TodoTileKey } from "./types";

/** 라우트 `metadata.title`과 같은 글자. 신규 주문 배지를 뗄 때 이 값으로 되돌린다 */
export const DASHBOARD_TITLE = "대시보드 · 온도 ERP";

/**
 * 재조회 주기. 신규 주문을 몇 분 안에 알아채면 되는 화면이라 30초면 충분하고,
 * SSE·WebSocket을 요청하지 않은 근거이기도 하다. 도매처당 30초에 1회가 서버에 더 간다.
 */
export const REFRESH_INTERVAL_MS = 30_000;

/**
 * 영업일 경계 — KST 낮 12시. 동대문 도매는 저녁에 열어 새벽에 닫아서 자정으로 자르면
 * 하룻밤 주문이 이틀로 갈린다. 서버 `today`가 이미 이 경계로 집계하고, 화면은 표시용 날짜와
 * "입고일 지남" 판정에만 같은 경계를 쓴다.
 */
export const BUSINESS_DAY_START_HOUR = 12;

/** 큐 한 번에 받는 상한 = 서버 상한(`size > 100`이면 400). 넘치면 패널이 스크롤한다 */
export const QUEUE_PAGE_SIZE = 100;
/** 주의 목록의 재료. 오래된 순 한 페이지를 받아 안에서 고른다 — 상한도 서버 상한 */
export const ATTENTION_FETCH_SIZE = 100;
/** 서버 정렬 키. 가장 오래 기다린 SKU가 앞에 오게 */
export const ATTENTION_SORT = "latestBackorderedAt,asc";
/** 큐 정렬 키. 오래된 순 — 이 정렬 하나가 우선순위 표시의 전부다 */
export const QUEUE_SORT = "orderedAt,asc";
/** 입고일 지난 미송 중 보여 줄 수 */
export const OVERDUE_TOP = 3;
/** 입고일 안 적은 미송 중 보여 줄 수 */
export const NO_DATE_TOP = 2;

/**
 * 타일·링크가 가는 탭. 탭의 필터는 URL이 아니라 화면 state라(각 뷰의 useState)
 * 필터까지 맞춰 보낼 수 없다 — 탭 루트로만 보낸다.
 */
export const TAB_HREF = {
  orders: "/orders",
  shipments: "/shipments",
  backorders: "/backorders",
  chats: "/chats",
} as const;

/** 수령 방식 라벨. 타일 둘째 줄에 `사입삼촌 방문 2 · 직접 1`로 붙는다 */
export const RECEIVE_BY_LABEL: Record<ReceiveBy, string> = {
  AGENT: "사입삼촌 방문",
  RETAILER: "직접",
};

/** 타일 둘째 줄의 순서. 사입삼촌이 먼저 — 방문 시간이 정해져 있어 먼저 챙길 쪽이다 */
export const RECEIVE_BY_ORDER: readonly ReceiveBy[] = ["AGENT", "RETAILER"];

export const TILE_TITLE: Record<TodoTileKey, string> = {
  newOrders: "확정 기다리는 주문",
  packing: "포장 대기",
  outbound: "출고 확정 안 한 봉투",
  backorder: "미송",
};

export const TILE_UNIT: Record<TodoTileKey, string> = {
  newOrders: "건",
  packing: "소매처",
  outbound: "봉투",
  backorder: "SKU",
};

export const TILE_LINK_LABEL: Record<TodoTileKey, string> = {
  newOrders: "주문 탭 →",
  packing: "출고 탭 →",
  outbound: "출고 탭 →",
  backorder: "미송 탭 →",
};

export const TILE_HREF: Record<TodoTileKey, string> = {
  newOrders: TAB_HREF.orders,
  packing: TAB_HREF.shipments,
  outbound: TAB_HREF.shipments,
  backorder: TAB_HREF.backorders,
};

/** 타일 둘째 줄 문구 조각. 숫자를 끼우는 건 derive가 한다 */
export const TILE_TEXT = {
  noNewOrders: "확정 대기 없음",
  oldestPrefix: "가장 오래",
  oldestSuffix: "대기",
  stalePrefix: "이번 영업일 전에 포장한 것",
  overdue: "입고일 지남",
  noDate: "미등록",
  onTrack: "정상",
} as const;

export const QUEUE_TEXT = {
  title: "확정 기다리는 주문",
  sub: "오래된 순",
  seeAll: "주문 탭에서 전부 보기 →",
  empty: "확정 기다리는 주문이 없어요",
  view: "주문 보기",
  cancelledPrefix: "오늘 취소",
  columns: {
    waiting: "대기",
    retailer: "소매처",
    product: "대표 품목",
    amount: "금액",
    receivedAt: "접수",
  },
} as const;

export const TODAY_TEXT = {
  title: "오늘",
  refresh: "30초마다 갱신",
  lastPrefix: "마지막",
  orders: "주문",
  shipped: "출고",
  cancelled: "취소",
} as const;

/**
 * 문의 카드(loop-08 S2, 와이어프레임 21 `#state-inquiry-default`). 칸 이름은 기획 §4-2 2 글자 그대로다 —
 * 보고서에 옮겨 적는 숫자라 화면 글자와 보고서 글자가 같아야 한다.
 */
export const INQUIRY_TEXT = {
  title: "문의",
  openChats: "채팅 열기",
  totalPrefix: "오늘 소매 메시지",
  totalUnit: "건",
  outcome: {
    autoReplied: "자동 답",
    autoRepliedWithHandoff: "답+확인",
    handedOff: "넘김",
    clarified: "되묻기",
    noResult: "결과 없음",
  },
  ratePrefix: "자동으로 끝남",
  judged: "판정",
  /** 4줄 앞말. 이게 없으면 합이 12가 아니라 8인 줄을 소매 메시지 수로 읽는다(디자인 결정 51) */
  intentPrefix: "판정한 것 중",
  intent: {
    STOCK: "재고",
    BACKORDER: "미송",
    RECEIVABLE: "미수",
    OTHER: "기타",
    UNCLASSIFIED: "미분류",
  },
  basis: "소매 메시지 1개 = 1건, 영업일 낮 12시 경계",
  basisSuffix: "기준",
  errorTitle: "문의 숫자를 불러오지 못했어요",
  errorDetail: "잠시 뒤 다시 시도해 주세요.",
} as const;

/** 4줄 순서. 기획 §4-2 2 그대로 — 재고, 미송, 미수가 자동 답이 있는 의도라 앞이다 */
export const INQUIRY_INTENT_ORDER = [
  "STOCK",
  "BACKORDER",
  "RECEIVABLE",
  "OTHER",
  "UNCLASSIFIED",
] as const;

/** 2줄 순서. 결과 우선순위(자동 답 > 넘김 > 되묻기 > 결과 없음, 기획 §4-1 2)와 같다 */
export const INQUIRY_OUTCOME_ORDER = [
  "autoReplied",
  "autoRepliedWithHandoff",
  "handedOff",
  "clarified",
  "noResult",
] as const;

/** 비율을 못 내는 자리(판정 0). 0%로 쓰면 "자동 답이 하나도 안 됐다"로 읽힌다 */
export const RATE_UNKNOWN = "-";

export const ATTENTION_TEXT = {
  title: "주의",
  overdueTitle: "미송 입고일 지남",
  noDateTitle: "입고일 안 적은 미송",
  overdueEmpty: "입고일이 지난 미송이 없어요",
  noDateEmpty: "입고일을 안 적은 미송이 없어요",
  link: "미송 탭 →",
} as const;

/** 서버 `now`를 못 받았을 때의 큐 경과 표기. 시계 없이 "N분"을 지어내지 않는다 */
export const ELAPSED_UNKNOWN = "-";
