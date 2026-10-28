import type { StockBand } from "./types";

/** 화면 시각은 전부 이 시간대로 읽는다. 서버는 오프셋을 붙인 ISO를 준다 */
export const CHAT_TIME_ZONE = "Asia/Seoul";

/** 목록 한 페이지. 서버 기본값과 같다 */
export const ROOM_PAGE_SIZE = 30;
/** 방을 열 때 받는 최신 메시지 수, polling 한 번에 이어 받는 수 */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * 목록 재조회 주기. 열린 방이 아닌 곳의 새 문의를 알아채는 용도라 방보다 느슨하다.
 * 열린 방은 자기 polling이 새 메시지를 받을 때 목록을 따로 비운다.
 */
export const ROOM_LIST_POLL_MS = 15_000;

/**
 * 열린 방 polling. 활성 탭당 분당 20회 — SSE/WebSocket 없이 대화가 "바로 뜨는" 것처럼 보이는 하한.
 * 열린 방 하나만 묻는다(Codex plan r1 10).
 */
export const ROOM_POLL_MS = 3_000;
/** 실패가 이어지면 3, 6, 12, 24 … 초. 서버가 아플 때 모든 탭이 3초마다 두드리지 않게 */
export const ROOM_POLL_BACKOFF_MAX_MS = 60_000;
/** backoff에만 섞는 흔들림(±20%). 탭들이 같은 박자로 다시 몰려오지 않게 */
export const ROOM_POLL_JITTER = 0.2;

/** 목록 행 안 읽은 수 상한. 넘으면 `99+` */
export const UNREAD_MAX_SHOWN = 99;

/** 목록 텍스트 */
export const LIST_TEXT = {
  title: "채팅",
  label: "대화 목록",
  emptyTitle: "아직 받은 문의가 없어요",
  emptyDetail: "소매처가 상품 화면에서 문의하면 여기에 쌓여요",
  needsReply: "답 필요",
  moreFailed: "더 불러오지 못했어요",
  retry: "다시 시도",
} as const;

export const ROOM_TEXT = {
  pick: "왼쪽 목록에서 대화를 고르세요",
  notFound: "대화를 찾을 수 없어요",
  empty: "아직 대화가 없어요",
  logLabel: "대화",
  me: "나",
  system: "시스템",
  autoReply: "자동 답변",
  clarify: "되묻기",
} as const;

export const COMPOSER_TEXT = {
  label: "메시지",
  placeholderSuffix: "에 보낼 메시지",
  send: "보내기",
  hint: "Enter로 보내기, Shift+Enter로 줄바꿈",
} as const;

/**
 * 재고 구간. 소매처 화면에는 정확 수량 대신 이 말이 간다(계약 `ChatRetailFacts`).
 * 도매 화면은 정확 수량과 같이 "소매처가 무엇을 봤는지"를 보여 준다.
 */
export const STOCK_BAND_LABEL: Record<StockBand, string> = {
  NONE: "재고 없음",
  UNDER_10: "10장 미만",
  UNDER_50: "50장 미만",
  FIFTY_PLUS: "50장 이상",
};

/** 요일. `Intl`의 `weekday: "short"`는 `(화)`가 아니라 `화`라 괄호는 derive가 붙인다 */
export const WEEKDAY_LABEL = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
] as const;
