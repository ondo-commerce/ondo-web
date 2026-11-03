"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * `(shop)` 셸 수명의 채팅 칸(loop-08e §5-3). 셸 레이아웃(`app/(shop)/layout.tsx`)은 서버 컴포넌트라 `/me`를 읽어도
 * 방 화면(클라이언트)에 직접 못 넘긴다 — 이 provider가 `children`을 감싸 넘긴다.
 *
 * 지금은 `retailerId`(쓰던 글 키, `draftKey`) 하나다. 보류 말풍선(#362)도 셸 수명이라 같은 provider에 얹는다.
 * provider 밖(셸 없는 화면)에서 읽으면 소매처를 모르는 것으로 본다 — 저장하지 않는다.
 */
interface ChatShell {
  /** 셸 `/me`의 소매처 id. 모르면 null(스펙상 required 아님) */
  retailerId: number | null;
}

const ChatShellContext = createContext<ChatShell>({ retailerId: null });

export function ChatShellProvider({
  retailerId,
  children,
}: {
  retailerId: number | null;
  children: ReactNode;
}) {
  /* `router.refresh()`(담기 뒤)가 셸을 다시 그려도 값이 같으면 방 화면을 다시 그리지 않게 */
  const value = useMemo(() => ({ retailerId }), [retailerId]);
  return (
    <ChatShellContext.Provider value={value}>
      {children}
    </ChatShellContext.Provider>
  );
}

export function useChatShell(): ChatShell {
  return useContext(ChatShellContext);
}
