"use client";

import { useRef } from "react";

/**
 * 다이얼로그를 닫을 때 **연 자리로 포커스를 되돌린다.**
 *
 * Radix가 알아서 해 주는 일인데 이 화면들에서는 실제로 포커스가 `<body>`로
 * 떨어졌다 — 키보드로 쓰던 사람은 그 순간 화면 맨 위로 튄다. 소매가 같은 자리에
 * 같은 보정을 두고 있고, 그쪽 주석이 "원인을 아는 우회로가 아니라 실측으로
 * 확인된 보정"이라고 적어 뒀다.
 *
 * ref 대신 "열기 직전에 포커스를 갖고 있던 것"을 기억하는 이유: 트리거가 무엇이든
 * 같은 방식으로 되돌아오고, 트리거를 밖에서 받는 컴포넌트도 id가 필요 없다.
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
      /* Radix 기본 동작을 막고 우리가 옮긴다 */
      event.preventDefault();
      const target = opener.current;
      if (!target) return;

      target.focus();
      /* 이 시점의 포커스는 아직 확정이 아니다 — 모달이 걷히면서(FocusScope 해제 ·
         스크롤 잠금 해제) 한 번 더 포커스를 거둬 가면 방금 준 것이 지워진다.
         다음 프레임에 실제로 갔는지 보고, 안 갔으면 그때 다시 준다 */
      requestAnimationFrame(() => {
        if (document.activeElement !== target) target.focus();
      });
    },
  };
}
