"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 실행 뒤 **도착한 화면이 도착을 말한다.**
 *
 * 로그인·가입하기·재신청하기·등록하고 시작하기 네 버튼은 누르는 순간 라우트가
 * 바뀌면서 버튼 자체가 사라진다. 그때 포커스는 `<body>`로 떨어지고, 도착 화면은
 * 아무 말도 하지 않았다 — 키보드·낭독기 사용자는 실행이 끝났는지 모른 채 문서
 * 맨 앞에서 다시 Tab을 시작했다(`wholesale-account` F5).
 *
 * 다이얼로그 쪽은 `useReturnFocus`가 "연 자리로 되돌린다"로 푼다. 실행 버튼은
 * 되돌아갈 자리가 사라지므로 반대로 **도착 지점이 받는다.**
 *
 * 모듈 변수 하나인 이유: 라우트가 바뀌어도 같은 JS 문맥이라 그대로 살아 있고,
 * 주소에 실으면(`?done=…`) 새로 고침·공유 주소에 실행 결과가 따라붙는다.
 * 전체 로드로 들어온 화면에는 아무것도 남지 않는다 — 그때는 실행한 적이 없다.
 *
 * ⚠️ **도착 주소를 같이 적어 둔다.** 받는 자리(`AuthPanel`·`ErpGuard`)는 화면
 *    5장이 공유하는 공통 컴포넌트라, 주소를 안 보면 라우트가 바뀌는 도중에
 *    **떠나는 화면 쪽이 먼저 가져가 버린다** — 실측으로 그렇게 사라졌다(도착
 *    화면의 낭독 영역이 빈 채로 남았다). 자기 앞으로 온 말만 가져간다.
 */
interface Arrival {
  /** 이 말을 할 화면의 주소 */
  path: string;
  message: string;
}

let pending: Arrival | null = null;

/** 이동 **직전에** 부른다. 도착 화면이 마운트되면서 가져간다 */
export function announceArrival(path: string, message: string): void {
  pending = { path, message };
}

/**
 * 이번 이동으로 도착했다면 그 한 줄. 아니면 `null`.
 *
 * 첫 렌더에서는 반드시 `null`을 돌려준다 — 낭독 영역(`role="status"`)이 글자와
 * **동시에** 나타나면 낭독기가 그 변화를 놓친다. 빈 영역이 먼저 DOM에 붙고,
 * 그 **다음 차례에** 글자가 들어가야 변화로 읽힌다.
 *
 * ⚠️ 그 "다음 차례"를 `requestAnimationFrame`으로 잡으면 안 된다 — **화면이
 *    보이지 않는 탭에서는 콜백이 아예 돌지 않는다.** 실측으로 낭독 영역이 빈
 *    채로 남았다. 타이머는 배경 탭에서도(느려질지언정) 돈다.
 *
 * ⚠️ **마운트한 주소로만 가져간다.** `usePathname`을 매번 보면, 라우트가 바뀌는
 *    도중에 아직 살아 있는 **떠나는 화면**이 새 주소를 먼저 읽고 자기 앞으로 온
 *    말이 아닌 것을 가져가 버린다. 그리고 그 화면은 곧 사라진다.
 *
 * ⚠️ **주소가 바뀌면 지운다.** 계정 5화면은 라우트가 바뀌면 컴포넌트가 통째로
 *    사라져서 문구도 같이 사라지지만, ERP는 `(erp)/layout`의 `ErpGuard`가 한 번
 *    마운트된 뒤 탭을 옮겨도 언마운트되지 않는다 — 상품 화면에서 받은
 *    `…상품 화면이에요.`가 주문·재고·정산 화면에도 그대로 남아, 낭독기 사용자가
 *    **지금 화면 이름을 틀리게 말하는 문장**을 만났다(`wholesale-account` F10).
 *    도착 문구는 도착한 그 화면에서만 산다.
 */
export function useArrival(): string | null {
  const pathname = usePathname();
  /* 이 컴포넌트가 **선 자리**. 뒤에 주소가 바뀌어도 이 값은 그대로다 */
  const mountedAt = useRef(pathname);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    /* 자기 앞으로 온 말만 가져간다 */
    if (pending === null || pending.path !== mountedAt.current) return;

    const arrival = pending;
    const timer = setTimeout(() => {
      setMessage(arrival.message);
      /* 한 번만 가져간다 — 다음 화면이 같은 말을 또 하지 않도록 */
      if (pending === arrival) pending = null;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  /* 도착한 자리를 떠나면 그 말은 더 이상 참이 아니다. 화면 이름을 담고 있어서
     남아 있으면 다음 화면을 틀리게 소개한다 — 시간이 아니라 **주소**로 지운다.
     낭독기가 언제 읽는지 앱은 알 수 없고, 타이머로 지우면 아직 읽는 중인
     문장을 앱이 뺏는다 */
  useEffect(() => {
    if (pathname !== mountedAt.current) setMessage(null);
  }, [pathname]);

  return message;
}
