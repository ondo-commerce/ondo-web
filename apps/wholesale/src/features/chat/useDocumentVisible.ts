"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * 탭이 보이는가. 읽음은 "사장이 볼 수 있을 때 그린 것"만 보낸다(S3-7). 숨김 중 쌓인 걸 복귀하자마자
 * 읽음 처리하려면 복귀 자체가 렌더를 일으켜야 해서(리뷰 F3) 값으로 구독한다. 서버 렌더는 보인다고 본다.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}
