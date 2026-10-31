"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onSignOut } from "@/features/account";
import { clearChatCache, clearChatDrafts } from "@/features/chat";

/**
 * 로그아웃 때 채팅의 쓰던 글(loop-08b Q2 ①)과 채팅 쿼리 캐시(M1)를 지우게 잇는다. 그리는 것은 없다.
 *
 * 앱 맨 위(`Providers`)에 둔다(loop-08b M2). 로그아웃은 ERP 헤더만이 아니다 — 승인 대기 화면의 `로그인 화면으로`도
 * 세션을 푼다. 거기는 ERP 레이아웃 밖이라 ERP 레이아웃에만 이으면 그 길에선 등록부가 비어 쓰던 글이 남는다.
 * 채팅 화면이 떠 있을 때만 이으면 주문 탭에서 로그아웃하는 길이 빈다. 그래서 어느 화면이든 떠 있는 자리에 한 번.
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
