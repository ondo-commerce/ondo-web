/** 화면 시각은 전부 이 시간대로 읽는다. 서버는 오프셋을 붙인 ISO를 준다 */
export const CHAT_TIME_ZONE = "Asia/Seoul";

/** 방을 열 때 받는 최신 메시지 수, polling 한 번에 이어 받는 수 */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * 열린 방 polling. 도매와 같은 값 — 활성 탭당 분당 20회. 소매 사장도 문의를 남기고 답을 기다리는 동안
 * 이 화면을 열어 둔다(01-plan §4-2 4). 열린 방 하나만 묻는다(방 목록이 없다).
 */
export const ROOM_POLL_MS = 3_000;
/** 실패가 이어지면 3, 6, 12, 24, 30 … 초(흔들림 포함 상한). 서버가 아플 때 모든 탭이 3초마다 두드리지 않게 */
export const ROOM_POLL_BACKOFF_MAX_MS = 30_000;
/** backoff에만 섞는 흔들림(±20%). 탭들이 같은 박자로 다시 몰려오지 않게 */
export const ROOM_POLL_JITTER = 0.2;

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
export const LOGIN_PATH = "/login";

/**
 * 계약 409(같은 키에 다른 본문). 소매 `shared/api/errorCodes.ts`에 없는 채팅 전용 코드라 feature에 둔다
 * (01-plan §5-1). 화면 반응은 500과 같다 — 같은 말풍선의 다시 보내기는 늘 같은 본문이라 정상 흐름에선
 * 오지 않고, 오면 서버와 어긋난 것이라 사장이 지우고 다시 쓰는 수밖에 없다.
 */
export const IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED";

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

/**
 * 채팅 세션이 끊겼을 때(`api/session.ts`). 도매 `SESSION_LOST_TEXT`와 같은 글(D28 원칙).
 * 보낸 뒤 끊긴 경우엔 `로그인하기`를 두지 않는다 — 누르면 입력창의 쓴 글이 사라진다(디자인 결정 16)
 */
export const SESSION_LOST_TEXT =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

/** 첫 조회 401(쓴 글이 없다) — 블록 안 안내 + `로그인하기`, 빨강 없음(디자인 결정 16) */
export const SESSION_FIRST_TEXT = {
  title: "로그인이 끊겼어요",
  detail: "다시 로그인하면 이 대화를 이어서 볼 수 있어요",
  login: "로그인하기",
} as const;

export const COMPOSER_TEXT = {
  label: "메시지",
  placeholderSuffix: "에 보낼 메시지",
  send: "보내기",
  hint: "Enter로 보내기, Shift+Enter로 줄바꿈",
  sessionLost: SESSION_LOST_TEXT,
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

/* ------------------------------------------------------------------------
 * 재고 자동 답(loop-05b S8)
 * ------------------------------------------------------------------------ */

/**
 * 되묻기 칩을 고를 수 있는 시간. 서버 판정의 "직전 유효 되묻기 30분"과 같은 값(§4-2 2) — 화면이 더 오래
 * 켜 두면 서버는 계승하지 않아 고른 칩이 넘김으로 끝난다
 */
export const CLARIFY_WINDOW_MS = 30 * 60_000;

/**
 * 재고 구간 글자(디자인 결정 20). 도매 근거 칸 "소매처에게는 …으로 보였어요"도 같은 표를 쓴다(도매 결정 27) —
 * 앱 사이 import가 금지라 도매 `STOCK_BAND_LABEL`과 같은 값을 따로 적는다. 한쪽을 고치면 다른 쪽도 고친다
 */
export const STOCK_BAND_LABEL = {
  NONE: "재고 없음",
  UNDER_10: "1~9장",
  UNDER_50: "10~49장",
  FIFTY_PLUS: "50장 이상",
} as const;

export const STOCK_TEXT = {
  /** 입력창 위 칩 이름. AC가 이름을 정확히 본다(S8-1) */
  ask: "재고 문의",
  /** 칩이 보내는 본문. 서버는 본문이 아니라 `inquiry`로 판정한다 */
  askBody: "이 상품 몇 장 남았어요?",
  choicesLabel: "색상, 사이즈 고르기",
  /** 고른 칩 뒤 숨긴 글. 색(테두리)만으로 고른 것을 알리지 않는다(결정 23) */
  selectedSr: " (고름)",
  stock: " 재고 ",
  orderable: "지금 주문할 수 있어요",
  notOrderable: "지금은 주문할 수 없어요",
  limitPrefix: "한 번에 최대 ",
  qtyLabelSuffix: " 수량",
  add: "장바구니에 담기",
  adding: "담는 중",
  added: "장바구니에 담았어요",
  viewCart: "장바구니 보기",
  addFailed: "장바구니에 담지 못했어요. 다시 눌러 주세요",
  qtyMin: "1장 이상 넣어 주세요",
  qtyNotNumber: "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)",
} as const;

/** 담기 결과의 `장바구니 보기` */
export const CART_HREF = "/cart";

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
