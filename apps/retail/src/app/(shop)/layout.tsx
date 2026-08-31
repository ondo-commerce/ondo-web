import type { Metadata } from "next";
import type { ReactNode } from "react";

/* 주문 내역·미송·정산을 탭 세 개로 벌려 놓고 도는 업무라 탭 줄에서 화면이 구분돼야
   한다. 각 page.tsx가 `%s` 자리를 채우고, 채우지 않는 홈은 기본값을 그대로 쓴다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 마켓", default: "온도 마켓" },
};

/**
 * 셸이 있는 14화면의 바깥. 계정 4화면(`(account)`)은 이 셸을 쓰지 않는다.
 *
 * 도매의 `AppShell`을 복사하지 않는다 — 저쪽은 `h-dvh` 고정에 화면 전체 스크롤이
 * 없는 전제라서, 문서처럼 아래로 흐르는 소매 화면과 맞지 않는다.
 * 여백 8px은 도매 앱 실측값이다(`15_retail-hallmark/_base.css` `.main`).
 *
 * 상단 헤더는 #82에서 이 자리에 들어온다.
 */

export default function ShopLayout({ children }: { children: ReactNode }) {
  return <main className="min-w-0 flex-1 p-2">{children}</main>;
}
