import type { ReactNode } from "react";
import { ChatSplitView } from "@/features/chat";

/**
 * `/chats`와 `/chats/{id}`를 한 화면으로(#455). 레이아웃이라 방을 옮겨도 왼쪽 목록이 다시 마운트되지 않는다.
 */
export default function ChatsLayout({ children }: { children: ReactNode }) {
  return <ChatSplitView>{children}</ChatSplitView>;
}
