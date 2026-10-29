"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { useEffect } from "react";
import { chatKeys } from "./keys";
import { chatMockReady } from "./mockWorker";
import { failedCounts, headerPollDelayMs, isStaleCount } from "../derive";
import type { HeaderCounts, RetailUnreadCount } from "../types";

/** 헤더 배지 둘(초안 op `notificationUnreadCount`, #298). 알림 종은 06b라 이번엔 `chats`만 쓴다 */
export const UNREAD_COUNT_PATH = "/api/retail/notifications/unread-count";

/*
 * 헤더는 셸 14화면 어디에나 떠 있다. 그래서 여기 요청은 **화면을 망가뜨리지 않는 것**이 먼저다.
 *  - 401, 403이어도 `/login`, `/approval`로 보내지 않는다. 소매 전역 QueryCache는 meta를 보지 않고 `UNAUTHORIZED`
 *    ApiError면 무조건 이동한다(`providers.tsx`) — 그래서 queryFn이 **던지지 않고** 값으로 돌려준다
 *  - `guardSession`을 쓰지 않는다. 방의 세션 잠금(`chatKeys.session()`)을 건드리면 그 뒤 연 방이 끊김 상태로
 *    시작한다. 방은 자기 요청 결과로 판단한다(§4-1 3)
 *  - 실패해도 셸은 throw하지 않는다(retail-wire-cart F3)
 *  - `retry: false` — 앱 기본(5xx 두 번 더)이면 실패 한 번이 요청 세 번이 되고 간격 규칙이 깨진다
 */

/**
 * count 시작 순번과 읽음 울타리(S2-6 나). 탭 하나에 헤더 하나라 모듈에 둔다.
 * 읽음이 성공하면 `fenceHeaderCounts`가 그때까지 나간 순번을 울타리로 세우고, 그 안쪽에서 시작한 응답은
 * 버린다(`isStaleCount`). 취소(`cancelQueries`)만으로는 모자란 이유: 취소는 진행 중인 queryFn 하나만 끊는다.
 * 울타리는 순서가 꼬인 어떤 경로로 도착해도 옛 숫자를 캐시에 못 넣게 한다.
 */
let issued = 0;
let fence = 0;

async function fetchHeaderCounts(
  queryClient: QueryClient,
): Promise<HeaderCounts> {
  /* 목 모드면 worker 준비를 먼저 기다린다(S2-8) — 안 기다리면 첫 요청이 프록시를 지나 가짜 API로 샌다 */
  await chatMockReady();
  const started = ++issued;
  try {
    const counts = await apiFetch<RetailUnreadCount>(UNREAD_COUNT_PATH);
    /* 읽음 전에 떠난 응답 — 버리고 캐시 값을 그대로 둔다(읽음 뒤 다시 받은 값이 이미 있거나 곧 온다).
       캐시가 비어 있을 때만 새로 받는다. 새 순번은 울타리 밖이라 한 번이면 끝난다 */
    if (isStaleCount(started, fence))
      return (
        queryClient.getQueryData<HeaderCounts>(chatKeys.headerCounts()) ??
        fetchHeaderCounts(queryClient)
      );
    return { kind: "ok", chats: counts.chats };
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403))
      return { kind: "stopped" };
    return failedCounts(
      queryClient.getQueryData<HeaderCounts>(chatKeys.headerCounts()),
    );
  }
}

/**
 * 헤더 count(S2-3). 셸에 하나. 30초마다, 실패하면 60 → 120 → 300초, 401과 403이면 멈춘다.
 * 탭이 숨으면 묻지 않고(`refetchIntervalInBackground: false`), 다시 보이면 즉시 1회(`"always"`).
 * 멈춘 뒤엔 `enabled`가 꺼진다 — 탭 복귀나 읽음 뒤 다시 받기도 요청을 내지 않는다.
 *
 * 그 멈춤은 **셸이 새로 붙을 때** 푼다(loop-06 QA F1, 도매 c21c590과 같은 방식). 로그아웃 → 로그인은
 * `router.replace`라 QueryClient가 그대로고, 지우지 않으면 다시 로그인한 사장이 새로고침 전까지 배지 0을 본다.
 * 셸(`(shop)` 레이아웃)은 `/login`(`(account)`)에서 내려가니 마운트 한 번 = 세션 한 번이다. 같은 화면에
 * 머무는 동안은 그대로 멈춘다.
 */
export function useHeaderCountsQuery() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const key = chatKeys.headerCounts();
    if (queryClient.getQueryData<HeaderCounts>(key)?.kind === "stopped")
      void queryClient.resetQueries({ queryKey: key, exact: true });
  }, [queryClient]);
  return useQuery({
    queryKey: chatKeys.headerCounts(),
    queryFn: () => fetchHeaderCounts(queryClient),
    enabled: (query) => query.state.data?.kind !== "stopped",
    refetchInterval: (query) => headerPollDelayMs(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

/**
 * 읽음 성공 뒤 배지를 바로 줄인다(S2-5). 울타리 → 진행 중 count 취소 → 다시 받기 순서다.
 * 취소가 다시 받기보다 먼저인 이유: 읽기 전에 떠난 count가 다시 받은 것보다 늦게 와서 줄어든 배지를 되살리면
 * 안 된다. 멈춘 count(`enabled` false)는 `invalidateQueries`가 다시 부르지 않는다.
 */
export async function refreshHeaderCounts(
  queryClient: QueryClient,
): Promise<void> {
  fence = issued;
  await queryClient.cancelQueries({ queryKey: chatKeys.headerCounts() });
  await queryClient.invalidateQueries({ queryKey: chatKeys.headerCounts() });
}
