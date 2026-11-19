/** 패널 한 장. 계약 기본값과 같다 */
export const NOTIFICATION_PAGE_SIZE = 20;

/** 이 수부터 배지가 "99+"다. 아이콘 폭(32)을 넘지 않게. 채팅 링크와 같은 값(앱 안 feature끼리 import 금지라 다시 적는다) */
export const BADGE_MAX = 99;

/** 알림 경로(초안 op, #304). 훅 1개 = 엔드포인트 1개. count는 `shared/api/headerCounts.ts` */
export const NOTIFICATION_PATH = {
  list: "/api/retail/notifications",
  read: "/api/retail/notifications/read",
} as const;

/** 행이 가는 곳(01-plan §4-2 3). 미송 대기 현황은 도매처 칩, 주문은 상세 */
export const BACKORDERS_HREF = (wholesalerId: number) =>
  `/backorders?wholesaler=${wholesalerId}`;
export const ORDER_HREF = (orderId: number) => `/orders/${orderId}`;

/** 패널 문구. 와이어프레임 `20_retail-notifications` 그대로 */
export const PANEL_TEXT = {
  title: "알림",
  listLabel: "알림 목록",
  empty: "새 알림이 없어요",
  emptyHint: "미송 입고일이 바뀌면 여기에 쌓여요",
  loadFailed: "알림을 불러오지 못했어요",
  /* 목록 401(디자인 결정 55). 다시 시도와 로그인 링크를 두지 않는다 — 또 401이고, 링크는 뒤 화면의 쓰던 글을 버린다 */
  sessionLost: "로그인이 끊겼어요",
  sessionLostHint: "다시 로그인하면 알림을 볼 수 있어요",
  retry: "다시 시도",
  more: "더 보기",
  moreLoading: "불러오는 중",
  moreFailed: "더 불러오지 못했어요",
  processing: "처리 중",
  newer: "새 알림 보기",
  changed: "그 사이 알림이 바뀌었어요. 확인하고 다시 눌러 주세요",
  newerFirst: "새 알림이 왔어요. 확인하고 다시 눌러 주세요",
  markFailed: "읽음으로 바꾸지 못했어요. 다시 눌러 주세요",
  markSessionLost: "로그인이 끊겼어요. 다시 로그인한 뒤 눌러 주세요",
  unreadPrefix: "안 읽음, ",
} as const;

/** "안 읽은 알림 N개 모두 읽음" */
export const markAllText = (n: number) => `안 읽은 알림 ${n}개 모두 읽음`;
