/**
 * 프로그램 이동(`router.push`/`replace`)이 시작된다는 신호(#376, codex-meta M1).
 *
 * Next 공개 API에는 프로그램 이동의 시작 이벤트가 없다(새 화면 커밋만 `usePathname`으로 보인다). 그래서 이동을 거는
 * 호출부가 직접 알린다. 듣는 쪽은 채팅 셸의 이동 세대다 — 시작 ~ 커밋 사이(RSC 응답 시간)에 온 방 응답이 떠나는
 * 사장을 방으로 끌고 가지 않게. 부르는 쪽(헤더 검색)은 채팅을 모르고 채팅도 검색을 모른다(`features → shared` 한
 * 방향) — 둘 다 이 모듈만 안다.
 *
 * 모듈 상태 Set 하나. DOM, React 없음.
 */
type NavigationStartListener = () => void;

const listeners = new Set<NavigationStartListener>();

/** 이동을 걸기 직전에 부른다 */
export function notifyNavigationStart(): void {
  for (const listener of listeners) listener();
}

/** 구독. 돌려받은 함수로 끊는다 */
export function subscribeNavigationStart(
  listener: NavigationStartListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
