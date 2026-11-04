"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  onSessionChange,
  onSessionRefresh,
  onSignIn,
  onSignOut,
} from "@/features/account";
import {
  beginChatSignOut,
  clearChatCache,
  clearChatDrafts,
  endChatSignOut,
  keepChatDraftsOf,
  refreshChatSession,
} from "@/features/chat";

/**
 * 로그아웃, 로그인 때 채팅 쿼리 캐시를 지우게 잇는다(loop-08c S7, 도매 `app/SignOutCleanup.tsx`와 짝). 그리는 것은 없다.
 * 지우지 않으면 다음 계정이 앞 소매처의 대화 목록과 말풍선을 보고, 앞 계정의 늦은 401에 채팅이 잠긴다.
 *
 * 쓰던 글(loop-08e §4-2 4 5)은 갈래마다 다르다. 로그아웃(이 탭 버튼, 다른 탭 알림으로 정리)은 전부 지우고,
 * 로그인 성공은 들어온 소매처 글만 남긴다. 401 끊김은 둘 다 아니라 남는다(D28).
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
  useEffect(() => onSignOut(clearChatDrafts), []);
  useEffect(() => onSignIn(keepChatDraftsOf), []);
  /* 로그아웃 응답 대기 구간(loop-08e S2-15). 누른 순간 채팅은 "나가는 중"(보류 말풍선 비움, 새 요청 0), 다음 로그인에서 끝 */
  useEffect(() => onSignOut(beginChatSignOut), []);
  useEffect(() => onSignIn(endChatSignOut), []);
  useEffect(
    () => onSessionRefresh(() => refreshChatSession(queryClient)),
    [queryClient],
  );
  return null;
}
