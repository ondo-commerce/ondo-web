"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetchBody } from "@ondo/api";
import { notificationKeys } from "./keys";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_PATH } from "../constants";
import type { FetchedNotificationPage, NotificationPage } from "../types";
import { countsIssued, SESSION_LOSS_INLINE } from "@/shared/api/headerCounts";
import { mockReady } from "@/shared/api/mockReady";

/**
 * 패널 목록(S2-4). 패널이 열린 동안만 관찰된다. **열린 동안 저절로 다시 받지 않는다**(D36⑤, S2-7) —
 * 간격 없음, 창 복귀 재조회 없음, `staleTime` 무한. 스크롤과 행이 움직이지 않게 하려는 것이다.
 * 새 것은 "새 알림 보기"를 눌러서만 받는다.
 *
 * 401은 `/login`으로 보내지 않는다(`SESSION_LOSS_INLINE`, §4-1 3 ②) — 패널 안 "로그인이 끊겼어요"로 알린다.
 * ApiError 그대로 던져서 패널이 401과 그 밖을 가른다(도매는 401을 다른 오류로 바꿔 던진다. 소매는 meta로 건너뛴다).
 *
 * 목 모드면 worker 준비를 먼저 기다린다 — 안 기다리면 프록시를 지나 가짜 API로 샌다(S2-10).
 * Suspense를 쓰지 않는다. 머리 줄(제목, `모두 읽음`)은 목록 상태와 상관없이 늘 그린다(도매 결정 35).
 */
export function useNotificationListQuery() {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: async ({ pageParam }): Promise<FetchedNotificationPage> => {
      await mockReady();
      /* 보내기 직전에 적는다. 이 장보다 먼저 떠난 count는 새 알림 판단에서 빠진다(`hasNewer`) */
      const issued = countsIssued();
      const page = await apiFetchBody<NotificationPage>(
        NOTIFICATION_PATH.list,
        {
          searchParams: {
            size: NOTIFICATION_PAGE_SIZE,
            cursor: pageParam ?? undefined,
          },
        },
      );
      return { ...page, countsIssued: issued };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    meta: SESSION_LOSS_INLINE,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
