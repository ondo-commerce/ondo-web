"use client";

import { useRef } from "react";

/**
 * 다이얼로그를 닫을 때 **연 자리로 포커스를 되돌린다.**
 *
 * Radix가 알아서 해 주는 일인데 이 레포에서는 동작하지 않는다: `Dialog.Trigger
 * asChild`가 감싸는 `packages/ui` `Button`이 `forwardRef`가 아니라서 Radix가
 * 잡아 두는 트리거 ref가 비고, 그러면 닫을 때 포커스가 `<body>`로 떨어진다.
 * 키보드로 쓰던 사람은 그 순간 화면 맨 위로 튄다(`retail-cart` F3).
 *
 * `packages/ui`는 읽기 전용이라 `Button`을 고칠 수 없으므로 호출부에서 되돌린다.
 * ref 대신 "열기 직전에 포커스를 갖고 있던 것"을 기억하는 이유: 트리거가
 * `<button>`이든 파일 입력이든 상관없이 같은 방식으로 되돌아오고, 트리거를
 * 밖에서 받는 컴포넌트(`TermsDialog`)도 id를 요구하지 않아도 된다.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);

  return {
    /** `onOpenChange`에서 열릴 때 부른다 */
    remember: () => {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    },
    /** `Dialog.Content`의 `onCloseAutoFocus`에 그대로 넘긴다 */
    restore: (event: Event) => {
      /* Radix 기본 동작(빈 ref로 아무 데도 못 가는 것)을 막고 우리가 옮긴다 */
      event.preventDefault();
      const target = opener.current;
      if (!target) return;

      target.focus();
      /* 이 시점의 포커스는 아직 확정이 아니다 — 모달이 걷히면서(FocusScope 해제 ·
         스크롤 잠금 해제) 한 번 더 포커스를 거둬 가면 방금 준 것이 지워진다.
         다음 프레임에 실제로 갔는지 보고, 안 갔으면 그때 다시 준다. */
      requestAnimationFrame(() => {
        if (document.activeElement !== target) target.focus();
      });
    },
  };
}
