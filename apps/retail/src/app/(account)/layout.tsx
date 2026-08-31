import type { ReactNode } from "react";

/**
 * 로그인 전 4화면(로그인·회원가입·승인 대기·승인 거절)의 바깥.
 * 헤더·검색·장바구니 같은 로그인 후 UI를 보이지 않으려고 `(shop)`과 그룹을 나눴다.
 *
 * 가운데 카드 레이아웃은 #85에서 이 자리에 들어온다.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
