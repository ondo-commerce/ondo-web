"use client";

import { useEffect, useRef } from "react";
import { linkLeaveTarget } from "./derive";

/**
 * 앱 안 `<Link>` 이탈 가드(S5, D22). `active`인 동안 Link 클릭을 막고 `onAttempt(href)`로
 * 가려던 경로를 넘긴다. 화면(View)이 확인 모달을 띄우고 `나가기`면 `router.push(href)`한다.
 *
 * App Router엔 이동을 막는 API가 없다. 대신 Next `Link`의 onClick이
 * `if (e.defaultPrevented) return`으로 끝나는 걸 쓴다(next 16.2.12 `link.js`). `document`의
 * **capture** 단계 리스너는 React 루트의 리스너보다 먼저 돌아서, 여기서 `preventDefault()`하면
 * Link가 이동하지 않는다. 그래서 상단 메뉴(`shared/Topbar`)가 상품 폼을 몰라도 된다 —
 * Link마다 `onNavigate`를 다는 방법은 shared가 feature 상태를 알아야 해서 버렸다.
 *
 * 제약:
 * - Link에 붙은 사용자 onClick은 그대로 돈다. 계정 메뉴는 닫히고 모달이 뜬다.
 * - 버튼에서 직접 `router.push`(로그아웃)는 못 잡는다. 진행 중 업로드는 언마운트가 abort한다.
 * - `나가기` 뒤 `router.push`라 원래 Link의 `replace`·`scroll={false}`는 잃는다. 지금 대상
 *   Link 중 그 둘을 쓰는 곳이 없다.
 * - 뒤로가기는 여기 없다 — 다음 회차(Next history 상태 전이 정책부터 정해야 한다).
 */
export function useLinkLeaveGuard(
  active: boolean,
  onAttempt: (href: string) => void,
): void {
  // 리스너를 렌더마다 갈아 끼우지 않는다 — 최신 콜백만 ref로 본다
  const onAttemptRef = useRef(onAttempt);
  useEffect(() => {
    onAttemptRef.current = onAttempt;
  });

  useEffect(() => {
    if (!active) return;
    const handle = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = linkLeaveTarget(
        {
          defaultPrevented: event.defaultPrevented,
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: anchor.target,
          download: anchor.hasAttribute("download"),
          href: anchor.href,
        },
        window.location,
      );
      if (href === null) return;
      event.preventDefault();
      onAttemptRef.current(href);
    };
    document.addEventListener("click", handle, true);
    return () => document.removeEventListener("click", handle, true);
  }, [active]);
}
