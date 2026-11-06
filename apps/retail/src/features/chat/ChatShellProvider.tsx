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
import { subscribeNavigationStart } from "@/shared/navigation";
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
  /** 지금 이동 세대. 내부 링크 클릭, 뒤로/앞으로, 알린 프로그램 이동, 경로나 쿼리 커밋 때 오른다. provider 밖이면 늘 0 */
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
 *
 * 올리는 때가 둘이다(리뷰 R1).
 * 1. **이동 시작**: 셸 안 내부 링크 클릭(document capture), 뒤로/앞으로(`popstate`), 호출부가 알린 프로그램 이동
 *    (`shared/navigation`의 `notifyNavigationStart`, 지금은 헤더 검색 제출. codex-meta M1). 커밋 기준만 두면 "이동
 *    시작 ~ 새 화면 커밋" 사이(RSC 응답 시간)에 온 방 응답이 세대 같음 + 마운트로 `apply`돼 장바구니로 가던 사장을
 *    방으로 끌고 간다. 쿼리만 바뀌는 이동은 입구가 그대로 살아 있어 `mounted` 검사도 못 막는다.
 * 2. **새 화면 커밋**(경로나 쿼리 키가 바뀐 effect): 알리지 않는 프로그램 이동은 Next 공개 API로 시작 시점을 알 수
 *    없어 여기서만 잡힌다. 입구가 살아 있는 화면에서 알리지 않는 이동은 로그아웃 `replace(/login)`뿐인데, 세션이
 *    끝나 늦은 응답이 401(공용 처리)이라 틈이 결과를 안 바꾼다.
 * 링크 이동이면 두 번 오르는데 상관없다 — 입구는 "누를 때 세대와 같은가"만 본다.
 * 떠나는 입구가 언마운트되는 때는 커밋이라, 그 전에 온 응답은 `mounted`가 아니라 1의 세대가 받는다.
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
  useEffect(() => {
    const bumpIfLeaving = (to: URL) => {
      if (isSameDocumentKey(to)) return;
      generation.current += 1;
    };
    const onClick = (event: MouseEvent) => {
      const href = internalLinkHref(event);
      if (href !== null) bumpIfLeaving(href);
    };
    const onPopState = () => {
      /* popstate 때 location은 이미 새 주소다. 비교는 마지막으로 커밋한 키와 한다 — 해시만 오가는 뒤로가기는 그대로 */
      if (keyOfUrl(new URL(window.location.href)) !== lastKey.current)
        generation.current += 1;
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    /* 알리는 쪽은 이미 이동을 걸기로 정했다 — 같은 주소인지 따지지 않고 올린다 */
    const unsubscribe = subscribeNavigationStart(() => {
      generation.current += 1;
    });
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
    };
  }, []);
  return useCallback(() => generation.current, []);
}

/** `useSearchParams().toString()`과 같은 꼴로 만든 키(인코딩 차이로 같은 주소를 다르다고 보지 않게) */
function keyOfUrl(url: URL): string {
  return navigationKeyOf(
    url.pathname,
    new URLSearchParams(url.search).toString(),
  );
}

function isSameDocumentKey(to: URL): boolean {
  return keyOfUrl(to) === keyOfUrl(new URL(window.location.href));
}

/**
 * 이 클릭이 같은 탭의 내부 링크 이동이면 그 주소. 새 탭(수정키, 가운데 버튼, `target`), 다운로드, 다른 출처는 null —
 * 이 화면을 안 떠난다. 클릭 뒤 누가 `preventDefault`로 이동을 막아도 세대는 이미 올랐다(그 응답은 버리고 버튼만 켠다)
 */
function internalLinkHref(event: MouseEvent): URL | null {
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return null;
  if (!(event.target instanceof Element)) return null;
  const anchor = event.target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target !== "" || anchor.hasAttribute("download")) return null;
  const to = new URL(anchor.href, window.location.href);
  return to.origin === window.location.origin ? to : null;
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
