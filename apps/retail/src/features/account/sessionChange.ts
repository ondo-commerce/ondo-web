import { SESSION_CHANNEL_NAME } from "./constants";
import { parseSessionBroadcast, type SessionBroadcast } from "./derive";

/**
 * 세션이 바뀔 때(로그아웃 누름, 로그인 성공) 같이 지울 것(loop-08c S7 — 채팅 쿼리 캐시). 도매 `account/store.ts`의
 * `onSignOut`과 같은 등록부다. 이 feature는 무엇을 지우는지 모른다 — `app/`이 끼워 넣는다(feature끼리 import 금지).
 *
 * 헤더 count와 알림 캐시(`clearHeaderSession`)는 `shared/`라 계정 화면이 직접 부르고, 여기는 feature 쪽 캐시만 받는다.
 */
const cleanups = new Set<() => void>();

/** 정리 하나를 건다. 돌려준 함수로 뺀다 */
export function onSessionChange(cleanup: () => void): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

/*
 * 탭 사이 세션 변경(loop-08c 리뷰 R8, 도매 `account/store.ts`와 같은 방식). 탭 2에서 로그아웃하고 B로 들어오면
 * 쿠키는 B인데 탭 1은 A의 방과 대화를 계속 그렸다. 로그인, 로그아웃 지점이 채널로 알리고, 로그인 화면을 그리고 있는
 * 탭(`AccountChip`이 떠 있는 탭)이 받아 자기 화면을 닫는다. 보낸 탭 자신은 받지 않는다(BroadcastChannel 규칙)
 */
let sessionChannel: BroadcastChannel | null = null;

function channel(): BroadcastChannel | null {
  if (sessionChannel !== null) return sessionChannel;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined")
    return null;
  try {
    sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  } catch {
    /* 채널을 못 열면 탭 사이 전달만 빠진다 — 이 탭의 로그인, 로그아웃은 그대로 돈다 */
    return null;
  }
  return sessionChannel;
}

/** 로그인 성공, 로그아웃 누름 지점이 부른다 */
export function broadcastSessionChange(message: SessionBroadcast): void {
  try {
    channel()?.postMessage(message);
  } catch {
    /* 알림이 실패해도 이 탭의 로그인, 로그아웃은 끝나야 한다 */
  }
}

/** 다른 탭의 세션 변경을 듣는다. 돌려준 함수로 뗀다 */
export function watchOtherTabSessions(
  onChange: (change: SessionBroadcast) => void,
): () => void {
  const target = channel();
  if (target === null) return () => {};
  const onMessage = (event: MessageEvent) => {
    const change = parseSessionBroadcast(event.data);
    if (change !== null) onChange(change);
  };
  target.addEventListener("message", onMessage);
  return () => target.removeEventListener("message", onMessage);
}

/**
 * 같은 소매처가 다른 탭에서 다시 로그인했을 때 이어 갈 것(Codex 메타 M1 — 채팅 세대 올림, 401 잠금 해제).
 * 지우지 않고 잇는다. 무엇을 잇는지는 이 feature가 모른다 — `app/`이 끼워 넣는다
 */
const refreshes = new Set<() => void>();

export function onSessionRefresh(refresh: () => void): () => void {
  refreshes.add(refresh);
  return () => {
    refreshes.delete(refresh);
  };
}

export function runSessionRefresh(): void {
  for (const refresh of refreshes) {
    try {
      refresh();
    } catch {
      /* 다음으로 */
    }
  }
}

/*
 * 로그아웃 갈래만(loop-08e §4-2 4). `runSessionChange`는 로그아웃과 로그인이 같이 부르는데, 쓰던 글은 둘에서 하는
 * 일이 다르다 — 로그아웃은 전부 지우고(D43 Q2), 로그인은 그 소매처 글만 남긴다(Q1 ①). 그래서 등록부를 나눈다.
 * 부르는 곳: 이 탭의 로그아웃 버튼, 다른 탭 알림으로 이 탭이 정리될 때(`AccountChip`). 401 끊김은 안 부른다(D28)
 */
const signOuts = new Set<() => void>();

export function onSignOut(cleanup: () => void): () => void {
  signOuts.add(cleanup);
  return () => {
    signOuts.delete(cleanup);
  };
}

export function runSignOut(): void {
  for (const cleanup of signOuts) {
    try {
      cleanup();
    } catch {
      /* 다음 정리로 */
    }
  }
}

/*
 * 로그인 성공 갈래(Q1 ①). 인자는 로그인 응답의 소매처 id — 모르면 null. 로그인 화면이 `runSessionChange`보다,
 * 이동보다 먼저 부른다 — 새 셸의 첫 입력창이 앞 소매처 글을 못 읽게(§4-2 5)
 */
const signIns = new Set<(retailerId: number | null) => void>();

export function onSignIn(
  cleanup: (retailerId: number | null) => void,
): () => void {
  signIns.add(cleanup);
  return () => {
    signIns.delete(cleanup);
  };
}

export function runSignIn(retailerId: number | null): void {
  for (const cleanup of signIns) {
    try {
      cleanup(retailerId);
    } catch {
      /* 다음 정리로 */
    }
  }
}

/** 로그아웃, 로그인 지점이 부른다. 정리 하나가 실패해도 나머지와 로그아웃 자체는 끝나야 한다 */
export function runSessionChange(): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      /* 다음 정리로 */
    }
  }
}
