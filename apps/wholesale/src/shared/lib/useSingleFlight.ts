"use client";

import { useCallback, useRef } from "react";

/**
 * 버튼 한 번에 요청 한 건. 클릭 핸들러를 감싸면 첫 실행이 끝나기 전의 재실행을 버린다.
 *
 * `disabled={mutation.isPending}`만으로는 더블클릭을 못 막는다 — 뮤테이션 상태는
 * 다음 틱에 갱신돼서 두 번째 클릭이 그 사이에 먼저 들어간다(dev-verify-bis F2: `POST /outbounds`가
 * 201 → 409로 두 건). 확인 다이얼로그를 거치는 버튼은 다이얼로그가 닫히며 막히므로 이게 필요 없다.
 * 다이얼로그 없이 바로 `mutate`하는 버튼에만 쓴다.
 *
 * ref라 렌더를 안 일으킨다 — 잠긴 동안의 표시는 여전히 `isPending`이 맡는다.
 */
export function useSingleFlight(): (
  run: (release: () => void) => void,
) => void {
  const inFlight = useRef(false);
  return useCallback((run) => {
    if (inFlight.current) return;
    inFlight.current = true;
    run(() => {
      inFlight.current = false;
    });
  }, []);
}
