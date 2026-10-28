"use client";

import { queryOptions, useQueries } from "@tanstack/react-query";
import { apiFetch, apiFetchBody } from "@ondo/api";
import { chatKeys } from "./keys";
import { chatMockReady } from "./mockWorker";
import { MESSAGE_PAGE_SIZE } from "../constants";
import { advanceCursor, mergeMessages } from "../derive";
import type { ChatMessagePage, ChatRoomDetail, ChatThread } from "../types";

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
 * 채팅 쿼리는 전부 `retry: false`다. 앱 기본은 5xx와 ApiError가 아닌 오류를 두 번 더 보내서, 첫 조회
 * 실패가 1초, 2초 뒤에야 화면에 온다. 다시 시도는 사장이 누른다.
 */

function roomOptions(roomId: number) {
  return queryOptions({
    queryKey: chatKeys.room(roomId),
    queryFn: async () => {
      await chatMockReady();
      return apiFetch<ChatRoomDetail>(CHAT_PATH.room(roomId));
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** 열린 방의 최신 50개. 이어 받기(polling)는 #285 */
function threadOptions(roomId: number) {
  return queryOptions({
    queryKey: chatKeys.thread(roomId),
    queryFn: async (): Promise<ChatThread> => {
      await chatMockReady();
      const page = await apiFetchBody<ChatMessagePage>(
        CHAT_PATH.messages(roomId),
        { searchParams: { size: MESSAGE_PAGE_SIZE } },
      );
      return {
        messages: mergeMessages([], page.data),
        cursor: advanceCursor(0, page.data),
        failures: 0,
        nextPollMs: 0,
      };
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * 방 머리와 메시지를 **같이** 부른다(폭포 없이). Suspense를 쓰지 않는 이유: 소매엔 도매의
 * `QueryBoundary`가 없고, 블록이 로딩, 없는 방, 실패를 한 패널 안에서 직접 가른다.
 */
export function useRoomQueries(roomId: number) {
  const [room, thread] = useQueries({
    queries: [roomOptions(roomId), threadOptions(roomId)],
  });
  return { room, thread };
}
