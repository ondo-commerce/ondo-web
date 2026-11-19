"use client";

import {
  focusManager,
  infiniteQueryOptions,
  onlineManager,
  queryOptions,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { apiFetch, apiFetchBody } from "@ondo/api";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ChatCache } from "./keys";
import { chatSessionEpoch, useChatCache } from "./scope";
import {
  ChatStaleResponseError,
  guardSession,
  isChatSessionLostError,
  isSessionLost,
} from "./session";
import {
  MESSAGE_PAGE_SIZE,
  ROOM_LIST_POLL_MS,
  ROOM_PAGE_SIZE,
} from "../constants";
import {
  advanceCursor,
  mergeCounterpartRead,
  mergeMessages,
  mergeOlder,
  pollDelayMs,
  toServerFilter,
} from "../derive";
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoomDetail,
  ChatRoomPage,
  ChatThread,
  HistoryStatus,
  RoomListParams,
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

/** 조건 없는 목록. "내 방이 0개인가"는 이것만 본다 — 조건 결과 0을 방 없음으로 읽지 않게(§4-2 5) */
const NO_CONDITION: RoomListParams = { filter: "ALL", q: null };

/**
 * 방 목록 옵션의 원본. 기다리는 훅과 엿보는 훅이 같은 키를 나눠 써서 요청이 한 번만 나간다.
 * 조건(filter, q)은 서버가 건다(loop-08b Q6 ①) — 받은 장 안에서 거르면 둘째 장 이후 방을 못 찾는다.
 * cursor는 위치만 담아서 조건이 바뀌면 키가 바뀌고 첫 장부터 받는다(계약 `filter` 설명)
 */
function roomListOptions(chat: ChatCache, params: RoomListParams) {
  return infiniteQueryOptions({
    queryKey: chat.keys.roomList(params.filter, params.q),
    queryFn: ({ pageParam }) =>
      guardSession(chat, () =>
        apiFetchBody<ChatRoomPage>(CHAT_PATH.rooms, {
          searchParams: {
            size: ROOM_PAGE_SIZE,
            cursor: pageParam ?? undefined,
            filter: toServerFilter(params.filter),
            q: params.q ?? undefined,
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
export function useRoomListQuery(params: RoomListParams) {
  const chat = useChatCache();
  return useSuspenseInfiniteQuery({
    ...roomListOptions(chat, params),
    refetchInterval: () => (isSessionLost(chat) ? false : ROOM_LIST_POLL_MS),
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
  const chat = useChatCache();
  const { data } = useInfiniteQuery({
    ...roomListOptions(chat, NO_CONDITION),
    ...PEEK_ONLY,
    select: (d) => d.pages[0]?.data.length === 0,
  });
  return data;
}

/**
 * 목록에 이미 있는 방이면 그 이름. 방 머리가 오기 전(로딩, 메시지 조회 실패)에도 제목을 먼저 그린다.
 * 목록에 없으면(이어 받기 전 방, `?room=` 직접 진입, 지금 조건에 안 걸리는 방) `undefined`.
 * 지금 목록 조건의 캐시를 본다 — 왼쪽에 그려진 목록이 그것이다
 */
export function useRoomNamePeek(
  roomId: number,
  params: RoomListParams,
): string | undefined {
  const chat = useChatCache();
  const { data } = useInfiniteQuery({
    ...roomListOptions(chat, params),
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
function roomDetailOptions(roomId: number, chat: ChatCache) {
  return queryOptions({
    queryKey: chat.keys.room(roomId),
    queryFn: async () => {
      const detail = await guardSession(chat, () =>
        apiFetch<ChatRoomDetail>(CHAT_PATH.room(roomId)),
      );
      chat.queryClient.setQueryData<ChatThread>(
        chat.keys.thread(roomId),
        (thread) =>
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
function threadOptions(roomId: number, chat: ChatCache) {
  const key = chat.keys.thread(roomId);
  return queryOptions({
    queryKey: key,
    queryFn: () => fetchThread(roomId, chat),
    retry: false,
    refetchInterval: (query) => {
      const thread = query.state.data;
      return thread === undefined || isSessionLost(chat)
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
  const chat = useChatCache();
  const [detail, thread] = useSuspenseQueries({
    queries: [roomDetailOptions(roomId, chat), threadOptions(roomId, chat)],
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
function canContinue(chat: ChatCache, roomId: number): boolean {
  const observed =
    (chat.queryClient
      .getQueryCache()
      .find({ queryKey: chat.keys.thread(roomId), exact: true })
      ?.getObserversCount() ?? 0) > 0;
  return (
    observed &&
    focusManager.isFocused() &&
    onlineManager.isOnline() &&
    !isSessionLost(chat)
  );
}

/**
 * 시작과 끝에 **지금의** 캐시를 읽는다. 요청을 기다리는 사이 보내기 응답(#265)이 메시지를 끼워 넣었을 수
 * 있어, 시작 때 본 값으로 덮으면 그게 지워진다. 그래서 끝날 때 다시 읽어 합친다.
 */
async function fetchThread(
  roomId: number,
  chat: ChatCache,
): Promise<ChatThread> {
  const key = chat.keys.thread(roomId);
  const read = () => chat.queryClient.getQueryData<ChatThread>(key);
  const path = CHAT_PATH.messages(roomId);
  const start = read();

  if (start === undefined) {
    const page = await guardSession(chat, () =>
      apiFetchBody<ChatMessagePage>(path, {
        searchParams: { size: MESSAGE_PAGE_SIZE },
      }),
    );
    return {
      messages: mergeMessages([], page.data),
      cursor: advanceCursor(0, page.data),
      failures: 0,
      nextPollMs: pollDelayMs(0, 0),
      /* 첫 장(인자 없음)의 hasMore는 "더 오래된 것이 남았다"(계약 meta 설명). polling은 이 칸을 안 바꾼다 */
      historyHasMore: page.meta.hasMore,
      historyFetched: false,
      historyStatus: "idle",
      /* 방 머리가 먼저 도착했으면 그 값은 캐시가 없어 합쳐지지 못했다 — 여기서 같이 합친다(어느 쪽이 먼저든 하나로) */
      counterpartRead: mergeCounterpartRead(
        page.meta.counterpartLastReadSequence,
        chat.queryClient.getQueryData<ChatRoomDetail>(chat.keys.room(roomId))
          ?.counterpartLastReadSequence,
      ),
    };
  }
  if (isSessionLost(chat)) return start;

  let cursor = start.cursor;
  let fetched: ChatMessage[] = [];
  /* 이번 polling이 받은 상대 읽음. 빈 응답에도 meta가 와서 새 메시지 없이 `읽음`만 옮길 수 있다(S3-2) */
  let counterpartRead: number | null = null;
  try {
    for (;;) {
      const page = await guardSession(chat, () =>
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
      if (!canContinue(chat, roomId)) break;
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

/* ------------------------------------------------------------------------
 * 이전 메시지(loop-08c S2). 자동(위로 스크롤)과 버튼이 같은 함수를 부른다
 * ------------------------------------------------------------------------ */

/**
 * 열린 방 패널이 등록하는 "합치기 직전" 콜백(§4-1 4). 위치는 **합치는 순간에** 잰다 — 누른 순간에 재면
 * 기다리는 동안 내려가거나 다른 대목으로 옮긴 사장을 누르기 전 자리로 끌고 간다(S2-16).
 * 방 하나에 패널 하나라 roomId로 찾는다. 방이 화면에 없으면 콜백이 없고 캐시에만 합친다(S2-15)
 */
const beforeOlderMerge = new Map<number, () => void>();

export function useBeforeOlderMerge(roomId: number, measure: () => void) {
  const ref = useRef(measure);
  useLayoutEffect(() => {
    ref.current = measure;
  });
  useEffect(() => {
    const call = () => ref.current();
    beforeOlderMerge.set(roomId, call);
    return () => {
      if (beforeOlderMerge.get(roomId) === call)
        beforeOlderMerge.delete(roomId);
    };
  }, [roomId]);
}

/** 이전 장 상태만 바꾼다. 캐시가 없으면(로그아웃이 지웠다) 새로 만들지 않는다 */
function setHistoryStatus(
  chat: ChatCache,
  roomId: number,
  historyStatus: HistoryStatus,
): void {
  chat.queryClient.setQueryData<ChatThread>(
    chat.keys.thread(roomId),
    (thread) =>
      thread === undefined || thread.historyStatus === historyStatus
        ? thread
        : { ...thread, historyStatus },
  );
}

/**
 * 이전 장 하나(`beforeSequence = 지금 가장 작은 sequence`, 50개). 실패는 던지지 않고 캐시의 `historyStatus`에 남긴다.
 *
 * - 한 번에 하나: `loading`이면 아무것도 안 한다. 확인과 표시가 같은 동기 구간이라 연타, 스크롤 연발이 못 끼어든다(S2-3)
 * - 오프라인이면 요청을 만들지 않고 바로 `failed`(§4-1 6). 온라인이 돼도 저절로 다시 안 묻는다(S2-17)
 * - 끝날 때의 캐시를 다시 읽어 합친다 — 기다리는 사이 polling, 보내기가 붙인 것을 안 지운다(S2-6, S2-7)
 * - 로그아웃을 넘어 온 응답은 `guardSession`이 버린다(S2-14). 상태 칸도 안 건드린다 — 지운 캐시가 되살아난다
 * - 401은 세션 끊김 흐름. 버튼은 끊김 표시가 잠근다(`historySlotOf`)
 * - **요청 토큰**(loop-08d S2-3, M9): 시작 때 세션 세대를 잡는다. 같은 계정 재로그인(`refreshChatSession`)과 로그아웃이
 *   세대를 올리고, 갱신은 "불러오는 중"을 되돌려 새 요청(B)을 받는다. 끝났을 때 세대가 다르면 이 요청은 대체된 것이라
 *   200, 500, 401 모두 캐시, `historyStatus`, 잠금, 합치기 직전 콜백을 안 건드린다 — 늦은 200이 끝까지 본 방에
 *   버튼을 되살리거나, 늦은 500이 B의 "불러오는 중"을 실패로 바꾸지 않게. 잠금(`markSessionLost`)은 세대를 안 바꾸므로
 *   잠긴 뒤 도착한 같은 세션의 200은 그대로 합친다(S2-5 ②)
 */
export async function fetchOlder(chat: ChatCache, roomId: number) {
  const key = chat.keys.thread(roomId);
  const start = chat.queryClient.getQueryData<ChatThread>(key);
  if (start === undefined || !start.historyHasMore) return;
  if (start.historyStatus === "loading" || isSessionLost(chat)) return;
  const oldest = start.messages[0]?.sequence;
  if (oldest === undefined) return;
  if (!onlineManager.isOnline()) {
    setHistoryStatus(chat, roomId, "failed");
    return;
  }
  setHistoryStatus(chat, roomId, "loading");
  const token = chatSessionEpoch();
  const replaced = () => chatSessionEpoch() !== token;
  let page: ChatMessagePage;
  try {
    page = await guardSession(chat, () =>
      apiFetchBody<ChatMessagePage>(CHAT_PATH.messages(roomId), {
        searchParams: { beforeSequence: oldest, size: MESSAGE_PAGE_SIZE },
      }),
    );
  } catch (error) {
    if (replaced() || error instanceof ChatStaleResponseError) return;
    setHistoryStatus(
      chat,
      roomId,
      isChatSessionLostError(error) ? "idle" : "failed",
    );
    return;
  }
  if (replaced()) return;
  const latest = chat.queryClient.getQueryData<ChatThread>(key);
  if (latest === undefined) return;
  beforeOlderMerge.get(roomId)?.();
  chat.queryClient.setQueryData<ChatThread>(key, mergeOlder(latest, page));
}
