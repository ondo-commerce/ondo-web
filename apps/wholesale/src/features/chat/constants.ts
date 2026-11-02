import type { ChatHandoffReason, ChatMessage, StockBand } from "./types";

/** 화면 시각은 전부 이 시간대로 읽는다. 서버는 오프셋을 붙인 ISO를 준다 */
export const CHAT_TIME_ZONE = "Asia/Seoul";

/**
 * "바닥"의 너비(loop-08c §4-2 1). log 아래 끝에서 이만큼 안이면 바닥이다 — 새 메시지를 따라 내려가고 읽음을 보낸다.
 * 말풍선 한 줄(36px)보다 조금 넉넉하게. 0으로 두면 소수점 스크롤 하나로 바닥을 놓친다
 */
export const BOTTOM_SLACK_PX = 48;

/**
 * 위로 스크롤해 log `scrollTop`이 이만큼 이하가 되면 이전 장을 자동으로 부른다(D45, §4-1 2-1).
 * 맨 위에 닿기 전에 요청이 떠나 있어 사장은 대개 "불러오는 중"부터 본다(디자인 결정 89)
 */
export const HISTORY_AUTO_LOAD_PX = 200;

/**
 * 사장 입력(wheel, touchmove, ↑ PageUp Home, 스크롤바 누름) 뒤 이 시간 안에 난 scroll만 사장 스크롤로 본다(리뷰 R1).
 * scroll이 이어지는 동안은 이 시간이 계속 밀린다 — 관성 스크롤, 부드러운 PageUp이 중간에 끊기지 않게.
 * 입력이 멎고 이만큼 지나면 그 뒤 scroll(Tab 포커스 스크롤, 창 크기 변경)은 자동 불러오기 트리거가 아니다(S2-19 ③)
 */
export const USER_SCROLL_WINDOW_MS = 400;

/** 이전 메시지 자리 글(디자인 결정 81~84, 와이어프레임 `_08c.py`) */
export const HISTORY_TEXT = {
  more: "이전 메시지 보기",
  loading: "불러오는 중",
  failed: "이전 메시지를 못 불러왔어요",
  retry: "다시 시도",
  end: "대화 처음이에요",
} as const;

/** 이 앱에서 "상대"(Q3 ①). `새 메시지 N개`의 N은 이 sender의 말만 센다. 소매 앱은 WHOLESALER다(08d) */
export const COUNTERPART_SENDER = "RETAILER" satisfies ChatMessage["sender"];

/** `새 메시지 N개` 버튼 글(§4-2 3, 디자인 결정 88). 보이는 글로 이름이 시작한다 — 음성 명령도 맞게 */
export const NEW_MESSAGE_TEXT = {
  countPrefix: "새 메시지 ",
  countSuffix: "개",
  jump: "아래로 이동",
} as const;

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
/** 실패가 이어지면 3, 6, 12, 24, 30 … 초(흔들림 포함 상한, 기획 §4-1). 서버가 아플 때 모든 탭이 3초마다 두드리지 않게 */
export const ROOM_POLL_BACKOFF_MAX_MS = 30_000;
/** backoff에만 섞는 흔들림(±20%). 탭들이 같은 박자로 다시 몰려오지 않게 */
export const ROOM_POLL_JITTER = 0.2;

/** 목록 행 안 읽은 수 상한. 넘으면 `99+` */
export const UNREAD_MAX_SHOWN = 99;

/**
 * 목록 필터 칩(loop-08b S4, 디자인 결정 53). `ALL`은 화면 값이고 서버엔 안 보낸다(조건 없음).
 * 순서가 칩 순서다
 */
export const ROOM_LIST_FILTERS = ["ALL", "UNREAD", "NEEDS_REPLY"] as const;
export const ROOM_LIST_FILTER_LABEL = {
  ALL: "전체",
  UNREAD: "안 읽음",
  NEEDS_REPLY: "답 필요",
} as const;
/** 소매처 검색 글자 상한. 계약 `q` maxLength와 같다(앞뒤 공백 지운 뒤, 코드 포인트) */
export const ROOM_QUERY_MAX = 50;
/** 마지막 입력 뒤 이만큼 조용하면 묻는다. 한글 조합 중엔 세지 않는다(§4-2 2) */
export const ROOM_SEARCH_DEBOUNCE_MS = 300;

/** 목록 텍스트 */
export const LIST_TEXT = {
  title: "채팅",
  label: "대화 목록",
  emptyTitle: "아직 받은 문의가 없어요",
  emptyDetail: "소매처가 상품 화면에서 문의하면 여기에 쌓여요",
  needsReply: "답 필요",
  moreFailed: "더 불러오지 못했어요",
  retry: "다시 시도",
  /** 검색칸 이름이자 안내 글(와이어프레임 `_PH`) */
  search: "소매처 이름 검색",
  filterGroup: "대화 필터",
  /** 조건을 바꾸는 동안 제목 옆(디자인 결정 55) */
  busy: "찾는 중",
  /** 조건 결과 0(디자인 결정 56). 내 방 0은 위 `emptyTitle` */
  noMatch: "조건에 맞는 대화가 없어요",
  clearConditions: "조건 지우기",
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
  /** 되묻기 보기 줄 머리(#296 S13-1) */
  choicesPrefix: "보기: ",
  /** 미송 보기 목록 머리 이름표(#299 디자인 결정 38). 한 보기 한 줄이라 쌍점이 없다 */
  choicesLabel: "보기",
  /** 게시가 내려간 보기 뒤에 붙는 글자. 와이어프레임 `#state-clarify` 그대로 띄어 쓰지 않는다 */
  choiceNotOrderable: "(주문 불가)",
  /** 근거 칸 끝 조회 시각 뒤 글자(`14:20 조회`, `10/28 14:20 조회`) */
  checkedSuffix: " 조회",
  /**
   * 상대 읽음(loop-08 S3, 디자인 결정 47). 뜻은 "소매 사업체에서 누군가 여기까지 열어 봤다" — 특정 사람이 아니다.
   * 보이는 글자는 시각 줄 안(aria-hidden), 낭독은 말풍선 끝 숨긴 글(`readSr`)
   */
  read: "읽음",
  readSr: ", 읽음",
} as const;

/**
 * 읽음 표시가 붙을 수 있는 내 쪽 메시지(기획 §4-3 2). 사장이 보낸 글과 사장 이름으로 나간 자동 답, 되묻기.
 * 넘김 줄(SYSTEM)은 소매에게 보이는 말이 아니라 뺀다. 서버가 kind를 늘리면 여기 없는 값은 안 붙는다
 */
export const READ_MARK_KINDS: ReadonlySet<string> = new Set([
  "TEXT",
  "AUTO_REPLY",
  "CLARIFY",
]);

/**
 * 넘김 줄 아래 이유 한 줄(#302 S3-1, 기획 §4-3 4, 디자인 결정 39). loop-07 8개에 loop-08d S6(#353)이 13개를 더해
 * 계약 enum 21값 전부 글이 있다.
 *
 * `satisfies Record<…>`는 enum 값 하나라도 빠지면 컴파일을 깨려는 것이다. 그런데 변수 타입은 `Partial` 그대로 둔다 —
 * 서버 enum은 FE 배포보다 먼저 늘어나서(가이드 §9) 그리는 쪽은 "표에 없을 수 있다"를 전제로 조회해야 한다.
 * 표에 없는 값과 `handoff` 없음은 이유 줄을 그리지 않는다(결정 42). "알 수 없음" 같은 대체 글자는 사장에게 할 일을
 * 주지 않는다.
 *
 * PAYMENT_REPORT의 "정산 탭"은 글자다(결정 40). 시스템 줄 안에 버튼을 두면 누르면 넘김이 닫히는 것처럼 읽힌다.
 * CLARIFY_AGAIN은 재고 옵션 되묻기와 미송 되묻기 둘 다에서 나서 어느 쪽에도 맞는 말로 둔다(08d Codex 18, D47 Q1 ①).
 */
export const HANDOFF_REASON_TEXT: Readonly<
  Partial<Record<ChatHandoffReason, string>>
> = {
  OFF: "자동 답변이 꺼져 있어요",
  NEGOTIATION: "가격, 외상, 교환, 반품 이야기예요",
  MULTI_INTENT: "한 번에 두 가지를 물었어요",
  NO_INTENT: "무엇을 묻는지 읽지 못했어요",
  NOT_SUPPORTED: "자동 답변이 없는 질문이에요",
  NO_CONTEXT: "어느 상품을 묻는지 몰라요",
  NO_OPTIONS: "게시된 옵션이 없는 상품이에요",
  INVALID_TARGET: "다른 도매처 상품이거나 없는 상품이에요",
  CLARIFY_AGAIN: "다시 물었지만 무엇을 묻는지 확인하지 못했어요",
  NOT_LISTED: "목록에 없는 다른 주문이라고 했어요",
  NO_BACKORDER: "열린 미송이 없는 소매처예요",
  NO_MATCH: "말한 미송을 찾지 못했어요",
  STOCK_ZERO: "재고가 없다고 답했어요. 입고 계획을 알려 주세요",
  ETA_UNKNOWN: "입고 예정일이 정해지지 않았다고 답했어요",
  ETA_PAST: "등록된 입고 예정일이 지났다고 답했어요",
  PAYMENT_REPORT: "입금했다는 말이에요. 정산 탭에서 입금을 확인해 주세요",
  PERIOD: "기간을 정해 물었어요. 기간별 금액은 자동으로 답하지 않아요",
  NO_RELATION: "정산 기록이 없는 소매처예요",
  AMOUNT_UNSURE: "잔액과 연체 내역 확인이 필요해요",
  LOOKUP_FAILED: "정산 조회에 실패했어요",
  HUMAN_REQUEST: "사장님과 직접 이야기하고 싶어 해요",
} satisfies Record<ChatHandoffReason, string>;

/**
 * 채팅 세션이 끊겼을 때(`api/session.ts`). 상품 폼 `SESSION_LOST_MESSAGE`와 같은 꼴("저장" → "보낼").
 * 로그인 링크는 아직 없다(#252와 같다)
 */
export const SESSION_LOST_TEXT =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

export const COMPOSER_TEXT = {
  label: "메시지",
  placeholderSuffix: "에 보낼 메시지",
  send: "보내기",
  hint: "Enter로 보내기, Shift+Enter로 줄바꿈",
  /** 목록, 방 패널과 같은 글(`SESSION_LOST_TEXT`) */
  sessionLost: SESSION_LOST_TEXT,
  /** 오류가 아니라 안내라 빨강을 쓰지 않는다(디자인 결정 12) */
  photo: "사진은 아직 보낼 수 없어요",
} as const;

/**
 * 글자 수 상한. 서버와 같은 셈(앞뒤 공백을 뺀 유니코드 코드 포인트, `[...text].length`) — JS `length`는
 * UTF-16이라 이모지 하나를 2로 센다.
 */
export const BODY_MAX = 1000;
/** 이 글자 수부터 오른쪽에 `N/1,000`을 띄운다. 평소엔 그 자리에 키 안내 */
export const BODY_COUNTER_FROM = 900;

/**
 * 방별 입력 기억 키 머리(loop-08b §4-1 1). 뒤에 `{이메일 소문자}:{roomId}`가 붙는다(`draftKey`).
 * `v1`은 값 모양(글 그대로)이 바뀌면 올린다 — 옛 모양 값을 새 코드가 글로 읽지 않게.
 * 로그아웃이 이 머리로 시작하는 키를 전부 지운다(Q2, `draftStore.clear`).
 */
export const DRAFT_KEY_PREFIX = "ondo.chat.draft.v1:";
/** 글이 바뀐 뒤 이만큼 조용하면 저장한다. 방을 옮기거나 떠나는 순간은 기다리지 않는다(`useRoomDraft`) */
export const DRAFT_SAVE_DELAY_MS = 300;

/** 보낸 말풍선 상태 글 */
export const PENDING_TEXT = {
  sending: "보내는 중",
  failed: "못 보냈어요",
  offline: "연결이 끊겨 못 보냈어요",
  retry: "다시 보내기",
  remove: "지우기",
  srSending: "보내는 중",
  srFailed: "보내지 못함",
} as const;

/**
 * 재고 구간. 소매처 화면에는 정확 수량 대신 이 말이 간다(계약 `ChatRetailFacts`).
 * 도매 화면은 정확 수량과 같이 "소매처가 무엇을 봤는지"를 보여 준다 — 그래서 소매 카드 글자 표
 * (`apps/retail` chat `constants.ts`)와 **같은 글자**여야 한다(디자인 결정 20, 27). 앱끼리 import 할 수 없어
 * 두 벌이다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
 */
export const STOCK_BAND_LABEL: Record<StockBand, string> = {
  NONE: "재고 없음",
  UNDER_10: "1~9장",
  UNDER_50: "10~49장",
  FIFTY_PLUS: "50장 이상",
};

/** 목록 머리 자동 답변 스위치(S9, 디자인 결정 22~25) */
export const AUTO_REPLY_TEXT = {
  /** 스위치 이름이자 보이는 글자. 이름은 스위치 하나만 낭독한다 */
  label: "자동 답변",
  saving: "저장 중",
  off: "자동 답변이 꺼져 있어요. 소매 문의는 사장님께 바로 전달돼요",
  failed: "설정을 바꾸지 못했어요. 다시 눌러 주세요",
} as const;

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
