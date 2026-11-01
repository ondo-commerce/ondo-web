"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { CHAT_KEY_ROOT, chatKeysFor, type ChatCache } from "./keys";

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
