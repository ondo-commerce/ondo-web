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
import type { ChatThread } from "../types";

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
 *
 * **시작 때 세션 세대를 잡는다**(loop-08c S7, 도매 `session.ts`와 같은 규칙). 로그아웃, 로그인이 캐시를 지운 뒤
 * 도착한 응답은 성공이든 401이든 버린다 — 앞 계정 polling의 늦은 401이 끊김 칸을 true로 만들면 다음에 로그인한
 * 소매처의 방이 첫 조회부터 잠긴다(S7-3).
 *
 * 성공 갈래 검사는 `cancelQueries`가 못 닿는 길을 막는다(QA F1). S7-2(늦은 messages 성공)는 취소와 삭제가 이미
 * 막는 길이라 이 줄의 근거가 아니다. 이 줄이 막는 것: 취소된 조회도 queryFn은 끝까지 돌아 그 안에서 다른 칸에
 * 쓴다 — 방 머리 queryFn은 받은 상대 읽음을 메시지 캐시에 합치는데, 지운 뒤 다음 계정이 같은 방 번호를 열어 다시
 * 생긴 칸에 앞 계정 값이 들어간다. mutation(읽음, 보내기)은 취소 대상이 아니라 결과가 부르는 쪽으로 그대로 간다.
 * 갈래는 `session.test.ts` "성공 갈래"가 가른다(이 줄을 지우면 실패한다).
 */
export async function guardSession<T>(
  queryClient: QueryClient,
  run: () => Promise<T>,
): Promise<T> {
  if (isSessionLost(queryClient)) throw new ChatSessionLostError();
  const account = accountEpoch;
  const session = sessionEpoch;
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (accountEpoch !== account) throw new ChatStaleResponseError();
    /* 같은 소매처 재로그인을 넘긴 401은 옛 쿠키의 답이다(M1) — 새 세션을 잠그지 않게 버린다. 다른 실패는 그대로(M6) */
    if (isUnauthorized(error) && sessionEpoch !== session)
      throw new ChatStaleResponseError();
    if (isUnauthorized(error)) {
      markSessionLost(queryClient);
      throw new ChatSessionLostError();
    }
    throw error;
  }
  if (accountEpoch !== account) throw new ChatStaleResponseError();
  return result;
}

/** 세션이 바뀌기 전에 떠난 채팅 응답. 지운 캐시에 아무것도 쓰지 않으려고 던진다. `ApiError`가 아니라 공용 처리가 무시한다 */
export class ChatStaleResponseError extends Error {
  constructor() {
    super("세션이 바뀌기 전에 떠난 채팅 응답");
    this.name = "ChatStaleResponseError";
  }
}

export function isChatStaleResponseError(
  error: unknown,
): error is ChatStaleResponseError {
  return error instanceof ChatStaleResponseError;
}

/**
 * 세대 검사만 한다(리뷰 R7 — 방 만들기). `guardSession`과 달리 401을 끊김으로 바꾸지 않는다: 입구의 방 만들기는
 * 쓴 글이 없어 지금 세대의 401은 공용 처리(`/login` 이동)가 맞다(01-plan §4-1 2). 하지만 A가 누른 요청의 응답이
 * 로그아웃, B 로그인 뒤에 오면 401이든 성공이든 버린다 — 401이면 B가 `/login`으로 튕기며 쓰던 글을 잃고,
 * 성공이면 부르는 쪽이 A의 방으로 옮긴다. 버리는 오류는 `ApiError`가 아니라 공용 처리가 지나친다
 */
export async function dropStaleSession<T>(run: () => Promise<T>): Promise<T> {
  const epoch = accountEpoch;
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (accountEpoch !== epoch) throw new ChatStaleResponseError();
    throw error;
  }
  if (accountEpoch !== epoch) throw new ChatStaleResponseError();
  return result;
}

/**
 * 계정 세대. 로그아웃, 로그인 때 오른다(`clearChatCache`). 요청은 시작 때 값을 쥐고, 끝났을 때 값이 바뀌었으면
 * 결과를 캐시와 화면에 넣지 않는다 — A가 띄운 요청의 응답이 B 로그인 뒤에 도착하는 경우
 */
let accountEpoch = 0;

/**
 * 세션 세대. 계정 세대가 오를 때와 같은 소매처 재로그인(`refreshChatSession`) 때 오른다(Codex 메타 M6, 도매와 같다).
 * 같은 소매처 갱신을 넘긴 요청의 결과는 그 계정 것이라 버리지 않는다 — 버리면 성공한 보내기가 실패 말풍선으로 보인다.
 * 갱신 뒤에 버려야 하는 건 늦은 401뿐이다(`guardSession`이 이 값을 그 갈래에만 쓴다).
 * 이전 장(`fetchOlder`, loop-08d S3)은 이 값을 요청 토큰으로 써서, 바뀌었으면 결과를 **전부** 버린다 — 갱신이
 * "불러오는 중"을 되돌려 새 요청이 그 자리를 이미 맡았다(도매 08d M9와 같다)
 */
let sessionEpoch = 0;

export function chatSessionEpoch(): number {
  return sessionEpoch;
}

/**
 * 세션이 바뀔 때(로그아웃 누름, 로그인 성공) 채팅 캐시를 전부 버린다. 날아가는 조회는 취소하고 지운다 — 취소된
 * 요청의 응답은 TanStack이 버린다. QueryClient는 루트(`providers.tsx`)라 클라이언트 이동으로는 안 지워진다.
 *
 * 로그인 때도 지우는 이유: 로그아웃은 서버 응답을 기다린 뒤 `/login`으로 옮긴다. 그 사이 방 화면이 떠 있어
 * polling이 A 쿠키로 한 번 더 받아 지운 칸을 다시 채울 수 있다. 로그인 순간엔 채팅 화면이 없다(`(account)`).
 * 헤더 count(`clearHeaderSession`)와 같은 두 지점이다. 부르는 곳은 `app/`의 연결부다(feature끼리 import 금지)
 */
export function clearChatCache(queryClient: QueryClient): void {
  accountEpoch += 1;
  sessionEpoch += 1;
  void queryClient.cancelQueries({ queryKey: chatKeys.all });
  queryClient.removeQueries({ queryKey: chatKeys.all });
}

/**
 * 같은 소매처가 다른 탭에서 다시 로그인했다(Codex 메타 M1, 도매 `refreshChatSession`과 같다). 캐시, 쓰던 글, 보류
 * 말풍선은 그대로 두고 새 쿠키로 잇는다.
 * - 세션 세대만 올린다(계정 세대는 그대로) — 재로그인 전에 떠난 늦은 401은 새 세션을 다시 잠그지 않게 버려지고
 *   (`guardSession`), 성공과 401 아닌 실패는 그대로 간다. 보류 보내기가 성공이면 정리, 실패면 실패 말풍선으로 끝난다(M6)
 * - 끊김 칸을 내린다 — 입력창 잠김이 풀린다
 * - 버려진 이전 장 요청이 남긴 "불러오는 중"을 되돌린다(loop-08d S3-9 ②) — 그대로 두면 이전 메시지 자리가 잠긴 채
 *   남는다. 옛 요청의 결과는 `fetchOlder`가 토큰(세션 세대)으로 버린다
 * - 날아가는 채팅 조회를 **취소한 뒤** 다시 부른다(M7). invalidate만 하면 TanStack이 날아가던 옛 요청을 그대로 쓴다 —
 *   그 요청이 옛 쿠키의 401로 끝나면 버려져 다시 조회가 없다. 끊긴 동안 멈춘 polling 간격도 다시 잡힌다
 * 부르는 곳은 `app/SessionChangeCleanup.tsx`다(feature끼리 import 금지)
 */
export function refreshChatSession(queryClient: QueryClient): void {
  sessionEpoch += 1;
  queryClient.setQueryData<boolean>(chatKeys.session(), false);
  queryClient.setQueriesData<ChatThread>(
    {
      queryKey: chatKeys.all,
      predicate: (query) => query.queryKey[1] === "thread",
    },
    (thread) =>
      thread !== undefined && thread.historyStatus === "loading"
        ? { ...thread, historyStatus: "idle" }
        : thread,
  );
  void queryClient
    .cancelQueries({ queryKey: chatKeys.all })
    .then(() => queryClient.invalidateQueries({ queryKey: chatKeys.all }));
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
