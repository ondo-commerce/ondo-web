/**
 * 열쇠(`owner`) 하나에 타이머 하나만 도는 `setInterval`(메타 리뷰 M5). 같은 QueryClient에서 목록 훅이 둘 마운트되면
 * 훅마다 타이머를 걸어 15초에 갱신이 두 번 나갔다. 구독 수를 세서 첫 구독자가 타이머를 걸고, 마지막 구독자가
 * 떠날 때 지운다. 뒤에 붙은 구독자는 이미 도는 주기(시작 시각)를 그대로 따른다.
 *
 * `tick`은 첫 구독자 것을 쓴다 — 같은 열쇠의 구독자는 같은 일을 하는 같은 훅이라 어느 것이든 같다.
 */
interface Shared {
  subscribers: number;
  timer: ReturnType<typeof setInterval>;
}

const timers = new WeakMap<object, Shared>();

/** 구독. 돌려받은 함수가 구독 해제다(두 번 불러도 한 번만 센다) */
export function subscribeSharedInterval(
  owner: object,
  ms: number,
  tick: () => void,
): () => void {
  let shared = timers.get(owner);
  if (shared === undefined) {
    shared = { subscribers: 0, timer: setInterval(tick, ms) };
    timers.set(owner, shared);
  }
  shared.subscribers += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = timers.get(owner);
    if (current === undefined) return;
    current.subscribers -= 1;
    if (current.subscribers > 0) return;
    clearInterval(current.timer);
    timers.delete(owner);
  };
}
