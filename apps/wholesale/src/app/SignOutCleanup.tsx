"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onSignOut, watchOtherTabSessions } from "@/features/account";
import {
  clearChatCache,
  clearChatDrafts,
  refreshChatSession,
} from "@/features/chat";
import { clearNotificationCache } from "@/features/notification";

/**
 * 로그아웃 때 채팅의 쓰던 글(loop-08b Q2 ①), 채팅 쿼리 캐시(M1), 헤더 count와 알림 목록 캐시를 지우게 잇는다.
 * 그리는 것은 없다. 셋 다 지우지 않으면 다음 계정이 첫 응답 전까지 앞 사람 값을 본다.
 *
 * 앱 맨 위(`Providers`)에 둔다(loop-08b M2). 로그아웃은 ERP 헤더만이 아니다 — 승인 대기 화면의 `로그인 화면으로`도
 * 세션을 푼다. 거기는 ERP 레이아웃 밖이라 ERP 레이아웃에만 이으면 그 길에선 등록부가 비어 쓰던 글이 남는다.
 * 채팅 화면이 떠 있을 때만 이으면 주문 탭에서 로그아웃하는 길이 빈다. 그래서 어느 화면이든 떠 있는 자리에 한 번.
 *
 * 다른 탭의 로그아웃, 다른 계정 로그인도 여기서 듣는다(loop-08c 리뷰 R8). 받은 탭은 자기 세션을 닫고, 닫기가
 * 위 정리를 그대로 부른다 — 채팅 세대가 오르고 A의 캐시와 쓰던 글이 지워진 뒤 로그인 화면으로 간다.
 * 같은 계정이 다시 로그인한 것이면(Codex 메타 M2) 닫지 않고 채팅을 새 세션으로 잇는다(`refreshChatSession`) —
 * 401로 잠긴 입력창이 풀리고 쓰던 글, 보류 말풍선은 남는다.
 */
export function SignOutCleanup() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onSignOut(() => {
        clearChatDrafts();
        clearChatCache(queryClient);
        clearNotificationCache(queryClient);
      }),
    [queryClient],
  );
  useEffect(
    () => watchOtherTabSessions(() => refreshChatSession(queryClient)),
    [queryClient],
  );
  return null;
}
