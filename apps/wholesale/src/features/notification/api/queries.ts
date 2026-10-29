"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiFetchBody, isApiError } from "@ondo/api";
import { notificationKeys } from "./keys";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_PATH } from "../constants";
import { failedCounts, headerPollDelayMs } from "../derive";
import type {
  HeaderCounts,
  NotificationPage,
  NotificationUnreadCount,
} from "../types";

/*
 * 헤더는 어느 화면에나 떠 있다. 그래서 여기 요청은 **화면을 망가뜨리지 않는 것**이 먼저다.
 *  - 401이어도 `/login`으로 보내지 않는다(S11-13). 본문 화면이 세션을 처리한다 — `/chats`에서 쓰던 답이
 *    헤더 polling 하나 때문에 날아가면 안 된다(loop-04 F1)
 *  - 실패해도 셸은 throw하지 않는다(S11-14, retail-wire-cart F3)
 *  - `retry: false` — 앱 기본(5xx 두 번 더)이면 실패 한 번이 요청 세 번이 되고 간격 규칙이 깨진다
 *  - `signal`을 넘기지 않는다(채팅 쿼리와 같은 이유). 취소는 응답을 버리는 것으로 충분하다
 */

/** count 1회. 던지지 않는다 — 실패도 값으로 돌려준다(`HeaderCounts` 주석) */
async function fetchHeaderCounts(
  queryClient: QueryClient,
): Promise<HeaderCounts> {
  try {
    const counts = await apiFetch<NotificationUnreadCount>(
      NOTIFICATION_PATH.unreadCount,
    );
    return { kind: "ok", ...counts };
  } catch (error) {
    if (isApiError(error) && error.status === 401)
      return { kind: "unauthorized" };
    return failedCounts(
      queryClient.getQueryData<HeaderCounts>(notificationKeys.counts()),
    );
  }
}

/**
 * 헤더 count(S11-1). 셸에 하나. 30초마다, 실패하면 60 → 120 → 300초, 401이면 멈춘다.
 * 탭이 숨으면 묻지 않고(`refetchIntervalInBackground: false`), 다시 보이면 즉시 1회(`"always"`).
 * 대시보드 갱신과 따로 돈다.
 *
 * 401 뒤엔 `enabled`가 꺼진다 — 탭 복귀나 read 뒤 다시 받기도 요청을 내지 않는다.
 */
export function useHeaderCountsQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: notificationKeys.counts(),
    queryFn: () => fetchHeaderCounts(queryClient),
    enabled: (query) => query.state.data?.kind !== "unauthorized",
    refetchInterval: (query) => headerPollDelayMs(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

/**
 * 패널 목록의 401은 세션 끊김으로 올리지 않는다. 전역 QueryCache가 `ApiError` 401을 보면 `/login`으로 보내는데,
 * 패널 실패는 패널 안 "알림을 불러오지 못했어요"면 된다. 그래서 401만 다른 값으로 바꿔 던진다.
 */
async function headerSafe<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isApiError(error) && error.status === 401)
      throw new Error("헤더 알림 목록 401");
    throw error;
  }
}

/**
 * 패널 목록(S11-4). 패널이 열린 동안만 관찰된다. **열린 동안 저절로 다시 받지 않는다**(S11-10) —
 * 간격 없음, 창 복귀 재조회 없음, `staleTime` 무한. 스크롤과 행이 움직이지 않게 하려는 것이다.
 * 새 것은 "새 알림 N개 보기"를 눌러서만 받는다.
 *
 * Suspense를 쓰지 않는다. 패널 안 세 상태(막대, 빈 상태, 실패)와 `더 보기` 실패 한 줄이 같은 표면 안에 있어서
 * 경계로 쪼개면 머리 줄(제목, `모두 읽음`)까지 같이 사라진다(디자인 결정 35 "머리 줄은 셋 다 그린다").
 */
export function useNotificationListQuery() {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) =>
      headerSafe(() =>
        apiFetchBody<NotificationPage>(NOTIFICATION_PATH.list, {
          searchParams: {
            size: NOTIFICATION_PAGE_SIZE,
            cursor: pageParam ?? undefined,
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
