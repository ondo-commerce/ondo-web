import type { ReactNode } from "react";
import { Header } from "@/shared/components/Header";

/**
 * 셸이 있는 14화면의 껍데기 — 고정 헤더 + 문서처럼 흐르는 본문.
 *
 * 도매 `AppShell`의 `h-dvh` + 내부 스크롤 구조를 쓰지 않는다. 소매는 상품 그리드·
 * 상세·주문서가 아래로 길게 흐르는 문서형 화면이라 화면 높이에 가둘 수 없다.
 * 본문에 overflow를 걸지 않는 것도 의도다 — 장바구니·주문서가 자기 화면 하단에
 * 합계 바를 고정할 수 있어야 한다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {/* 여백 8px은 도매 앱 실측값(`_base.css` .main) */}
      <main className="min-w-0 flex-1 p-2">{children}</main>
    </>
  );
}
