"use client";

import { useSyncExternalStore } from "react";

/**
 * 상품 폼의 세션 세대(#403). 같은 계정이 다른 탭에서 다시 로그인할 때마다 오른다.
 * 채팅의 `refreshChatSession`(08c M2)과 같은 꼴이다 — 모듈 변수 하나와 구독.
 *
 * 업로드 401로 잠긴 화면은 잠글 때의 값을 쥐고, 값이 오르면 잠금을 푼다(`isUploadLocked`).
 * 업로드 요청은 시작 때 값을 쥐고, 401이 와도 그 사이 값이 올랐으면 잠그지 않는다(`shouldLockOnAuth`).
 * 로그아웃이나 다른 계정 로그인은 여기를 지나지 않는다 — 그때는 화면이 통째로 사라진다(08c R8).
 */
let epoch = 0;
const listeners = new Set<() => void>();

export function productSessionEpoch(): number {
  return epoch;
}

/** 부르는 곳은 `app/SignOutCleanup.tsx`의 같은 계정 재로그인 갈래다(feature끼리 import 금지) */
export function refreshProductSession(): void {
  epoch += 1;
  for (const listener of listeners) listener();
}

export function subscribeProductSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 화면이 세대를 state처럼 읽는다. 서버 렌더에선 0 — 잠금은 클라이언트에서만 생긴다 */
export function useProductSessionEpoch(): number {
  return useSyncExternalStore(
    subscribeProductSession,
    productSessionEpoch,
    () => 0,
  );
}
