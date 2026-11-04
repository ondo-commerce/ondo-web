"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { useEffect, useSyncExternalStore } from "react";
import { chatKeys } from "./keys";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import { ENTRY_TEXT } from "../constants";
import { sendFailureOf } from "../derive";
import type { ChatThread, SendFailure } from "../types";

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
  /**
   * 요청을 띄운 방 화면의 세대(`chatScreenEpoch`, loop-08d R1, 메타 M1). 그 화면을 떠난 뒤 도착한 401은 끊김 칸을 켜지
   * 않고 `ChatSessionLostError`만 던진다 — 잠금 범위는 방 화면 하나인데(기획 §4-1), 떠난 방의 늦은 401(방 머리, 첫 장,
   * polling, 읽음, 보내기, 담기, 이전 장)이 공용 칸을 켜면 지금 보는 다른 방이 잠긴다. 성공과 401 아닌 실패는 그대로라
   * 원래 방 캐시 반영과 실패 말풍선은 지금처럼 간다. 기본값은 부른 순간의 세대다. 이 함수를 부르는 곳은 전부 방 화면
   * 안이다(목록은 거치지 않는다). 이전 장은 표시를 바꾼 순간의 값을 넘긴다
   */
  screen: number = screenEpoch,
): Promise<T> {
  /* 로그아웃 응답 대기 구간(loop-08e §4-2 9) — 새 요청을 만들지 않는다. 계정이 바뀌는 중이라 계정 변경과 같은 갈래 */
  if (leaving) throw new ChatStaleResponseError("account");
  if (isSessionLost(queryClient)) throw new ChatSessionLostError();
  const account = accountEpoch;
  const session = sessionEpoch;
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (accountEpoch !== account) throw new ChatStaleResponseError("account");
    /* 같은 소매처 재로그인을 넘긴 401은 옛 쿠키의 답이다(M1) — 새 세션을 잠그지 않게 버린다. 다른 실패는 그대로(M6) */
    if (isUnauthorized(error) && sessionEpoch !== session)
      throw new ChatStaleResponseError("session");
    if (isUnauthorized(error)) {
      if (screen === screenEpoch) markSessionLost(queryClient);
      throw new ChatSessionLostError();
    }
    throw error;
  }
  if (accountEpoch !== account) throw new ChatStaleResponseError("account");
  return result;
}

/**
 * 버린 응답이 왜 버려졌나(loop-08e §4-1 판정 세대). 부르는 쪽이 하는 일이 다르다.
 * - `account`: 계정이 바뀌었다(로그아웃, 다른 계정 로그인, 로그아웃 대기). 아무 데도 안 쓴다
 * - `session`: 같은 소매처 재로그인을 넘긴 옛 쿠키의 401. 그 계정 것이라 보내기는 실패 R+D, 방 만들기는 입구 문구
 */
export type StaleReason = "account" | "session";

/** 세션이 바뀌기 전에 떠난 채팅 응답. 지운 캐시에 아무것도 쓰지 않으려고 던진다. `ApiError`가 아니라 공용 처리가 무시한다 */
export class ChatStaleResponseError extends Error {
  readonly reason: StaleReason;
  constructor(reason: StaleReason) {
    super("세션이 바뀌기 전에 떠난 채팅 응답");
    this.name = "ChatStaleResponseError";
    this.reason = reason;
  }
}

export function isChatStaleResponseError(
  error: unknown,
): error is ChatStaleResponseError {
  return error instanceof ChatStaleResponseError;
}

/**
 * 버려진 방 만들기 응답에 입구가 띄울 문구(loop-08e S2-8, 리뷰 R11). 같은 소매처 재로그인을 넘긴 401(`session`)만 "다시
 * 눌러 주세요"이고, 계정이 바뀐 뒤 응답(`account`)은 지금 사람 것이 아니라 아무것도 안 띄운다. 입구 컴포넌트와
 * unit이 같은 함수를 탄다 — 다른 계정 로그인은 이 탭을 바로 전체 이동시켜 e2e로는 도착 뒤 화면을 못 본다(MSW가
 * 이동 시작 때 꺼진다, 실측)
 */
export function staleEntryText(error: ChatStaleResponseError): string | null {
  return error.reason === "session" ? ENTRY_TEXT.relogin : null;
}

/**
 * 세대 검사만 한다(리뷰 R7 — 방 만들기). `guardSession`과 달리 401을 끊김으로 바꾸지 않는다: 입구의 방 만들기는
 * 쓴 글이 없어 지금 세대의 401은 공용 처리(`/login` 이동)가 맞다(01-plan §4-1 2). 하지만 A가 누른 요청의 응답이
 * 로그아웃, B 로그인 뒤에 오면 401이든 성공이든 버린다 — 401이면 B가 `/login`으로 튕기며 쓰던 글을 잃고,
 * 성공이면 부르는 쪽이 A의 방으로 옮긴다. 버리는 오류는 `ApiError`가 아니라 공용 처리가 지나친다.
 *
 * 세션 세대도 본다(loop-08e Q6, S2-8). 같은 소매처가 다른 탭에서 다시 로그인한 뒤 도착한 401은 옛 쿠키의 답이다 —
 * 그대로 던지면 공용 처리가 이미 새 세션인 사장을 `/login`으로 보내고 보던 상품 화면을 잃는다. `session` 갈래로
 * 던져 부르는 쪽이 "다시 눌러 주세요"를 띄운다. 같은 소매처 갱신 뒤 성공은 그 계정 방이라 그대로 돌려준다
 */
export async function dropStaleSession<T>(run: () => Promise<T>): Promise<T> {
  if (leaving) throw new ChatStaleResponseError("account");
  const epoch = accountEpoch;
  const session = sessionEpoch;
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (accountEpoch !== epoch) throw new ChatStaleResponseError("account");
    if (isUnauthorized(error) && sessionEpoch !== session)
      throw new ChatStaleResponseError("session");
    throw error;
  }
  if (accountEpoch !== epoch) throw new ChatStaleResponseError("account");
  return result;
}

/**
 * 보내기 결과 갈래(loop-08e S2-13, §4-1 판정 세대). 셸 outbox가 보낼 때 쥔 계정 세대와 지금 값을 비교해 넘긴다.
 * - `drop`: 계정이 바뀌었다 — 성공이든 실패든 아무 데도 안 쓴다(다음 소매처 화면에 앞 소매처 말풍선 0)
 * - 같은 계정 갱신을 넘긴 401(`session` 갈래 stale) → `server`(R+D, 잠금 0). 새 세션을 다시 잠그지 않는다
 * - `ChatSessionLostError`(지금 세션 401, 떠난 화면의 401) → `session`. `다시 보내기`는 잠금으로만 가린다(`canRetrySend`)
 * - 그 밖은 `sendFailureOf`(500, 403, 404 → server, 네트워크 → offline)
 * 성공 갈래는 여기 없다 — 계정이 같으면 `guardSession`이 결과를 돌려준다(같은 계정 갱신 뒤 201은 그대로 쓴다)
 */
export function sendOutcomeOf(
  error: unknown,
  accountChanged: boolean,
): SendFailure | "drop" {
  if (accountChanged) return "drop";
  if (isChatStaleResponseError(error))
    return error.reason === "account" ? "drop" : "server";
  if (isChatSessionLostError(error)) return "session";
  return sendFailureOf(error);
}

/** 지금 계정 세대. 셸 outbox가 보낼 때 쥐고 결과 때 비교한다 */
export function chatAccountEpoch(): number {
  return accountEpoch;
}

/*
 * 로그아웃 응답 대기 구간(loop-08e §4-2 9, S2-15). `AccountChip.logout`은 정리 → 서버 로그아웃 응답 → 이동 순이라
 * 그 사이 셸과 방 화면이 살아 있다. 채팅은 "나가는 중"이다: 방 조회, polling, 읽음, 보내기, 담기, 방 만들기 새 요청 0,
 * 입력창 읽기 전용, 보류 말풍선 비움. 끊김 안내는 안 띄운다(로그인이 끊긴 게 아니다).
 * 켜는 곳: 로그아웃 갈래(`runSignOut`). 끄는 곳: 로그인 성공 갈래(`runSignIn`) — 로그아웃은 클라이언트 이동이라 이
 * 모듈 값이 다음 로그인까지 산다. 다른 탭 정리 갈래는 전체 이동이라 모듈이 새로 뜬다
 */
let leaving = false;
const leavingListeners = new Set<() => void>();

function setLeaving(next: boolean): void {
  if (leaving === next) return;
  leaving = next;
  for (const listener of leavingListeners) listener();
}

export function beginChatSignOut(): void {
  setLeaving(true);
}

export function endChatSignOut(): void {
  setLeaving(false);
}

export function isChatLeaving(): boolean {
  return leaving;
}

/** "나가는 중"이 바뀔 때 부른다. 돌려준 함수로 뗀다 */
export function subscribeChatLeaving(listener: () => void): () => void {
  leavingListeners.add(listener);
  return () => {
    leavingListeners.delete(listener);
  };
}

/** 화면이 보는 "나가는 중". 서버 렌더에선 늘 false */
export function useChatLeaving(): boolean {
  return useSyncExternalStore(subscribeChatLeaving, isChatLeaving, () => false);
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
 * 방 화면 세대(loop-08d R1, 메타 M1). 방 화면을 떠날 때마다 오른다(`leaveChatScreen`). 소매 잠금 범위가 방 화면 하나라서,
 * 화면을 넘겨 도착한 방 요청의 401이 다음 화면을 잠그지 않게 `guardSession`의 `screen`으로 쓴다
 */
let screenEpoch = 0;

export function chatScreenEpoch(): number {
  return screenEpoch;
}

/**
 * 잠긴 채 떠난 방(loop-08e R9). 떠나면 잠금은 풀리지만 다시 열 때 확인 요청 1회가 나가야 한다(기획 §4-1 잠금 범위,
 * S2-7 ②). 방 머리는 `staleTime: Infinity`, 메시지도 기본 staleTime 안이라 바로 다시 열면 아무 요청도 안 나가 잠금이
 * 그냥 풀렸다. 그래서 잠긴 채 떠난 방을 적어 두고 다시 열 때 확인을 강제한다(`useRoomQueries`)
 */
const unconfirmedRooms = new Set<number>();

/** 방 화면을 떠났다. 잠겨 있었으면 그 방을 확인 대상으로 적고, 끊김 칸을 내리고 화면 세대를 올린다 */
export function leaveChatScreen(
  queryClient: QueryClient,
  roomId?: number,
): void {
  if (roomId !== undefined && isSessionLost(queryClient))
    unconfirmedRooms.add(roomId);
  screenEpoch += 1;
  queryClient.setQueryData<boolean>(chatKeys.session(), false);
}

/** 그 방이 잠긴 채 떠나 아직 확인 안 된 방인가. 렌더 중에 읽는다(지우지 않는다) */
export function isUnconfirmedRoom(roomId: number): boolean {
  return unconfirmedRooms.has(roomId);
}

/** 확인 요청이 성공했다. 401이면 지우지 않는다 — 다시 잠기고, 다시 떠날 때도 적혀 있다 */
export function confirmRoom(roomId: number): void {
  unconfirmedRooms.delete(roomId);
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
  unconfirmedRooms.clear();
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
  /* 새 쿠키로 아래에서 전부 다시 묻는다 — 따로 확인할 방이 없다 */
  unconfirmedRooms.clear();
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
 * `roomId`가 바뀌어도 떠난 것으로 본다 — 같은 컴포넌트가 다른 방으로 다시 그려질 때도 화면 세대가 올라야 한다(R1).
 */
export function useResetChatSessionOnLeave(roomId: number): void {
  const queryClient = useQueryClient();
  useEffect(
    () => () => leaveChatScreen(queryClient, roomId),
    [queryClient, roomId],
  );
}
