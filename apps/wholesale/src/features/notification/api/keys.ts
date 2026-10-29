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
  /**
   * 열린 패널의 엿보기(F3). `list()` 아래에 두지 않는다 — 패널 열기의 `removeQueries(list)`, 첫 장 다시 받기의
   * `refetchQueries(list)`, 읽음의 `cancelQueries(list)`가 엿보기까지 건드리면 요청이 하나씩 더 나간다
   */
  peek: (since: string, countsAt: number) =>
    [...notificationKeys.all, "peek", since, countsAt] as const,
};
