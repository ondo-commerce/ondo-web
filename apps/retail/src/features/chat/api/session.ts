"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { useEffect } from "react";
import { chatKeys } from "./keys";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 채팅 화면의 "세션이 끊겼다" 상태 하나(01-plan §4-3, codex-meta 4-1). 도매 `chat/api/session.ts`와 짝이다.
 * 판정 코드만 소매 어휘(`UNAUTHORIZED`)다 — 도매는 `UNAUTHENTICATED`.
 *
 * 왜 따로 두나: 소매 `providers.tsx`는 `UNAUTHORIZED` ApiError를 받으면 `/login`으로 **전체 이동**한다.
 * 채팅은 입력창이 늘 떠 있어서 그 이동이 곧 쓰던 글을 버리는 것이다(loop-04 F1, D28). 그래서 방 화면 안의
 * 채팅 요청(방 머리, 메시지, 보내기)은 전부 `guardSession`을 거쳐 401을 `ChatSessionLostError`로 바꾼다.
 * 이 오류는 ApiError가 아니라 공용 처리가 지나친다 — providers는 고치지 않는다.
 *
 * 한 번 끊기면 polling 전부 멈춤(요청 0), 입력창 읽기 전용(쓴 글은 남는다), 블록 안 링크는 전체 이동
 * (서버의 `requireSession`이 `/login`으로 보낸다). 입구의 `createChatRoom`은 거치지 않는다 — 그 단계엔
 * 쓴 글이 없다(§4-1 2).
 *
 * 저장은 쿼리 캐시 한 칸(`chatKeys.session()`)이다. queryFn(React 밖)과 화면(React 안)이 같은 값을 본다.
 * 방 화면을 떠날 때 지운다 — 다시 로그인하고 클라이언트 이동으로 돌아왔을 때 잠긴 채로 남지 않게.
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

function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.code === RETAIL_ERROR_CODE.UNAUTHORIZED;
}

export function isSessionLost(queryClient: QueryClient): boolean {
  return queryClient.getQueryData<boolean>(chatKeys.session()) === true;
}

function markSessionLost(queryClient: QueryClient): void {
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
    if (isUnauthorized(error)) {
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
 * 방 화면을 떠날 때 끊김 표시를 지운다. 들어올 때 지우면 늦다 — 자식(방 블록)의 첫 요청이 부모 effect보다
 * 먼저 시작해 지난 표시를 보고 요청을 안 만든다(도매와 같다).
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
