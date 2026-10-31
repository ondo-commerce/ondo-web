"use client";

import {
  focusManager,
  onlineManager,
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch, apiFetchBody, isApiError } from "@ondo/api";
import { useDocumentVisible } from "../useDocumentVisible";
import { chatKeys } from "./keys";
import { mockReady as chatMockReady } from "@/shared/api/mockReady";
import { guardSession, isChatSessionLostError, isSessionLost } from "./session";
import {
  MESSAGE_PAGE_SIZE,
  ROOM_LIST_POLL_MS,
  ROOM_LIST_SIZE,
} from "../constants";
import {
  advanceCursor,
  mergeCounterpartRead,
  mergeMessages,
  pollDelayMs,
} from "../derive";
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoomDetail,
  ChatRoomPage,
  ChatThread,
} from "../types";

/**
 * 채팅 경로(초안 op, #263). 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 * 목록(`GET /rooms`)과 읽음(`POST /read`)은 loop-06 S2부터 부른다.
 */
export const CHAT_PATH = {
  rooms: "/api/retail/chat/rooms",
  room: (roomId: number) => `/api/retail/chat/rooms/${roomId}`,
  messages: (roomId: number) => `/api/retail/chat/rooms/${roomId}/messages`,
  read: (roomId: number) => `/api/retail/chat/rooms/${roomId}/read`,
} as const;

/*
 * 소매 방 데이터는 **Client fetch**다(소매 기본은 Server fetch). 목이 브라우저 MSW라 서버 fetch는 목에
 * 닿지 않고, 채팅방은 검색에 걸릴 화면도 아니다(01-plan §4-2 1). 모든 요청이 먼저 worker 준비를 기다린다.
 *
 * 채팅 쿼리는 전부 `retry: false`다(01-plan §4-3 3). 소매 앱 기본 retry는 **ApiError가 아닌 오류를 두 번
 * 더** 보낸다 — `ChatSessionLostError`를 그대로 두면 끊긴 뒤에도 재시도가 나간다(`guardSession`이 요청을
 * 막아도 재시도 타이머가 돈다). polling은 자기 간격(backoff)이 이미 재시도다.
 *
 * 401은 전부 `guardSession`을 거친다(`session.ts`) — 공용 처리의 `/login` 이동 대신 채팅 세션 끊김.
 */

/*
 * 방 머리. 받은 상대 읽음 값을 메시지 캐시에 합친다(loop-08 S4-2, 도매 `roomDetailOptions`와 같은 규칙).
 * 방 머리는 메시지보다 늦게 도착할 수 있다 — 값을 캐시 하나에 max로만 쌓아야 늦은 머리의 옛 값이 `읽음`을
 * 내리지 못한다. 메시지 캐시가 아직 없으면(머리가 먼저 옴) 메시지 첫 조회가 끝날 때 이 머리 값을 읽어 합친다.
 */
function roomOptions(roomId: number, queryClient: QueryClient) {
  return queryOptions({
    queryKey: chatKeys.room(roomId),
    queryFn: async () => {
      await chatMockReady();
      const detail = await guardSession(queryClient, () =>
        apiFetch<ChatRoomDetail>(CHAT_PATH.room(roomId)),
      );
      queryClient.setQueryData<ChatThread>(chatKeys.thread(roomId), (thread) =>
        thread === undefined
          ? thread
          : {
              ...thread,
              counterpartRead: mergeCounterpartRead(
                thread.counterpartRead,
                detail.counterpartLastReadSequence,
              ),
            },
      );
      return detail;
    },
    retry: false,
    // 방 머리는 도매처명과 돌아가기 링크만 쓴다. 다시 받을 이유가 없다
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * 열린 방의 메시지. **처음 한 번은 최신 50개, 그다음부터는 polling**이다(같은 키, 같은 queryFn).
 * 도매 `threadOptions`와 같은 규칙이다(01-plan §4-2 4):
 * - `afterSequence = cursor`. `hasMore`면 기다리지 않고 같은 호출 안에서 바로 이어 받는다(S6-7)
 * - 탭이 안 보이면 묻지 않는다(`refetchIntervalInBackground: false`), 다시 보이면 즉시 1회(`"always"`)
 * - 오프라인이면 TanStack이 요청을 멈춰 두고(networkMode online), 온라인이 되면 즉시 1회(S6-6 S6-8)
 * - 세션이 끊기면 멈춘다(간격 false, 불려도 요청 없이 그대로, S6-5)
 * - polling 실패는 화면에 띄우지 않는다. 이미 그린 대화를 오류 화면으로 바꾸면 읽던 걸 잃는다.
 *   실패를 삼키고 간격만 늘린다(S6-8). 첫 조회 실패만 던져 블록이 오류를 그린다(S5-8)
 */
function threadOptions(roomId: number, queryClient: QueryClient) {
  return queryOptions({
    queryKey: chatKeys.thread(roomId),
    queryFn: () => fetchThread(roomId, queryClient),
    retry: false,
    refetchInterval: (query) => {
      const thread = query.state.data;
      return thread === undefined || isSessionLost(queryClient)
        ? false
        : thread.nextPollMs;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

/**
 * 방 머리와 메시지를 **같이** 부른다(폭포 없이). Suspense를 쓰지 않는 이유: 소매엔 도매의
 * `QueryBoundary`가 없고, 블록이 로딩, 없는 방, 실패를 한 패널 안에서 직접 가른다.
 */
export function useRoomQueries(roomId: number) {
  const queryClient = useQueryClient();
  const [room, thread] = useQueries({
    queries: [
      roomOptions(roomId, queryClient),
      threadOptions(roomId, queryClient),
    ],
  });
  return { room, thread };
}

/**
 * 행을 이미 그린 뒤 받은 401(loop-08 S4-7, 디자인 결정 65). `ApiError`가 아니라 공용 처리(`providers.tsx`)가
 * `/login`으로 보내지 않는다 — 목록은 그대로 두고 머리 아래 한 줄로 알린다. 첫 장 첫 조회 401은 06a처럼
 * `ApiError` 그대로 던져 `/login`으로 간다(그릴 행이 없다).
 */
export class RoomListSessionLostError extends Error {
  constructor() {
    super("chat room list session lost");
    this.name = "RoomListSessionLostError";
  }
}

export function isRoomListSessionLost(error: unknown): boolean {
  return error instanceof RoomListSessionLostError;
}

/**
 * `/chats` 목록(loop-06 S2-4 → loop-08 S4). 장은 `ROOM_LIST_SIZE`(30)씩, `더 보기`가 다음 장을 붙인다.
 *
 * 갱신(§4-4 1): 15초마다, 그리고 탭이 다시 보이면 즉시 1회. TanStack infinite query의 다시 받기는 **받은 장 수만큼
 * 첫 장부터** 차례로 다시 묻고 cursor는 새로 받은 장에서 다시 뽑는다 — 기획 규칙 그대로라 직접 돌리지 않는다.
 *
 * 주기는 TanStack `refetchInterval`이 아니라 아래 `setInterval`이다(메타 리뷰 M1). `refetchInterval`은 요청이
 * 시작되고 끝날 때마다 타이머를 다시 걸어, 14초에 누른 `더 보기`가 5초 걸리면 다음 갱신이 34초가 된다.
 * §4-4 2는 "겹친 회차만 건너뛰고 다음 15초, 최대 15초"다 — 주기는 화면이 열린(또는 탭이 다시 보인) 때부터
 * 요청과 상관없이 15초씩 돈다. 탭이 숨으면 타이머를 지우고, 보이면 그때부터 다시 건다.
 *
 * 겹침(§4-4 2):
 * - 15초가 된 순간 요청(`더 보기`, 탭 복귀 재조회)이 돌고 있으면 그 회차는 묻지 않고 건너뛴다
 * - 갱신이 도는 중엔 화면이 `더 보기`를 잠근다(`moreStateOf`). 누르는 쪽도 `cancelRefetch: false`로 부른다 —
 *   기본값(true)이면 연타가 앞 요청을 취소하고 새로 보내 요청이 여러 번 나간다(S4-4 3연타 1회)
 *
 * `guardSession`을 거치지 않는다: 세션 잠금을 걸면 그 표시를 지울 곳(방 화면을 떠날 때)이 목록엔 없어 다음에
 * 연 방이 잠긴 채 시작한다. 401은 위 `RoomListSessionLostError`로 가른다. 끊긴 뒤엔 갱신도 탭 복귀 재조회도 멈춘다.
 * `retry: false` — 실패는 화면의 `다시 시도`가 1회 다시 묻는다(S2-4, S4-7). 갱신 실패는 조용히 다음 15초(결정 66).
 */
export function useRoomListQuery() {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: chatKeys.rooms(),
    queryFn: async ({ pageParam }) => {
      await chatMockReady();
      try {
        return await apiFetchBody<ChatRoomPage>(CHAT_PATH.rooms, {
          searchParams: {
            size: ROOM_LIST_SIZE,
            cursor: pageParam ?? undefined,
          },
        });
      } catch (error) {
        const drawn = queryClient.getQueryData(chatKeys.rooms()) !== undefined;
        if (drawn && isApiError(error) && error.status === 401)
          throw new RoomListSessionLostError();
        throw error;
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: (q) =>
      isRoomListSessionLost(q.state.error) ? false : "always",
    refetchOnReconnect: false,
  });

  const visible = useDocumentVisible();
  const sessionLost = isRoomListSessionLost(query.error);
  useEffect(() => {
    if (!visible || sessionLost) return;
    const timer = setInterval(() => {
      const state = queryClient.getQueryState(chatKeys.rooms());
      /* 겹친 회차만 건너뛴다. 다음 회차는 이 타이머 그대로 15초 뒤다 */
      if (state?.fetchStatus === "fetching") return;
      if (isRoomListSessionLost(state?.error)) return;
      void queryClient.refetchQueries(
        { queryKey: chatKeys.rooms(), exact: true, type: "active" },
        { cancelRefetch: false },
      );
    }, ROOM_LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [visible, sessionLost, queryClient]);

  return query;
}

/**
 * hasMore 이어 받기를 계속해도 되나(도매 리뷰 F4). 여러 장을 받는 사이 방을 떠났거나(이 쿼리를 보는 화면이
 * 없다), 탭을 숨겼거나, 오프라인이 됐거나, 세션이 끊겼으면 거기서 멈춘다. 받은 장까지는 남기고 cursor도
 * 거기까지라 다음 polling이 이어 받는다.
 */
function canContinue(queryClient: QueryClient, roomId: number): boolean {
  const observed =
    (queryClient
      .getQueryCache()
      .find({ queryKey: chatKeys.thread(roomId), exact: true })
      ?.getObserversCount() ?? 0) > 0;
  return (
    observed &&
    focusManager.isFocused() &&
    onlineManager.isOnline() &&
    !isSessionLost(queryClient)
  );
}

/**
 * 시작과 끝에 **지금의** 캐시를 읽는다. 요청을 기다리는 사이 보내기 응답이 메시지를 끼워 넣었을 수
 * 있어, 시작 때 본 값으로 덮으면 그게 지워진다. 그래서 끝날 때 다시 읽어 합친다(도매와 같다).
 */
async function fetchThread(
  roomId: number,
  queryClient: QueryClient,
): Promise<ChatThread> {
  await chatMockReady();
  const key = chatKeys.thread(roomId);
  const read = () => queryClient.getQueryData<ChatThread>(key);
  const path = CHAT_PATH.messages(roomId);
  const start = read();

  if (start === undefined) {
    const page = await guardSession(queryClient, () =>
      apiFetchBody<ChatMessagePage>(path, {
        searchParams: { size: MESSAGE_PAGE_SIZE },
      }),
    );
    return {
      messages: mergeMessages([], page.data),
      cursor: advanceCursor(0, page.data),
      failures: 0,
      nextPollMs: pollDelayMs(0, 0),
      /* 방 머리가 먼저 도착했으면 그 값은 캐시가 없어 합쳐지지 못했다 — 여기서 같이 합친다(어느 쪽이 먼저든 하나로) */
      counterpartRead: mergeCounterpartRead(
        page.meta.counterpartLastReadSequence,
        queryClient.getQueryData<ChatRoomDetail>(chatKeys.room(roomId))
          ?.counterpartLastReadSequence,
      ),
    };
  }
  if (isSessionLost(queryClient)) return start;

  let cursor = start.cursor;
  let fetched: ChatMessage[] = [];
  /* 이번 polling이 받은 상대 읽음. 빈 응답에도 meta가 와서 새 메시지 없이 `읽음`만 옮길 수 있다(S4-2) */
  let counterpartRead: number | null = null;
  try {
    for (;;) {
      const page = await guardSession(queryClient, () =>
        apiFetchBody<ChatMessagePage>(path, {
          searchParams: { afterSequence: cursor, size: MESSAGE_PAGE_SIZE },
        }),
      );
      fetched = mergeMessages(fetched, page.data);
      cursor = advanceCursor(cursor, page.data);
      counterpartRead = mergeCounterpartRead(
        counterpartRead,
        page.meta.counterpartLastReadSequence,
      );
      if (!page.meta.hasMore || page.data.length === 0) break;
      if (!canContinue(queryClient, roomId)) break;
    }
  } catch (error) {
    const latest = read() ?? start;
    // 세션 끊김 — 받은 것까지 남기고 멈춘다. 간격은 `isSessionLost`가 끈다
    if (isChatSessionLostError(error))
      return {
        ...latest,
        messages: mergeMessages(latest.messages, fetched),
        cursor: Math.max(latest.cursor, cursor),
        counterpartRead: mergeCounterpartRead(
          latest.counterpartRead,
          counterpartRead,
        ),
      };
    const failures = latest.failures + 1;
    return {
      // 여러 장을 이어 받다 중간에 실패해도 받은 장까지는 남긴다 — cursor도 거기까지 올라가 있다
      ...latest,
      messages: mergeMessages(latest.messages, fetched),
      cursor: Math.max(latest.cursor, cursor),
      counterpartRead: mergeCounterpartRead(
        latest.counterpartRead,
        counterpartRead,
      ),
      failures,
      nextPollMs: pollDelayMs(failures, Math.random()),
    };
  }

  const latest = read() ?? start;
  return {
    ...latest,
    messages: mergeMessages(latest.messages, fetched),
    cursor: Math.max(latest.cursor, cursor),
    failures: 0,
    nextPollMs: pollDelayMs(0, 0),
    /* 끝날 때의 캐시 값(그 사이 방 머리가 합쳤을 수 있다)과 이번 응답 값 중 큰 쪽 */
    counterpartRead: mergeCounterpartRead(
      latest.counterpartRead,
      counterpartRead,
    ),
  };
}
