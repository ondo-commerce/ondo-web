"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, isApiError, type RetailSchema } from "@ondo/api";
import { useEffect } from "react";
import { mockReady } from "./mockReady";
import {
  failedCounts,
  headerPollDelayMs,
  isStaleCount,
  type HeaderCounts,
} from "@/shared/headerCounts";

/**
 * 헤더 count 요청과 캐시(06a #298 S2, 06b #305 S2). 채팅 링크(`features/chat`)와 알림 종(`features/notification`)이
 * 같은 쿼리 하나를 본다. 06a에선 `features/chat/api`에 있었고 06b에 두 번째 사용처가 생겨 내렸다.
 */
export const UNREAD_COUNT_PATH = "/api/retail/notifications/unread-count";

type RetailUnreadCount = RetailSchema<"RetailUnreadCount">;

/**
 * 헤더 count 키. 채팅 캐시(`["chat", …]`) 아래에 두지 않는다 — 방 화면이 채팅 캐시를 통째로 비우거나 다시 부를 때
 * 헤더까지 휩쓸리면 401로 멈춘 count가 다시 돌 수 있다
 */
export const HEADER_COUNTS_KEY = ["header-counts"] as const;

/** 알림 패널 캐시의 뿌리. 세션이 바뀔 때 여기 아래를 같이 버린다(`clearHeaderSession`). 알림 feature 키가 이 아래다 */
export const NOTIFICATION_KEY_ROOT = ["notification"] as const;

/**
 * `meta.sessionLoss: "inline"` — 401이어도 전역 처리(`app/providers.tsx`)가 `/login`으로 보내지 않는다(§4-1 3 ②).
 * 헤더는 셸 14화면 어디에나 있어서, 패널 하나의 401이 다른 화면의 쓰던 글을 버리게 하면 안 된다. 그 요청은
 * 자기 자리에서 끊김을 알린다(패널 "로그인이 끊겼어요")
 */
export const SESSION_LOSS_INLINE = { sessionLoss: "inline" } as const;

export function isSessionLossInline(
  meta: Record<string, unknown> | undefined,
): boolean {
  return meta?.sessionLoss === SESSION_LOSS_INLINE.sessionLoss;
}

/*
 * 헤더는 셸 14화면 어디에나 떠 있다. 그래서 여기 요청은 **화면을 망가뜨리지 않는 것**이 먼저다.
 *  - 401, 403이어도 `/login`, `/approval`로 보내지 않는다 — queryFn이 **던지지 않고** 값으로 돌려준다
 *  - 채팅 `guardSession`을 쓰지 않는다. 방의 세션 잠금을 건드리면 그 뒤 연 방이 끊김 상태로 시작한다
 *  - 실패해도 셸은 throw하지 않는다(retail-wire-cart F3)
 *  - `retry: false` — 앱 기본(5xx 두 번 더)이면 실패 한 번이 요청 세 번이 되고 간격 규칙이 깨진다
 */

/**
 * count 시작 순번과 읽음 울타리(06a S2-6 나). 탭 하나에 헤더 하나라 모듈에 둔다.
 * 읽음이 성공하면 `refreshHeaderCounts`가 그때까지 나간 순번을 울타리로 세우고, 그 안쪽에서 시작한 응답은
 * 버린다(`isStaleCount`). 취소(`cancelQueries`)만으로는 모자란 이유: 취소는 진행 중인 queryFn 하나만 끊는다.
 * 울타리는 순서가 꼬인 어떤 경로로 도착해도 옛 숫자를 캐시에 못 넣게 한다.
 */
let issued = 0;
let fence = 0;

/** 지금까지 나간 count 순번. 알림 목록이 첫 장을 보낼 때 적어 둔다 — 그보다 먼저 떠난 count는 새 알림 판단에서 뺀다 */
export function countsIssued(): number {
  return issued;
}

async function fetchHeaderCounts(
  queryClient: QueryClient,
): Promise<HeaderCounts> {
  /* 목 모드면 worker 준비를 먼저 기다린다(06a S2-8) — 안 기다리면 첫 요청이 프록시를 지나 가짜 API로 샌다 */
  await mockReady();
  const started = ++issued;
  try {
    const counts = await apiFetch<RetailUnreadCount>(UNREAD_COUNT_PATH);
    /* 읽음 전에 떠난 응답 — 버리고 캐시 값을 그대로 둔다(읽음 뒤 다시 받은 값이 이미 있거나 곧 온다).
       캐시가 비어 있을 때만 새로 받는다. 새 순번은 울타리 밖이라 한 번이면 끝난다 */
    if (isStaleCount(started, fence))
      return (
        queryClient.getQueryData<HeaderCounts>(HEADER_COUNTS_KEY) ??
        fetchHeaderCounts(queryClient)
      );
    return {
      kind: "ok",
      chats: counts.chats,
      notifications: counts.notifications,
      /* 칸이 없으면 `undefined` 그대로 둔다 — `?? null`로 접으면 "구버전 서버"와 "알림 0개"가 섞인다(§4-2 5) */
      latestNotificationId: counts.latestNotificationId,
      started,
    };
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403))
      return { kind: "stopped" };
    return failedCounts(
      queryClient.getQueryData<HeaderCounts>(HEADER_COUNTS_KEY),
    );
  }
}

/**
 * 헤더 count(06a S2-3). **셸에 하나만 부른다**(채팅 링크). 30초마다, 실패하면 60 → 120 → 300초, 401과 403이면 멈춘다.
 * 탭이 숨으면 묻지 않고(`refetchIntervalInBackground: false`), 다시 보이면 즉시 1회(`"always"`).
 * 멈춘 뒤엔 `enabled`가 꺼진다 — 탭 복귀나 읽음 뒤 다시 받기도 요청을 내지 않는다.
 * 다른 자리(알림 종)는 `useHeaderCountsValue`로 같은 값만 읽는다 — 관찰자마다 간격 타이머가 따로 돌아서다.
 *
 * 그 멈춤은 **셸이 새로 붙을 때** 푼다(loop-06 QA F1, 도매 c21c590과 같은 방식). 셸(`(shop)` 레이아웃)은
 * `/login`(`(account)`)에서 내려가니 마운트 한 번 = 세션 한 번이다. 같은 화면에 머무는 동안은 그대로 멈춘다.
 * 로그인, 로그아웃 지점은 `clearHeaderSession`으로 캐시를 통째로 버린다(06b §4-1 3 ①).
 */
export function useHeaderCountsQuery() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (
      queryClient.getQueryData<HeaderCounts>(HEADER_COUNTS_KEY)?.kind ===
      "stopped"
    )
      void queryClient.resetQueries({
        queryKey: HEADER_COUNTS_KEY,
        exact: true,
      });
  }, [queryClient]);
  return useQuery({
    queryKey: HEADER_COUNTS_KEY,
    queryFn: () => fetchHeaderCounts(queryClient),
    enabled: (query) => query.state.data?.kind !== "stopped",
    refetchInterval: (query) => headerPollDelayMs(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

/** 같은 count를 요청 없이 읽기만 한다(알림 종). 요청과 간격은 `useHeaderCountsQuery` 하나가 낸다(S2-1 "요청 2회 0") */
export function useHeaderCountsValue(): HeaderCounts | undefined {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: HEADER_COUNTS_KEY,
    queryFn: () => fetchHeaderCounts(queryClient),
    enabled: false,
  }).data;
}

/**
 * 읽음 성공 뒤 배지를 바로 줄인다(06a S2-5, 06b §4-1 4). 울타리 → 진행 중 count 취소 → (캐시 고치기) → 다시 받기.
 * 취소가 다시 받기보다 먼저인 이유: 읽기 전에 떠난 count가 다시 받은 것보다 늦게 와서 줄어든 배지를 되살리면
 * 안 된다. `beforeRefetch`는 그 사이에 알림 읽음 응답의 남은 수를 먼저 넣는 자리다.
 * 멈춘 count(`enabled` false)는 `invalidateQueries`가 다시 부르지 않는다.
 */
export async function refreshHeaderCounts(
  queryClient: QueryClient,
  beforeRefetch?: () => void,
): Promise<void> {
  fence = issued;
  await queryClient.cancelQueries({ queryKey: HEADER_COUNTS_KEY });
  beforeRefetch?.();
  await queryClient.invalidateQueries({ queryKey: HEADER_COUNTS_KEY });
}

/**
 * 다른 요청이 401을 받아 헤더 count를 멈춘다(06b 알림 읽음 401, 03-review R1). `refreshHeaderCounts`와 같은 순서 —
 * 울타리 → 진행 중 count 취소 → 값 넣기. 취소 없이 `stopped`만 넣으면 그 전에 떠난 count가 늦게 성공해 `ok`로 덮고,
 * 배지가 되살아나며 `enabled`가 다시 켜져 30초 polling이 돈다. 울타리는 취소를 빠져나온 응답까지 막는다
 * (`fetchHeaderCounts`가 울타리 안쪽 응답이면 캐시의 `stopped`를 그대로 돌려준다).
 */
export async function stopHeaderCounts(
  queryClient: QueryClient,
): Promise<void> {
  fence = issued;
  await queryClient.cancelQueries({ queryKey: HEADER_COUNTS_KEY });
  queryClient.setQueryData<HeaderCounts>(HEADER_COUNTS_KEY, {
    kind: "stopped",
  });
}

/**
 * 세션이 바뀐다(로그아웃 누름, 로그인 성공, 06b §4-1 3 ①). 둘 다 `router.replace` 클라이언트 이동이라 QueryClient가
 * 산다 — 지우지 않으면 다음 계정이 앞 계정의 배지와 알림 행을 잠깐 본다(05b-2 F2). 진행 중 요청을 취소하고
 * 헤더 count와 알림 캐시를 버린다(멈춤 상태 포함). 그 사이 떠난 count는 울타리로 막는다.
 */
export async function clearHeaderSession(
  queryClient: QueryClient,
): Promise<void> {
  fence = issued;
  await Promise.all([
    queryClient.cancelQueries({ queryKey: HEADER_COUNTS_KEY }),
    queryClient.cancelQueries({ queryKey: NOTIFICATION_KEY_ROOT }),
  ]);
  queryClient.removeQueries({ queryKey: HEADER_COUNTS_KEY });
  queryClient.removeQueries({ queryKey: NOTIFICATION_KEY_ROOT });
}
