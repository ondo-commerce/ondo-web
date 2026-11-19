import type { Metadata } from "next";
import { ChatRoomListView } from "@/features/chat";

export const metadata: Metadata = { title: "채팅" };

/**
 * 소매 채팅 목록(loop-06 S2-4). 셸과 로그인 가드는 `(shop)/layout.tsx`.
 * 목록은 **브라우저에서** 받는다 — 목이 브라우저 MSW라 서버 fetch는 목에 닿지 않고, 검색에 걸릴 화면도 아니다
 * (방 화면 `chats/[roomId]`와 같은 이유).
 */
export default function Page() {
  return <ChatRoomListView />;
}
