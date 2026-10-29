"use client";

import {
  focusManager,
  onlineManager,
  queryOptions,
  useQueries,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiFetchBody } from "@ondo/api";
import { chatKeys } from "./keys";
import { chatMockReady } from "./mockWorker";
import { guardSession, isChatSessionLostError, isSessionLost } from "./session";
import { MESSAGE_PAGE_SIZE } from "../constants";
import { advanceCursor, mergeMessages, pollDelayMs } from "../derive";
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoomDetail,
  ChatThread,
} from "../types";

/**
 * 채팅 경로(초안 op, #263). 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 * 목록(`GET /rooms`)과 읽음(`POST /read`)은 05b다.
 */
export const CHAT_PATH = {
  rooms: "/api/retail/chat/rooms",
  room: (roomId: number) => `/api/retail/chat/rooms/${roomId}`,
  messages: (roomId: number) => `/api/retail/chat/rooms/${roomId}/messages`,
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

function roomOptions(roomId: number, queryClient: QueryClient) {
  return queryOptions({
    queryKey: chatKeys.room(roomId),
    queryFn: async () => {
      await chatMockReady();
      return guardSession(queryClient, () =>
        apiFetch<ChatRoomDetail>(CHAT_PATH.room(roomId)),
      );
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
    };
  }
  if (isSessionLost(queryClient)) return start;

  let cursor = start.cursor;
  let fetched: ChatMessage[] = [];
  try {
    for (;;) {
      const page = await guardSession(queryClient, () =>
        apiFetchBody<ChatMessagePage>(path, {
          searchParams: { afterSequence: cursor, size: MESSAGE_PAGE_SIZE },
        }),
      );
      fetched = mergeMessages(fetched, page.data);
      cursor = advanceCursor(cursor, page.data);
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
      };
    const failures = latest.failures + 1;
    return {
      // 여러 장을 이어 받다 중간에 실패해도 받은 장까지는 남긴다 — cursor도 거기까지 올라가 있다
      ...latest,
      messages: mergeMessages(latest.messages, fetched),
      cursor: Math.max(latest.cursor, cursor),
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
  };
}
