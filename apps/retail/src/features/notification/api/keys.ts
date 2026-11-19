import { NOTIFICATION_KEY_ROOT } from "@/shared/api/headerCounts";

/**
 * 알림 feature의 queryKey 팩토리. 뿌리는 `shared`에 있다 — 로그인, 로그아웃(`features/account`)이 세션을 바꿀 때
 * 이 캐시를 같이 버려야 하는데 feature끼리는 import할 수 없다(`clearHeaderSession`).
 * count는 `shared/api/headerCounts.ts`의 `HEADER_COUNTS_KEY` 하나를 채팅 링크와 같이 쓴다.
 * 목록은 패널이 열려 있을 때만 관찰된다. 열 때마다 지우고 처음부터 받는다(`NotificationBell`).
 */
export const notificationKeys = {
  all: NOTIFICATION_KEY_ROOT,
  list: () => [...NOTIFICATION_KEY_ROOT, "list"] as const,
};
