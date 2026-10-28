/** 화면 시각은 전부 이 시간대로 읽는다. 서버는 오프셋을 붙인 ISO를 준다 */
export const CHAT_TIME_ZONE = "Asia/Seoul";

/** 방을 열 때 받는 최신 메시지 수, polling 한 번에 이어 받는 수 */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * 주소의 `?from=`으로 받는 돌아갈 곳. 이 둘만 받는다 — 외부 주소(`https://…`, `//…`)를 링크로
 * 그리면 다른 사이트로 보내는 통로가 된다(01-plan §4-2 2).
 */
export const RETURN_PATH_PATTERN = {
  product: /^\/products\/\d+$/,
  wholesaler: /^\/wholesalers\/\d+$/,
} as const;

/**
 * 승인 대기 화면. `shared/api/server.ts`의 `APPROVAL_PATH`와 같은 값 — 그 파일은 `server-only`라
 * 클라이언트 컴포넌트가 읽을 수 없어 다시 적는다
 */
export const APPROVAL_PATH = "/approval";

/** 입구(문의하기) 텍스트 */
export const ENTRY_TEXT = {
  open: "문의하기",
  opening: "여는 중",
  failed: "대화방을 열지 못했어요. 다시 눌러 주세요",
  notFound: "이 도매처와는 대화할 수 없어요",
} as const;

/** 방 텍스트. 소매 사장 시점이다 — 도매의 "소매처가 문의하면"을 뒤집었다(§4-5 표) */
export const ROOM_TEXT = {
  logLabel: "대화",
  /** 방 블록 이름 `무드온 대화` */
  regionSuffix: " 대화",
  me: "나",
  /** 사람 넘김 줄의 숨긴 발신자. 와이어프레임 `안내, 11:02:` */
  system: "안내",
  autoReply: "자동 답변",
  /** 숨긴 발신자 `무드온 자동 답변` — 사람이 쓴 답과 낭독으로도 가른다 */
  autoReplySuffix: " 자동 답변",
  /** checkedAt 뒤에 붙는다 — `10:22 조회` */
  checkedSuffix: " 조회",
  /** 응답 시간을 약속하지 않는다(2026-09-10) */
  empty: "궁금한 걸 남겨 주세요. 사장님이 보고 답해요",
  /** 서버 HANDOFF body는 도매에게 하는 말이라 쓰지 않는다(디자인 결정 8) */
  handoff: "사장님께 전달했어요",
  notFound: "대화를 찾을 수 없어요",
  home: "홈으로",
  loadFailed: "대화를 불러오지 못했어요",
  loadFailedDetail: "잠시 뒤 다시 시도해 주세요.",
  retry: "다시 시도",
  loading: "불러오는 중",
  backToProduct: "상품으로 돌아가기",
  wholesalerHome: "도매처 홈",
} as const;

export const COMPOSER_TEXT = {
  label: "메시지",
  placeholderSuffix: "에 보낼 메시지",
  send: "보내기",
  hint: "Enter로 보내기, Shift+Enter로 줄바꿈",
  /** 오류가 아니라 안내라 빨강을 쓰지 않는다(도매 디자인 결정 12) */
  photo: "사진은 아직 보낼 수 없어요",
} as const;

/**
 * 글자 수 상한. 서버와 같은 셈(앞뒤 공백을 뺀 유니코드 코드 포인트, `[...text].length`) — JS `length`는
 * UTF-16이라 이모지 하나를 2로 센다.
 */
export const BODY_MAX = 1000;
/** 이 글자 수부터 오른쪽에 `N/1,000`을 띄운다. 평소엔 그 자리에 키 안내 */
export const BODY_COUNTER_FROM = 900;

/** 보낸 말풍선 상태 글 */
export const PENDING_TEXT = {
  sending: "보내는 중",
  failed: "못 보냈어요",
  offline: "연결이 끊겨 못 보냈어요",
  retry: "다시 보내기",
  remove: "지우기",
  srFailed: "보내지 못함",
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
