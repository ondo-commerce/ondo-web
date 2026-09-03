import type { Metadata } from "next";
import type { ReactNode } from "react";

/* 셸이 있는 화면과 탭 제목이 구분돼야 한다 — 각 page.tsx가 `%s` 자리를 채운다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 ERP 계정", default: "온도 ERP 계정" },
};

/*
 * 카드 바깥(`AuthLayout`)을 여기서 씌우지 않는다. 회원가입·승인 두 화면은 카드가
 * 560px, 로그인·계좌 온보딩은 440px인데 라우트 그룹 레이아웃은 어느 화면이
 * 열렸는지 모른다. 폭을 아는 쪽 = page.tsx가 씌운다.
 *
 * `(erp)`와 달리 `AppShell`도 가드도 없다 — 아직 들어갈 자격이 확인되지 않은
 * 사람에게 보여 줄 탭이 없고, 로그인 화면을 로그인해야 볼 수 있으면 안 된다.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
