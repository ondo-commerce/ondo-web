"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useArrival } from "../arrival";
import { erpRedirectFor } from "../derive";
import { useSession } from "../store";

/**
 * ERP 화면(`(erp)`)에 들어올 자격을 본다. 없으면 보낼 곳으로 보낸다.
 *
 * **미들웨어를 만들지 않는다.** 서버가 없어 미들웨어가 읽을 쿠키도 없고, 판정
 * 근거가 브라우저의 `sessionStorage`뿐이라 서버는 아무것도 모른다.
 * TODO(#139): 진짜 인증이 붙으면 이 판정을 미들웨어(또는 서버 레이아웃)로 옮긴다.
 * 그때 이 컴포넌트는 사라진다.
 *
 * ⚠️ **판정이 끝나기 전에 본문을 그리지 않는다.** `children`은 이미 만들어져
 * 넘어오지만 여기서 반환하지 않으면 HTML에 들어가지 않는다. 세션 보관소가
 * "판정 전"(`unknown`)을 로그아웃과 다른 값으로 돌려주는 이유가 이것이다 —
 * 둘을 뭉치면 빌드된 앱에서 상품 목록이 한 번 깜빡였다 사라지거나
 * (`retail-shell` F4), 반대로 정상 세션이 하이드레이션 직후 `/login`으로 튕긴다.
 */
export function ErpGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  /* 로그인·계좌 등록·건너뛰기의 도착지가 ERP다. 계정 화면은 `AuthPanel`이
     받지만 ERP 쪽에는 제목을 소유한 공통 자리가 없어, 가드가 대신 낭독한다 */
  const arrival = useArrival();

  const redirect =
    session.state === "unknown"
      ? null
      : erpRedirectFor(session.state === "signedIn" ? session.account : null);

  useEffect(() => {
    /* `replace`다 — 뒤로 가기로 막힌 화면에 다시 들어갈 수 있으면 가드가 아니다 */
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (session.state === "unknown" || redirect) {
    return (
      <div className="grid flex-1 place-items-center">
        {/* 글자를 그리지 않는다. 판정은 보통 한 프레임 안에 끝나고, 그때마다
            "확인 중"이 번쩍이면 그게 더 눈에 띈다. 화면 낭독기에는 남긴다 */}
        <p className="sr-only" role="status">
          로그인 상태를 확인하고 있어요
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 빈 채로 먼저 그린다 — 낭독 영역이 글자와 동시에 나타나면 낭독기가 그
          변화를 놓친다 */}
      <p className="sr-only" role="status">
        {arrival}
      </p>
      {children}
    </>
  );
}
