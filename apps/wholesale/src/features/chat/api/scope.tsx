"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { CHAT_KEY_ROOT, chatKeysFor, type ChatCache } from "./keys";
import type { ChatThread } from "../types";

/**
 * 채팅 화면이 보는 계정(loop-08b M1). 키 팩토리를 계정마다 하나 만들어 아래 훅들에 내린다.
 * 화면 밖 함수(queryFn 안의 `guardSession` 등)는 훅이 쥐여 준 `ChatCache`를 받는다.
 */
const ChatCacheContext = createContext<ChatCache | null>(null);

export function ChatAccountScope({
  account,
  children,
}: {
  /** 로그인 이메일(소문자). 판정 전이면 빈 문자열 — 그때는 어느 계정과도 키가 안 겹친다 */
  account: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const value = useMemo(
    () => ({ queryClient, keys: chatKeysFor(account) }),
    [queryClient, account],
  );
  return <ChatCacheContext value={value}>{children}</ChatCacheContext>;
}

export function useChatCache(): ChatCache {
  const value = useContext(ChatCacheContext);
  if (value === null)
    throw new Error("채팅 훅은 ChatAccountScope 안에서만 쓴다");
  return value;
}

/**
 * 로그아웃 세대. 로그아웃마다 오른다. 보내기처럼 화면 밖에서 늦게 끝나는 일은 시작 때 값을 쥐고, 끝났을 때
 * 값이 바뀌었으면 결과를 캐시와 화면에 넣지 않는다 — A가 보낸 응답이 B 로그인 뒤에 도착하는 경우
 */
let signOutEpoch = 0;

export function chatEpoch(): number {
  return signOutEpoch;
}

/**
 * 로그아웃 때 채팅 캐시를 전부 버린다(계정 무관). 날아가는 조회는 취소하고 지운다 — 취소된 요청의 응답은
 * TanStack이 버린다. 부르는 곳은 `app/`의 로그아웃 연결부다(feature끼리 import 금지)
 */
export function clearChatCache(queryClient: QueryClient): void {
  signOutEpoch += 1;
  void queryClient.cancelQueries({ queryKey: CHAT_KEY_ROOT });
  queryClient.removeQueries({ queryKey: CHAT_KEY_ROOT });
}

/**
 * 같은 계정이 다른 탭에서 다시 로그인했다(Codex 메타 M2). 캐시와 쓰던 글, 보류 말풍선은 그대로 두고 새 쿠키로 이어 간다.
 * - 세대를 올린다 — 재로그인 전에 떠난 요청의 늦은 401이 새 세션을 다시 잠그지 않게 버려진다(`guardSession`)
 * - 끊김 칸을 전부 내린다 — 입력창 잠김이 풀리고 polling이 다시 돈다
 * - 버려진 이전 장 요청이 남긴 "불러오는 중"을 되돌린다 — 그대로 두면 이전 메시지 자리가 잠긴 채 남는다
 * - 채팅 조회를 다시 부른다. 끊긴 동안 멈춘 polling 간격은 칸 값만 바꿔서는 다시 안 잡힌다
 * 부르는 곳은 `app/SignOutCleanup.tsx`다(feature끼리 import 금지)
 */
export function refreshChatSession(queryClient: QueryClient): void {
  signOutEpoch += 1;
  const chatQuery = (index: number, value: string) => ({
    queryKey: CHAT_KEY_ROOT,
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[index] === value,
  });
  queryClient.setQueriesData<boolean>(chatQuery(2, "session"), false);
  queryClient.setQueriesData<ChatThread>(chatQuery(2, "thread"), (thread) =>
    thread !== undefined && thread.historyStatus === "loading"
      ? { ...thread, historyStatus: "idle" }
      : thread,
  );
  void queryClient.invalidateQueries({ queryKey: CHAT_KEY_ROOT });
}
