"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { navigationKeyOf } from "./derive";
import { useChatOutbox, type ChatOutbox } from "./useChatSend";
import type { ChatInquiry, PendingMessage } from "./types";

/**
 * `(shop)` 셸 수명의 채팅 칸(loop-08e §5-3). 셸 레이아웃(`app/(shop)/layout.tsx`)은 서버 컴포넌트라 `/me`를 읽어도
 * 방 화면(클라이언트)에 직접 못 넘긴다 — 이 provider가 `children`을 감싸 넘긴다.
 *
 * 둘을 든다. `retailerId`(쓰던 글 키, `draftKey`)와 보류 말풍선 outbox(#362, `useChatOutbox`). outbox가 여기 있어야
 * 방을 떠났다 와도 실패 말풍선이 남는다. provider 밖(셸 없는 화면)에서 읽으면 소매처를 모르는 것으로 보고(저장 안 함)
 * 보내기는 막힌다 — 방 화면은 늘 셸 안이다.
 *
 * 셋째로 이동 세대(#376, loop-08f §4-7)를 센다. 문의하기 입구가 누른 뒤 떠났는지 가르는 값이다.
 */
interface ChatShell {
  /** 셸 `/me`의 소매처 id. 모르면 null(스펙상 required 아님) */
  retailerId: number | null;
  outbox: ChatOutbox | null;
  /** 지금 이동 세대. 경로나 쿼리가 바뀔 때마다 1 오른다. provider 밖이면 늘 0 */
  navigationGeneration: () => number;
}

const ChatShellContext = createContext<ChatShell>({
  retailerId: null,
  outbox: null,
  navigationGeneration: () => 0,
});

/**
 * 경로나 쿼리가 바뀔 때마다 1 오르는 세대. 해시만 바뀌면 그대로다(`usePathname`, `useSearchParams`가 해시를 안
 * 본다). **ref로 들고 읽는 함수를 준다** — 값을 context에 그대로 실으면 이동마다 context가 바뀌어 셸 아래 방 화면
 * (memo)까지 다시 그린다. 이 값은 입구가 응답 때 한 번 읽으면 되고 화면에 안 그린다.
 * 올리는 때는 새 화면이 그려진 뒤(effect)다. 떠나는 입구의 언마운트는 그보다 먼저라 `mounted` 검사가 받는다.
 */
function useNavigationGeneration(): () => number {
  const key = navigationKeyOf(usePathname(), useSearchParams().toString());
  const generation = useRef(0);
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    generation.current += 1;
  }, [key]);
  return useCallback(() => generation.current, []);
}

export function ChatShellProvider({
  retailerId,
  children,
}: {
  retailerId: number | null;
  children: ReactNode;
}) {
  const outbox = useChatOutbox();
  const navigationGeneration = useNavigationGeneration();
  /* `router.refresh()`(담기 뒤)나 이동이 셸을 다시 그려도 값이 같으면 방 화면을 다시 그리지 않게 */
  const value = useMemo(
    () => ({ retailerId, outbox, navigationGeneration }),
    [retailerId, outbox, navigationGeneration],
  );
  return (
    <ChatShellContext.Provider value={value}>
      {children}
    </ChatShellContext.Provider>
  );
}

export function useChatShell(): ChatShell {
  return useContext(ChatShellContext);
}

const NO_PENDING: readonly PendingMessage[] = [];

/**
 * 방 화면 하나가 보는 outbox(자기 방 몫만). 함수는 방 번호를 묶어 돌려준다 — 같은 방이면 같은 함수라 입력창(memo)이
 * 다시 그려지지 않는다
 */
export function useRoomOutbox(roomId: number) {
  const { outbox } = useChatShell();
  const pending = outbox === null ? NO_PENDING : outbox.pendingOf(roomId);
  const sendTo = outbox?.send;
  const retryIn = outbox?.retry;
  const removeIn = outbox?.remove;
  const send = useCallback(
    (body: string, inquiry: ChatInquiry | null = null) =>
      sendTo?.(roomId, body, inquiry),
    [sendTo, roomId],
  );
  const retry = useCallback(
    (item: PendingMessage) => retryIn?.(roomId, item),
    [retryIn, roomId],
  );
  const remove = useCallback(
    (clientMessageId: string) => removeIn?.(roomId, clientMessageId),
    [removeIn, roomId],
  );
  return { pending, send, retry, remove };
}
