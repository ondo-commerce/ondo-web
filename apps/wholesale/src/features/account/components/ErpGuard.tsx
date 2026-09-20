"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useArrival } from "../arrival";
import { erpRedirectFor } from "../derive";
import { useSession } from "../store";

/**
 * ERP 화면(`(erp)`)에 들어올 자격을 본다. 없으면 보낼 곳으로 보낸다.
 *
 * **미들웨어를 만들지 않는다** — 판정 근거가 브라우저의 `sessionStorage`뿐이라
 * 서버는 아무것도 모른다.
 * TODO(#139): 진짜 인증이 붙으면 이 판정을 미들웨어로 옮기고 이 컴포넌트는 지운다.
 *
 * ⚠️ **판정이 끝나기 전에 본문을 그리지 않는다.** 세션 보관소가 "판정 전"을
 *    로그아웃과 다른 값으로 돌려주는 이유가 이것이다 — 둘을 뭉치면 빌드된 앱에서
 *    상품 목록이 한 번 깜빡였다 사라지거나(`retail-shell` F4), 반대로 정상 세션이
 *    하이드레이션 직후 `/login`으로 튕긴다.
 */
export function ErpGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  /* ERP 쪽에는 제목을 소유한 공통 자리가 없어(계정 화면은 `AuthPanel`) 도착
     문구를 가드가 대신 낭독한다 */
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
        {/* 판정은 보통 한 프레임 안에 끝난다 — "확인 중"이 번쩍이면 그게 더
            눈에 띄어서 낭독기에만 남긴다 */}
        <p className="sr-only" role="status">
          로그인 상태를 확인하고 있어요
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 빈 채로 먼저 그린다 — 이유는 `arrival.ts` */}
      <p className="sr-only" role="status">
        {arrival}
      </p>
      {children}
    </>
  );
}
