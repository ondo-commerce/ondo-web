import { HEADER_COUNTS_KEY } from "@/shared/api/headerCountsKey";

/** 알림 목록 캐시 전부(계정 무관). 로그아웃 정리만 쓴다 */
export const NOTIFICATION_KEY_ROOT = ["notification"] as const;

/**
 * 알림 feature의 queryKey 팩토리.
 *
 * count는 `shared`의 키 아래에 둔다 — 채팅 답 보내기도 그 키(앞부분)로 다시 받아야 해서 거기 산다.
 * 목록은 패널이 열려 있을 때만 관찰된다. 열 때마다 지우고 처음부터 받는다(`NotificationBell`).
 *
 * **키에 계정이 들어간다**(loop-08b M1과 같은 이유). QueryClient는 앱 하나라 로그아웃하고 다른 계정으로 들어와도
 * 남는다. 계정이 키에 없으면 B 헤더가 첫 응답 전까지 A의 안 읽은 수와 답 필요 수를 그린다.
 * 로그아웃 때 지우기도 한다(`clearNotificationCache`).
 */
export function notificationKeysFor(account: string) {
  return {
    counts: () => [...HEADER_COUNTS_KEY, account] as const,
    list: () => [...NOTIFICATION_KEY_ROOT, account, "list"] as const,
  };
}

export type NotificationKeys = ReturnType<typeof notificationKeysFor>;
