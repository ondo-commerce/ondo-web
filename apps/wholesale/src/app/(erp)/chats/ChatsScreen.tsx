"use client";

import { useSessionEmail } from "@/features/account";
import { ChatView } from "@/features/chat";

/**
 * 채팅 화면에 로그인 이메일을 넘긴다(loop-08b S3 쓰던 글 키). `page.tsx`는 `metadata` 때문에 서버 컴포넌트라
 * 훅을 못 부르고, chat이 account를 직접 읽으면 feature끼리 import다 — 그래서 여기서 잇는다.
 */
export function ChatsScreen() {
  const email = useSessionEmail();
  return <ChatView email={email} />;
}
