import { HEADER_COUNTS_KEY } from "@/shared/api/headerCountsKey";

/**
 * 알림 feature의 queryKey 팩토리.
 *
 * count는 `shared`의 키를 그대로 쓴다 — 채팅 답 보내기도 그 키를 다시 받아야 해서 거기 산다.
 * 목록은 패널이 열려 있을 때만 관찰된다. 열 때마다 지우고 처음부터 받는다(`NotificationBell`).
 */
export const notificationKeys = {
  all: ["notification"] as const,
  counts: () => HEADER_COUNTS_KEY,
  list: () => [...notificationKeys.all, "list"] as const,
};
