"use client";

import { cn } from "@ondo/ui";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ChatRoomListView } from "./ChatRoomListView";
import { CHATS_HREF, PHONE_QUERY } from "../constants";
import { parseRoomId } from "../derive";

/**
 * 소매 채팅 한 화면(#455). 왼쪽 목록 + 오른쪽 방 — 목록에서 방을 눌러도 목록이 남고 오른쪽만 바뀐다(도매 `ChatView`와 같은 꼴).
 *
 * 주소는 그대로다(`/chats`, `/chats/{id}`). `app/(shop)/chats/layout.tsx`가 감싸서 방을 옮겨도 이 칸은 다시
 * 마운트되지 않는다 — 목록 스크롤과 받은 장이 남는다. 오른쪽(`children`)은 각 page가 채운다.
 *
 * 폰(≤40rem)은 한 칸만 보인다: `/chats`는 목록, `/chats/{id}`는 방. 방 머리의 `‹ 채팅 목록`이 돌아가는 길이다.
 * 폰에서 방이 열려 있으면 목록을 숨기는 데 그치지 않고 그리지 않는다 — 숨은 목록도 15초마다 다시 받는다.
 */
export function ChatSplitView({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const roomOpen = pathname !== CHATS_HREF;
  const selectedRoomId = roomOpen
    ? parseRoomId(pathname.slice(CHATS_HREF.length + 1))
    : null;
  const phone = useIsPhone();

  return (
    <div className="mx-auto flex max-w-wrap gap-2">
      <div
        className={cn(
          "w-md shrink-0 tablet:w-80 phone:w-full",
          roomOpen && "phone:hidden",
        )}
      >
        {phone && roomOpen ? null : (
          <ChatRoomListView
            selectedRoomId={selectedRoomId}
            roomOpen={roomOpen}
          />
        )}
      </div>
      <div className={cn("min-w-0 flex-1", !roomOpen && "phone:hidden")}>
        {children}
      </div>
    </div>
  );
}

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 서버와 첫 그리기는 넓은 화면으로 본다 — 폰이면 hydration 직후 한 번 더 그려 목록을 뺀다(그 사이도 CSS가 숨긴다) */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
