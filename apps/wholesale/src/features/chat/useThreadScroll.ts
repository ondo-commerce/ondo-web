"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { fetchOlder, useBeforeOlderMerge } from "./api/queries";
import { useChatCache } from "./api/scope";
import {
  bottomCheckHeight,
  isAtBottom,
  isTouchScrollUp,
  isUserScrollActive,
  nextUserScrollUntil,
  shouldAutoLoadOlder,
  type UserScrollEvent,
} from "./derive";
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
 * 1. 바닥 따라가기와 위치 보존(§4-2). "바닥"(48px 안)은 스크롤할 때와 log 크기가 바뀔 때 다시 잰다(크기가 바뀌면
 *    바닥이던 log는 먼저 바닥에 붙인다, 08h S1). 바닥에서 새 메시지가 오면
 *    따라 내려가고, 바닥이 아니면 스크롤을 안 건드린다. 내가 보내면(보류 말풍선이 늘면) 어디서든 바닥으로.
 * 2. 이전 장 자동 불러오기(D45, §4-1 2-1). 사장이 **직접** 위로 스크롤했을 때만 — wheel(위로), touchmove,
 *    log 안 ↑ PageUp Home, 스크롤바 드래그(log 자체를 누른 채 생긴 scroll). 방을 열 때 바닥으로, 합친 뒤 위치 복원,
 *    새 메시지 따라가기는 프로그램 스크롤이라 트리거가 아니다. 입력과 그 직후 이어진 scroll만 본다
 *    (`USER_SCROLL_WINDOW_MS`, 리뷰 R1). 합치거나 log 안으로 포커스가 들어오면 창을 닫는다(S2-20, S2-19 ③).
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

  /* 사장 스크롤 창의 끝 시각(R1). "한 번 휠을 썼다"를 계속 들고 있으면 그 뒤 Tab 포커스 스크롤까지 자동을 부른다 */
  const userScrollUntil = useRef(0);
  const markUserScroll = (event: UserScrollEvent) => {
    userScrollUntil.current = nextUserScrollUntil(
      userScrollUntil.current,
      event,
      performance.now(),
    );
  };
  const pointerOnLog = useRef(false);
  /* 지금 터치의 직전 손가락 y(M4). 터치가 없으면 null */
  const touchY = useRef<number | null>(null);
  const olderSnapshot = useRef<OlderSnapshot | null>(null);
  /* ResizeObserver가 마지막으로 본 log 높이(08h S1, 소매 #363). ResizeObserver가 없으면 null */
  const observedHeight = useRef<number | null>(null);

  /* `height`는 잴 때 쓸 log 높이. 기본은 지금 높이, scroll 이벤트는 `bottomCheckHeight`가 고른다 */
  const measureBottom = (height?: number) => {
    const log = logRef.current;
    if (log === null) return;
    const at = isAtBottom(
      log.scrollHeight,
      log.scrollTop,
      height ?? log.clientHeight,
    );
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
    if (snapshot !== null) markUserScroll("merged");
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

  /* log 크기가 바뀌면(입력창이 4줄 6줄로 늘거나 1,001자 오류, 세션 끊김 안내, 창 높이) ① 바꾸기 전 바닥이었으면(직전
     판정) 먼저 바닥에 붙이고 ② 그다음 다시 잰다(08h S1, 소매 디자인 결정 71과 같은 순서). 입력창은 log의 형제이고
     `shrink-0`이라 늘어난 만큼 log가 준다 — 재기만 하면 마지막 말풍선이 입력창 뒤로 가고, 6줄(+75px)이면 "바닥 아님"으로
     굳어 새 글을 안 따라가고 읽음을 보류했다(08h S1-1 재현).
     위를 읽던 중이면 ①을 건너뛴다 — log 위끝은 그대로라 보던 말풍선이 안 움직인다. ②가 있어 "바닥이 아닌데 따라가기"
     (리뷰 R2)는 그대로 막힌다. 자동 불러오기는 부르지 않는다. 여기서 본 높이를 `observedHeight`에 남긴다 — 이
     콜백보다 먼저 온 scroll은 그 높이로 잰다(`bottomCheckHeight`) */
  useEffect(() => {
    const log = logRef.current;
    if (log === null || typeof ResizeObserver === "undefined") return;
    observedHeight.current = log.clientHeight;
    const observer = new ResizeObserver(() => {
      observedHeight.current = log.clientHeight;
      if (atBottomRef.current) log.scrollTop = log.scrollHeight;
      measureBottom();
    });
    observer.observe(log);
    return () => observer.disconnect();
    /* measureBottom은 ref와 setState만 쓴다 — 방마다 한 번 건다(부르는 쪽이 key={roomId}로 다시 마운트) */
  }, []);

  const logHandlers = {
    onScroll: () => {
      markUserScroll(pointerOnLog.current ? "input" : "scroll");
      /* 사장 스크롤이 아니면 ResizeObserver가 마지막으로 본 높이로 잰다 — 크기 변경을 처리하기 전에 먼저 온
         scroll이 줄어든 높이로 "바닥 아님"을 쓰지 않게(`bottomCheckHeight`) */
      const log = logRef.current;
      if (log !== null)
        measureBottom(
          bottomCheckHeight({
            observedHeight: observedHeight.current,
            clientHeight: log.clientHeight,
            userScrolled: isUserScrollActive(
              userScrollUntil.current,
              performance.now(),
            ),
          }),
        );
      maybeAutoLoad();
    },
    onWheel: (e: WheelEvent<HTMLDivElement>) => {
      if (e.deltaY >= 0) return;
      markUserScroll("input");
      /* 이미 맨 위면 scroll이 안 난다 — 여기서도 본다 */
      maybeAutoLoad();
    },
    /* 위로 끈 이동만 사장 위 스크롤이다(M4). 직전 좌표와 비교한다 — 한 번의 터치 안에서 방향을 바꿀 수 있다 */
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
    /* log 안으로 포커스가 들어오면(Tab, Shift+Tab) 뒤따르는 scroll은 브라우저 포커스 스크롤이다(R1).
       휠 직후 바로 Tab을 눌러도 창 안에서 자동이 걸리지 않게 닫는다 */
    onFocus: () => {
      markUserScroll("focus");
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
