import type { ReactNode } from "react";
import { Sidebar } from "@/shared/components/Sidebar";
import { Topbar } from "@/shared/components/Topbar";

/**
 * 좌측 세로 네비 + 상단 바 + 본문. 모든 ERP 화면의 바깥 껍데기다.
 *
 * 화면 전체 스크롤을 쓰지 않는다 — 높이를 h-dvh로 고정하고, 넘치는 내용은
 * 각 패널의 Panel.Body가 받는다. 그래서 GNB·상단바·하단 액션이 늘 같은 자리다.
 *
 * ⚠️ min-h-0이 사슬처럼 이어져야 한다. flex 자식의 기본값은 min-height:auto라
 *    한 군데만 빠져도 자식이 줄어들지 못하고 스크롤이 화면 밖으로 밀린다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar />
        {/* 페이지 루트는 이 flex 칸을 min-h-0 flex-1로 이어받는다 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4">
          {children}
        </main>
      </div>
    </div>
  );
}
