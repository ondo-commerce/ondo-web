"use client";

import { useEffect } from "react";

/**
 * 새로고침·탭 닫기 경고(S3-13, D22). `active`일 때만 `beforeunload`를 건다 — 늘 걸어 두고
 * 안에서 조건을 보면 "입력 없음"에서도 브라우저가 이탈을 한 번 붙잡는 경우가 있다.
 *
 * 문구는 브라우저 기본이다(현대 브라우저는 사용자 문구를 안 보여 준다). 뒤로가기·다른
 * 라우트 이탈은 Next App Router 에 가드 API 가 없어 여기 없다 — loop-02(#252).
 */
export function useBeforeUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 구형 Safari·Firefox 는 `returnValue`를 봐야 경고를 띄운다. 값은 무엇이든 보이지 않는다
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
