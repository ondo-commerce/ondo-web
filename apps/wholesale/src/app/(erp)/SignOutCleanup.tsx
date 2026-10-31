"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onSignOut } from "@/features/account";
import { clearChatCache, clearChatDrafts } from "@/features/chat";

/**
 * 로그아웃 때 채팅의 쓰던 글(loop-08b Q2 ①)과 채팅 쿼리 캐시(M1)를 지우게 잇는다. 그리는 것은 없다.
 *
 * 채팅 화면이 아니라 ERP 레이아웃에 두는 이유: 로그아웃 버튼은 모든 ERP 화면 헤더에 있다. 채팅에서 글을 쓰고
 * 주문 탭으로 가서 로그아웃해도 그 글은 지워져야 한다 — 채팅 화면이 떠 있을 때만 이으면 그 길이 빈다.
 * 캐시도 같다. QueryClient는 앱 수명 내내 하나라 주문 탭에서 로그아웃해도 A의 대화가 5분(gcTime) 남는다.
 */
export function SignOutCleanup() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onSignOut(() => {
        clearChatDrafts();
        clearChatCache(queryClient);
      }),
    [queryClient],
  );
  return null;
}
