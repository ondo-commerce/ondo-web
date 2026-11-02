"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onSessionChange, onSessionRefresh } from "@/features/account";
import { clearChatCache, refreshChatSession } from "@/features/chat";

/**
 * 로그아웃, 로그인 때 채팅 쿼리 캐시를 지우게 잇는다(loop-08c S7, 도매 `app/SignOutCleanup.tsx`와 짝). 그리는 것은 없다.
 * 지우지 않으면 다음 계정이 앞 소매처의 대화 목록과 말풍선을 보고, 앞 계정의 늦은 401에 채팅이 잠긴다.
 *
 * 같은 소매처가 다른 탭에서 다시 로그인하면(Codex 메타 M1) 지우지 않고 잇는다(`refreshChatSession`) — 401로 잠긴
 * 입력창이 풀리고 쓰던 글, 보류 말풍선은 남는다.
 *
 * 앱 맨 위(`Providers`)에 둔다. 로그인 화면은 `(shop)` 셸 밖이라 셸에 두면 로그인 지점에서 등록부가 빈다.
 */
export function SessionChangeCleanup() {
  const queryClient = useQueryClient();
  useEffect(
    () => onSessionChange(() => clearChatCache(queryClient)),
    [queryClient],
  );
  useEffect(
    () => onSessionRefresh(() => refreshChatSession(queryClient)),
    [queryClient],
  );
  return null;
}
