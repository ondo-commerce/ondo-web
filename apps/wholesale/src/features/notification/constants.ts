/**
 * 헤더 count 주기(Q3). 목표가 "새 주문을 30초 안에 안다"(01-plan §2-3)라 30초다.
 * 활성 탭당 2회/분으로 열린 방 polling(3초)보다 훨씬 작다.
 */
export const HEADER_POLL_MS = 30_000;

/**
 * 연속 실패 뒤 다음 간격. 1번째 실패 뒤 60초, 2번째 120초, 3번째부터 300초(S11-14).
 * BE에 알림 op가 없는 동안 실서버는 계속 404를 준다 — 30초마다 두드리지 않으려고 늘린다.
 */
export const HEADER_BACKOFF_MS = [60_000, 120_000, 300_000] as const;

/** 패널 한 장. 계약 기본값과 같다 */
export const NOTIFICATION_PAGE_SIZE = 20;

/**
 * 열린 패널의 엿보기 한 장(F3). count가 올 때마다 첫 장 맨 위보다 새 행이 있는지만 본다.
 * 화면에 그리지 않으니 한 장(20)까지 받을 필요가 없다 — 이보다 많이 쌓였으면 count 차이가 N을 받친다(`newerBarCount`)
 */
export const NOTIFICATION_PEEK_SIZE = 10;

/** 이 수부터 알약이 "99+"다. 아이콘 폭을 넘지 않게 */
export const BADGE_MAX = 99;

/** 알림 경로(초안 op, #290). 훅 1개 = 엔드포인트 1개 */
export const NOTIFICATION_PATH = {
  list: "/api/wholesale/notifications",
  unreadCount: "/api/wholesale/notifications/unread-count",
  read: "/api/wholesale/notifications/read",
} as const;

/** 주문 탭 진입 인자(01-plan §4-2). 주문 feature가 같은 이름을 읽는다 */
export const ORDER_HREF = (orderId: number) => `/orders?order=${orderId}`;

/** 채팅 받은편지함. 헤더 채팅 링크 */
export const CHAT_HREF = "/chats";

/** 패널 문구. 와이어프레임 `19_wholesale-notifications` 그대로 */
export const PANEL_TEXT = {
  title: "알림",
  listLabel: "알림 목록",
  empty: "새 알림이 없어요",
  emptyHint: "주문이 들어오면 여기에 쌓여요",
  loadFailed: "알림을 불러오지 못했어요",
  retry: "다시 시도",
  more: "더 보기",
  moreLoading: "불러오는 중",
  moreFailed: "더 불러오지 못했어요",
  processing: "처리 중",
  changed: "그 사이 알림이 바뀌었어요. 확인하고 다시 눌러 주세요",
  markFailed: "읽음으로 바꾸지 못했어요. 다시 눌러 주세요",
  unreadPrefix: "안 읽음, ",
} as const;

/** "안 읽은 알림 N개 모두 읽음" */
export const markAllText = (n: number) => `안 읽은 알림 ${n}개 모두 읽음`;

/** "새 알림 N개 보기" */
export const newerText = (n: number) => `새 알림 ${n}개 보기`;
