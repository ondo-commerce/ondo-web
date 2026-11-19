import { loginNoticeFor } from "./derive";
import type { SessionEndReason } from "./types";

/**
 * 세션이 닫힌 이유를 로그인 화면까지 한 번 건네는 보관(#410). `arrival.ts`와 같은 꼴이다 —
 * 세션이 닫히면 `ErpGuard`가 `/login`으로 `replace`하는데, 같은 JS 문맥이라 모듈 변수가 살아서 건너간다.
 * 주소(`?reason=…`)에 싣지 않는 이유도 같다: 새로고침한 `/login`에 안내가 다시 뜨면 거짓말이 된다.
 *
 * `store.ts`에 두지 않고 따로 뺀 이유: 이 파일은 `window`도 `sessionStorage`도 안 만져서 unit이 바로
 * 부를 수 있다(S1-1). `store.ts`는 브라우저 저장소와 채널을 쥐고 있다.
 */
let pending: string | null = null;

/**
 * 세션이 닫힐 때 `store.endSession`이 **세션을 지우기 전에** 부른다. `pathname`은 그 순간 이 탭의 주소다.
 * 남길 게 없으면 비운다 — `self`가 앞서 남은 `otherTab` 안내를 지워야 이 탭 로그아웃 뒤 로그인 화면이
 * 엉뚱한 이유를 말하지 않는다
 */
export function noteSessionEnd(
  reason: SessionEndReason,
  pathname: string,
): void {
  pending = loginNoticeFor(reason, pathname);
}

/** 남은 안내를 꺼내고 비운다. 두 번째부터는 null — 다음 로그인 화면이 같은 말을 또 하지 않게 */
export function takeLoginNotice(): string | null {
  const taken = pending;
  pending = null;
  return taken;
}
