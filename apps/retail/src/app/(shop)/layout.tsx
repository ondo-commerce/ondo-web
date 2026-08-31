import type { ReactNode } from "react";

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
