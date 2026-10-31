"use client";

import {
  focusManager,
  infiniteQueryOptions,
  onlineManager,
  queryOptions,
  useInfiniteQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiFetchBody } from "@ondo/api";
import { chatKeys } from "./keys";
import { guardSession, isChatSessionLostError, isSessionLost } from "./session";
import {
  MESSAGE_PAGE_SIZE,
  ROOM_LIST_POLL_MS,
  ROOM_PAGE_SIZE,
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
 */
export const CHAT_PATH = {
  rooms: "/api/wholesale/chat/rooms",
  room: (roomId: number) => `/api/wholesale/chat/rooms/${roomId}`,
  messages: (roomId: number) => `/api/wholesale/chat/rooms/${roomId}/messages`,
  read: (roomId: number) => `/api/wholesale/chat/rooms/${roomId}/read`,
} as const;

/*
 * 채팅 쿼리는 전부 `retry: false`다. 앱 기본(5xx 두 번 더)을 쓰면 첫 조회 실패가 1초, 2초 뒤에야
 * 화면에 오고, polling은 자기 간격(backoff)이 이미 재시도다 — 둘이 겹치면 간격 규칙(S3-6)이 깨진다.
 *
 * `signal`을 넘기지 않는다(다른 feature와 같다). 넘기면 Suspense가 첫 렌더를 버릴 때 TanStack이 그 요청을
 * 취소하고 새로 보낸다 — 실서버엔 같은 GET이 두 번 가고, 목의 "다음 1회 실패"는 취소된 요청이 먹는다.
 *
 * 401은 전부 `guardSession`을 거친다(`session.ts`, 리뷰 F1) — 공용 처리의 `/login` 이동 대신 채팅 세션 끊김.
 */

/** 방 목록 옵션의 원본. 기다리는 훅과 엿보는 훅이 같은 키를 나눠 써서 요청이 한 번만 나간다 */
function roomListOptions(queryClient: QueryClient) {
  return infiniteQueryOptions({
    queryKey: chatKeys.rooms(),
    queryFn: ({ pageParam }) =>
      guardSession(queryClient, () =>
        apiFetchBody<ChatRoomPage>(CHAT_PATH.rooms, {
          searchParams: {
            size: ROOM_PAGE_SIZE,
            cursor: pageParam ?? undefined,
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    retry: false,
  });
}

/**
 * 방 목록. 15초마다 다시 받는다 — TanStack infinite 재조회는 **받아 둔 페이지 전부**를 새 1페이지부터
 * 커서를 다시 따라가며 받는다. 1페이지만 갈아 끼우면 2페이지에 있던 방이 위로 올라왔을 때 두 번 보이거나,
 * 위에서 밀려난 방이 사라진다. 이어 받기 전(30개 이하)엔 요청 1건이다.
 * 세션이 끊기면 멈춘다(간격 false, 그래도 불리면 요청 없이 끊김 오류).
 */
export function useRoomListQuery() {
  const queryClient = useQueryClient();
  return useSuspenseInfiniteQuery({
    ...roomListOptions(queryClient),
    refetchInterval: () =>
      isSessionLost(queryClient) ? false : ROOM_LIST_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * 엿보는 훅은 요청을 내지 않는다. 목록 패널(`useRoomListQuery`)이 받은 값만 본다 — 엿보는 쪽이 켜져 있으면
 * 목록이 실패했을 때 이쪽이 마운트되며 다시 불러(retryOnMount) 실패 화면 대신 조용히 성공해 버린다.
 */
const PEEK_ONLY = { enabled: false } as const;

/**
 * 목록이 비었는지만 **기다리지 않고** 엿본다 — 방이 0개면 오른쪽 패널에 "고르세요"를 쓰지 않는다
 * (고를 게 없다, 디자인 결정 16). 모르면 `undefined`. 간격을 주지 않는다 — 폴링은 목록 패널 한 곳만 한다.
 */
export function useRoomListEmptyPeek(): boolean | undefined {
  const queryClient = useQueryClient();
  const { data } = useInfiniteQuery({
    ...roomListOptions(queryClient),
    ...PEEK_ONLY,
    select: (d) => d.pages[0]?.data.length === 0,
  });
  return data;
}

/**
 * 목록에 이미 있는 방이면 그 이름. 방 머리가 오기 전(로딩, 메시지 조회 실패)에도 제목을 먼저 그린다.
 * 목록에 없으면(이어 받기 전 방, `?room=` 직접 진입) `undefined`.
 */
export function useRoomNamePeek(roomId: number): string | undefined {
  const queryClient = useQueryClient();
  const { data } = useInfiniteQuery({
    ...roomListOptions(queryClient),
    ...PEEK_ONLY,
    select: (d) =>
      d.pages
        .flatMap((page) => page.data)
        .find((room) => room.roomId === roomId)?.counterpart.name,
  });
  return data;
}

/**
 * 방 머리. 없는 방, 남의 방은 404(존재를 숨긴다) → 경계의 `notFound`.
 *
 * 받은 상대 읽음 값을 메시지 캐시에 합친다(loop-08 S3). 방 머리는 새 메시지가 올 때마다 다시 불려서
 * polling보다 늦게 도착할 수 있다 — 값을 캐시 하나에 max로만 쌓아야 늦은 머리의 옛 값이 `읽음`을 내리지 못한다.
 * 메시지 캐시가 아직 없으면(첫 진입) 메시지 첫 조회가 끝날 때 이 머리 값을 읽어 합친다(`fetchThread`).
 */
function roomDetailOptions(roomId: number, queryClient: QueryClient) {
  return queryOptions({
    queryKey: chatKeys.room(roomId),
    queryFn: async () => {
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
  });
}

/**
 * 열린 방의 메시지. **처음 한 번은 최신 50개, 그다음부터는 polling**이다(같은 키, 같은 queryFn).
 *
 * polling 규칙(01-plan §4-1 5, Codex plan r1 10):
 * - 열린 방 하나만. 이 옵션을 쓰는 컴포넌트가 열린 방에만 있다
 * - `afterSequence = cursor`. `hasMore`면 기다리지 않고 같은 호출 안에서 바로 이어 받는다(S3-4)
 * - 탭이 안 보이면 묻지 않는다(`refetchIntervalInBackground: false`), 다시 보이면 즉시 1회(`"always"`)
 * - 오프라인이면 TanStack이 요청을 멈춰 두고(networkMode online), 온라인이 되면 즉시 1회
 * - 세션이 끊기면 멈춘다(간격 false, 불려도 요청 없이 그대로). 401은 `session.ts`로 모은다
 * - polling 실패는 화면에 띄우지 않는다. 이미 그린 대화를 오류 패널로 바꾸면 읽던 걸 잃는다.
 *   실패를 삼키고 간격만 늘린다(S3-6). 첫 조회 실패만 던져 방 패널이 오류를 그린다(S3-9)
 */
function threadOptions(roomId: number, queryClient: QueryClient) {
  const key = chatKeys.thread(roomId);
  return queryOptions({
    queryKey: key,
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
 * 방 머리와 메시지를 **같이** 기다린다. 따로 `useSuspenseQuery` 두 번이면 머리가 온 뒤에야
 * 메시지 요청이 나간다(폭포).
 */
export function useRoomQueries(roomId: number) {
  const queryClient = useQueryClient();
  const [detail, thread] = useSuspenseQueries({
    queries: [
      roomDetailOptions(roomId, queryClient),
      threadOptions(roomId, queryClient),
    ],
  });
  return {
    room: detail.data,
    thread: thread.data,
    /** polling 응답마다 바뀐다. 실패한 읽음을 다음 polling 때 다시 보내는 박자로 쓴다(리뷰 F2) */
    threadUpdatedAt: thread.dataUpdatedAt,
  };
}

/**
 * hasMore 이어 받기를 계속해도 되나(리뷰 F4). 한 번의 polling 안에서 여러 장을 받는 사이 방을 옮겼거나
 * (이 쿼리를 보는 화면이 없다), 탭을 숨겼거나, 오프라인이 됐거나, 세션이 끊겼으면 거기서 멈춘다.
 * 받은 장까지는 남기고 cursor도 거기까지라 다음 polling이 이어 받는다.
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
 * 시작과 끝에 **지금의** 캐시를 읽는다. 요청을 기다리는 사이 보내기 응답(#265)이 메시지를 끼워 넣었을 수
 * 있어, 시작 때 본 값으로 덮으면 그게 지워진다. 그래서 끝날 때 다시 읽어 합친다.
 */
async function fetchThread(
  roomId: number,
  queryClient: QueryClient,
): Promise<ChatThread> {
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
  /* 이번 polling이 받은 상대 읽음. 빈 응답에도 meta가 와서 새 메시지 없이 `읽음`만 옮길 수 있다(S3-2) */
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
      counterpartRead: mergeCounterpartRead(
        latest.counterpartRead,
        counterpartRead,
      ),
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
    /* 끝날 때의 캐시 값(그 사이 방 머리가 합쳤을 수 있다)과 이번 응답 값 중 큰 쪽 */
    counterpartRead: mergeCounterpartRead(
      latest.counterpartRead,
      counterpartRead,
    ),
  };
}
