"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { fetchOlder, useBeforeOlderMerge } from "./api/queries";
import {
  isAtBottom,
  isTouchScrollUp,
  isUserScrollActive,
  nextUserScrollUntil,
  shouldAutoLoadOlder,
  type UserScrollEvent,
} from "./derive";
import type { ChatThread } from "./types";

/** 사장이 직접 위로 옮기는 키(§4-3 2-1). Tab은 아니다 — 포커스가 옮겨 가며 브라우저가 해 주는 스크롤이다 */
const SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

/** 이전 장을 합치기 직전에 잰 log(§4-3 4) */
interface OlderSnapshot {
  atBottom: boolean;
  /** 그때 첫 보이는 말풍선과 화면 위치. 붙인 뒤 이 말풍선을 같은 자리로 되돌린다 */
  anchor: { sequence: number; top: number } | null;
}

/** 첫 보이는 말풍선(아래 끝이 log 위끝보다 아래). 기준을 log top이 아니라 말풍선으로 잡는다 */
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
 * 열린 방 log의 스크롤(loop-08d S3). 도매 08c `useThreadScroll`의 복제에서 **이전 장 부분만** 가져왔다.
 * `새 메시지 N개`, 읽음 보류, 48px 바닥 따라가기, 리사이즈 순서(§4-4)는 다음 이슈(S4, #352)가 이 훅에 더한다.
 *
 * 1. 이전 장 자동 불러오기(§4-3 2-1). 사장이 **직접** 위로 스크롤했을 때만 — wheel(위로), 위로 끄는 터치(손가락 y가
 *    커짐), log 안 ↑ PageUp Home, 스크롤바 드래그(log 자체를 누른 채 생긴 scroll). 방을 열 때 바닥으로, 합친 뒤 위치
 *    복원, 새 메시지 따라가기는 프로그램 스크롤이라 트리거가 아니다. 입력과 그 직후 이어진 scroll만 본다
 *    (`USER_SCROLL_WINDOW_MS`). 합치거나 log 안으로 포커스가 들어오면 창을 닫는다(S3-8).
 * 2. 합칠 때 위치(§4-3 4). 합치는 순간 바닥(48px 안)이면 바닥, 아니면 그때 첫 보이는 말풍선을 같은 화면 위치로.
 * 3. 그 밖의 위치는 05a 그대로: 방을 열면 바닥, 새 줄이 붙거나 내가 보내면 바닥(알려진 한계, S4에서 바뀐다).
 *
 * 소매는 방마다 주소가 달라(`ChatBlock key={roomId}`) 방을 옮기면 이 훅이 새로 마운트된다 — 바닥에서 시작한다(S3-6 ③).
 */
export function useThreadScroll({
  roomId,
  thread,
  pendingCount,
  sessionLost,
}: {
  roomId: number;
  thread: ChatThread;
  /** 화면에 남은 보류 말풍선 수 */
  pendingCount: number;
  sessionLost: boolean;
}) {
  const queryClient = useQueryClient();
  const logRef = useRef<HTMLDivElement>(null);

  /* 사장 스크롤 창의 끝 시각. "한 번 휠을 썼다"를 계속 들고 있으면 그 뒤 Tab 포커스 스크롤까지 자동을 부른다 */
  const userScrollUntil = useRef(0);
  const markUserScroll = (event: UserScrollEvent) => {
    userScrollUntil.current = nextUserScrollUntil(
      userScrollUntil.current,
      event,
      performance.now(),
    );
  };
  const pointerOnLog = useRef(false);
  /* 지금 터치의 직전 손가락 y. 터치가 없으면 null */
  const touchY = useRef<number | null>(null);
  const olderSnapshot = useRef<OlderSnapshot | null>(null);

  const loadOlder = useCallback(() => {
    void fetchOlder(queryClient, roomId);
  }, [queryClient, roomId]);

  const maybeAutoLoad = () => {
    const log = logRef.current;
    if (log === null) return;
    if (
      shouldAutoLoadOlder({
        scrollTop: log.scrollTop,
        scrollHeight: log.scrollHeight,
        clientHeight: log.clientHeight,
        userScrolled: isUserScrollActive(
          userScrollUntil.current,
          performance.now(),
        ),
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

  /* 그린 뒤 그리기 전(layout)에 자리를 잡는다. 이전 장을 붙였으면 잰 대로(바닥이면 바닥, 아니면 그 말풍선 제자리).
     아니면 05a 규칙 그대로 — 처음 그릴 때, 말풍선 수나 보류 수가 바뀌면 바닥으로. 수가 그대로인 polling(상대 읽음만
     바뀜)은 안 움직인다. 이전 장은 수를 바꾸지만 위 갈래가 먼저 받아 바닥으로 끌지 않는다 */
  const drawn = useRef<{ messages: number; pending: number } | null>(null);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log === null) return;
    const prev = drawn.current;
    drawn.current = { messages: thread.messages.length, pending: pendingCount };
    const snapshot = olderSnapshot.current;
    olderSnapshot.current = null;
    if (snapshot !== null) {
      markUserScroll("merged");
      if (snapshot.atBottom) {
        log.scrollTop = log.scrollHeight;
        return;
      }
      const anchor = snapshot.anchor;
      const node =
        anchor === null
          ? null
          : log.querySelector(`[data-sequence="${anchor.sequence}"]`);
      if (anchor !== null && node !== null)
        log.scrollTop += node.getBoundingClientRect().top - anchor.top;
      return;
    }
    if (
      prev === null ||
      prev.messages !== thread.messages.length ||
      prev.pending !== pendingCount
    )
      log.scrollTop = log.scrollHeight;
    /* markUserScroll은 ref만 쓴다 */
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
      markUserScroll(pointerOnLog.current ? "input" : "scroll");
      maybeAutoLoad();
    },
    onWheel: (e: WheelEvent<HTMLDivElement>) => {
      if (e.deltaY >= 0) return;
      markUserScroll("input");
      /* 이미 맨 위면 scroll이 안 난다 — 여기서도 본다 */
      maybeAutoLoad();
    },
    /* 위로 스크롤하는 이동(손가락이 아래로)만 사장 위 스크롤이다. 직전 좌표와 비교한다 — 한 번의 터치 안에서
       방향을 바꿀 수 있고, 바뀐 구간부터 다시 본다(S3-8 ④) */
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    },
    onTouchMove: (e: TouchEvent<HTMLDivElement>) => {
      const y = e.touches[0]?.clientY;
      if (y === undefined) return;
      if (isTouchScrollUp(touchY.current, y)) markUserScroll("input");
      touchY.current = y;
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (SCROLL_UP_KEYS.has(e.key)) markUserScroll("input");
    },
    /* log 안으로 포커스가 들어오면(Tab, Shift+Tab) 뒤따르는 scroll은 브라우저 포커스 스크롤이다.
       휠 직후 바로 Tab을 눌러도 창 안에서 자동이 걸리지 않게 닫는다(S3-8 ③) */
    onFocus: () => {
      markUserScroll("focus");
    },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) pointerOnLog.current = true;
    },
  };

  return { logRef, logHandlers, loadOlder };
}
