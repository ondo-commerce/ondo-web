"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { fetchOlder, useBeforeOlderMerge } from "./api/queries";
import { useChatCache } from "./api/scope";
import { isAtBottom, shouldAutoLoadOlder } from "./derive";
import type { ChatThread } from "./types";

/** 사장이 직접 위로 옮기는 키(§4-1 2-1). Tab은 아니다 — 포커스가 옮겨 가며 브라우저가 해 주는 스크롤이다 */
const SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

/** 이전 장을 합치기 직전에 잰 log(§4-1 4) */
interface OlderSnapshot {
  atBottom: boolean;
  /** 그때 첫 보이는 말풍선과 화면 위치. 붙인 뒤 이 말풍선을 같은 자리로 되돌린다 */
  anchor: { sequence: number; top: number } | null;
}

/** 첫 보이는 말풍선(아래 끝이 log 위끝보다 아래). 기준을 log top이 아니라 말풍선으로 잡는다(디자인 "개발에 넘길 것" 3) */
function firstVisibleBubble(log: HTMLElement): OlderSnapshot["anchor"] {
  const top = log.getBoundingClientRect().top;
  for (const node of log.querySelectorAll<HTMLElement>("[data-sequence]")) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > top)
      return { sequence: Number(node.dataset.sequence), top: rect.top };
  }
  return null;
}

/**
 * 열린 방 log의 스크롤(loop-08c S2). 셋을 맡는다.
 *
 * 1. 바닥 따라가기와 위치 보존(§4-2). "바닥"(48px 안)은 스크롤할 때마다 다시 잰다. 바닥에서 새 메시지가 오면
 *    따라 내려가고, 바닥이 아니면 스크롤을 안 건드린다. 내가 보내면(보류 말풍선이 늘면) 어디서든 바닥으로.
 * 2. 이전 장 자동 불러오기(D45, §4-1 2-1). 사장이 **직접** 위로 스크롤했을 때만 — wheel(위로), touchmove,
 *    log 안 ↑ PageUp Home, 스크롤바 드래그(log 자체를 누른 채 생긴 scroll). 방을 열 때 바닥으로, 합친 뒤 위치 복원,
 *    새 메시지 따라가기는 프로그램 스크롤이라 트리거가 아니다. 합치면 "직접 스크롤함"을 지운다(S2-20).
 * 3. `새 메시지 N개` 버튼(§4-2 3). 바닥을 떠날 때 그려진 가장 큰 sequence(`leftAt`)를 기억해, 그 뒤 붙은 줄이
 *    있으면 보인다. 누르면 바닥으로 가고 포커스는 입력창(결정 87).
 *
 * 부르는 쪽이 `key={roomId}`로 다시 마운트한다 — 방을 옮겼다 오면 바닥에서 시작하고 N을 새로 센다(S2-8).
 */
export function useThreadScroll({
  roomId,
  thread,
  maxSequence,
  pendingCount,
  sessionLost,
}: {
  roomId: number;
  thread: ChatThread;
  /** 그린 서버 메시지의 가장 큰 sequence */
  maxSequence: number;
  /** 화면에 남은 보류 말풍선 수. 늘면 내가 보낸 것이다 */
  pendingCount: number;
  sessionLost: boolean;
}) {
  const chat = useChatCache();
  const logRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLDivElement>(null);

  /* 스크롤 이벤트가 쓰는 값(렌더 사이에도 최신). 화면이 보는 값은 아래 state */
  const atBottomRef = useRef(true);
  const maxSequenceRef = useRef(maxSequence);
  useLayoutEffect(() => {
    maxSequenceRef.current = maxSequence;
  });
  const [view, setView] = useState<{
    atBottom: boolean;
    leftAt: number | null;
  }>({ atBottom: true, leftAt: null });
  /* 입력창 포커스 박자. 버튼을 누르거나, 포커스가 버튼에 있던 채 바닥에 닿으면 오른다 */
  const [composerFocusTick, setComposerFocusTick] = useState(0);

  const userScrolled = useRef(false);
  const pointerOnLog = useRef(false);
  const olderSnapshot = useRef<OlderSnapshot | null>(null);

  const measureBottom = () => {
    const log = logRef.current;
    if (log === null) return;
    const at = isAtBottom(log.scrollHeight, log.scrollTop, log.clientHeight);
    if (at === atBottomRef.current) return;
    atBottomRef.current = at;
    const jump = jumpRef.current;
    if (at && jump !== null && jump.contains(document.activeElement))
      setComposerFocusTick((t) => t + 1);
    setView({ atBottom: at, leftAt: at ? null : maxSequenceRef.current });
  };

  const loadOlder = useCallback(() => {
    void fetchOlder(chat, roomId);
  }, [chat, roomId]);

  const maybeAutoLoad = () => {
    const log = logRef.current;
    if (log === null) return;
    if (
      shouldAutoLoadOlder({
        scrollTop: log.scrollTop,
        scrollHeight: log.scrollHeight,
        clientHeight: log.clientHeight,
        userScrolled: userScrolled.current,
        historyHasMore: thread.historyHasMore,
        historyStatus: thread.historyStatus,
        sessionLost,
      })
    )
      loadOlder();
  };

  /* 합치는 순간(응답이 와서 캐시에 넣기 직전)에 잰다 — `fetchOlder`가 부른다 */
  useBeforeOlderMerge(roomId, () => {
    const log = logRef.current;
    if (log === null) return;
    olderSnapshot.current = {
      atBottom: isAtBottom(log.scrollHeight, log.scrollTop, log.clientHeight),
      anchor: firstVisibleBubble(log),
    };
  });

  /* 그린 뒤 그리기 전(layout)에 자리를 잡는다. 이전 장을 붙였으면 잰 대로(바닥이면 바닥, 아니면 그 말풍선 제자리),
     아니면 바닥일 때만 따라 내려간다. 내가 보냈으면 어디서든 바닥 */
  const prevPending = useRef(pendingCount);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log === null) return;
    const sent = pendingCount > prevPending.current;
    prevPending.current = pendingCount;
    const snapshot = olderSnapshot.current;
    olderSnapshot.current = null;
    if (snapshot !== null) userScrolled.current = false;
    if (sent || (snapshot?.atBottom ?? atBottomRef.current)) {
      log.scrollTop = log.scrollHeight;
      return;
    }
    const anchor = snapshot?.anchor;
    if (anchor === undefined || anchor === null) return;
    const node = log.querySelector(`[data-sequence="${anchor.sequence}"]`);
    if (node !== null)
      log.scrollTop += node.getBoundingClientRect().top - anchor.top;
  }, [thread.messages, pendingCount]);

  /* 스크롤바 드래그는 wheel이 안 난다 — log 자체를 누른 동안 생긴 scroll을 사용자 스크롤로 본다 */
  useEffect(() => {
    const release = () => {
      pointerOnLog.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  const logHandlers = {
    onScroll: () => {
      if (pointerOnLog.current) userScrolled.current = true;
      measureBottom();
      maybeAutoLoad();
    },
    onWheel: (e: WheelEvent<HTMLDivElement>) => {
      if (e.deltaY >= 0) return;
      userScrolled.current = true;
      /* 이미 맨 위면 scroll이 안 난다 — 여기서도 본다 */
      maybeAutoLoad();
    },
    onTouchMove: () => {
      userScrolled.current = true;
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (SCROLL_UP_KEYS.has(e.key)) userScrolled.current = true;
    },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) pointerOnLog.current = true;
    },
  };

  const jumpToBottom = () => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
    setComposerFocusTick((t) => t + 1);
  };

  return {
    logRef,
    jumpRef,
    logHandlers,
    loadOlder,
    jumpToBottom,
    composerFocusTick,
    atBottom: view.atBottom,
    leftAt: view.leftAt,
    /** 바닥을 떠난 뒤 새 줄이 붙었다(상대 말이 0개여도) */
    jumpVisible:
      !view.atBottom && view.leftAt !== null && maxSequence > view.leftAt,
  };
}
