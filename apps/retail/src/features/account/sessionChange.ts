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
