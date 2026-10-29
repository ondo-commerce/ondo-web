"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { useEffect } from "react";
import { chatKeys } from "./keys";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 채팅 화면의 "세션이 끊겼다" 상태 하나(리뷰 F1).
 *
 * 왜 따로 두나: 채팅은 목록 15초, 열린 방 3초 polling과 읽음, 보내기가 동시에 돈다. 그중 **하나라도** 401을
 * 앱 공용 처리(`providers.tsx` QueryCache → `/login` 전체 이동)로 넘기면 쓰던 글이 사라진다(D28).
 * 그래서 채팅 요청의 401은 전부 여기로 모으고 공용 처리로 보내지 않는다. 한 번 끊기면
 * - polling 전부 멈춤(요청 0), 읽음 안 보냄
 * - 보내기와 입력창 잠김(읽기 전용, 쓴 글은 남는다)
 * - 다른 방으로 옮겨도 그대로 — 방이 아니라 채팅 화면 전체의 상태다
 *
 * 저장은 쿼리 캐시 한 칸(`chatKeys.session()`)이다. queryFn(React 밖)과 화면(React 안)이 같은 값을 본다.
 * 채팅 화면을 떠날 때 지운다(`useResetChatSessionOnLeave`) — 다시 로그인하고 클라이언트 이동으로
 * 돌아왔을 때 잠긴 채로 남지 않게.
 */

/** 채팅 요청이 401을 받았거나, 이미 끊긴 뒤라 요청을 만들지 않았다. `ApiError`가 아니라 공용 401 처리가 무시한다 */
export class ChatSessionLostError extends Error {
  constructor() {
    super("채팅 세션이 끊겼습니다");
    this.name = "ChatSessionLostError";
  }
}

export function isChatSessionLostError(
  error: unknown,
): error is ChatSessionLostError {
  return error instanceof ChatSessionLostError;
}

function isUnauthenticated(error: unknown): boolean {
  return (
    isApiError(error) && error.code === WHOLESALE_ERROR_CODE.UNAUTHENTICATED
  );
}

export function isSessionLost(queryClient: QueryClient): boolean {
  return queryClient.getQueryData<boolean>(chatKeys.session()) === true;
}

export function markSessionLost(queryClient: QueryClient): void {
  queryClient.setQueryData<boolean>(chatKeys.session(), true);
}

/**
 * 채팅 요청 하나를 감싼다. 이미 끊겼으면 **요청을 만들지 않고** 던지고, 401이면 끊김으로 표시하고 던진다.
 * 던지는 건 `ChatSessionLostError`라 공용 처리가 `/login`으로 보내지 않는다.
 */
export async function guardSession<T>(
  queryClient: QueryClient,
  run: () => Promise<T>,
): Promise<T> {
  if (isSessionLost(queryClient)) throw new ChatSessionLostError();
  try {
    return await run();
  } catch (error) {
    if (isUnauthenticated(error)) {
      markSessionLost(queryClient);
      throw new ChatSessionLostError();
    }
    throw error;
  }
}

/** 화면이 보는 값. 요청을 내지 않는 캐시 칸이다(`queryFn`은 쓰지 않는 기본값) */
export function useChatSessionLost(): boolean {
  const { data } = useQuery({
    queryKey: chatKeys.session(),
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  });
  return data;
}

/**
 * 채팅 화면을 떠날 때 끊김 표시를 지운다. 들어올 때 지우면 늦다 — 자식(목록 패널)의 첫 요청이 부모 effect보다
 * 먼저 시작해 지난 표시를 보고 요청을 안 만든다.
 */
export function useResetChatSessionOnLeave(): void {
  const queryClient = useQueryClient();
  useEffect(
    () => () => {
      queryClient.setQueryData<boolean>(chatKeys.session(), false);
    },
    [queryClient],
  );
}
