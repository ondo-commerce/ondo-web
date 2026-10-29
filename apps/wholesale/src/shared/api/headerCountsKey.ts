import type { QueryClient } from "@tanstack/react-query";

/**
 * 헤더 배지 둘(종 = 안 읽은 알림, 채팅 = 답 필요 방)이 같이 쓰는 count 쿼리 키(#295 S11).
 *
 * 왜 `shared`인가: 쿼리를 들고 있는 건 `features/notification`인데, 도매 답 보내기(`features/chat`)도
 * 성공한 순간 이 숫자를 다시 받아야 한다(S11-15, 30초를 기다리면 답한 방이 계속 `답 필요`로 남는다).
 * feature끼리는 import할 수 없어서 키와 "다시 받기"만 여기로 내린다. 응답 모양은 여기서 모른다.
 */
export const HEADER_COUNTS_KEY = ["header-counts"] as const;

/**
 * 진행 중인 count를 **취소한 뒤** 다시 받는다(01-plan §4-1 3, 응답 역전 S11-12).
 *
 * 취소가 먼저인 이유: read나 답 보내기 전에 떠난 count는 그 전 숫자를 들고 온다. 그게 나중에 도착하면
 * 방금 줄어든 배지를 되살린다. 취소된 요청의 응답은 TanStack이 버린다(retryer가 이미 끝나 있다).
 * `beforeRefetch`는 그 사이에 캐시를 고칠 자리다 — read 응답의 남은 수를 먼저 넣는다.
 *
 * 401로 멈춘 count(`enabled` false)는 `invalidateQueries`가 다시 부르지 않는다.
 */
export async function refreshHeaderCounts(
  queryClient: QueryClient,
  beforeRefetch?: () => void,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: HEADER_COUNTS_KEY });
  beforeRefetch?.();
  await queryClient.invalidateQueries({ queryKey: HEADER_COUNTS_KEY });
}
