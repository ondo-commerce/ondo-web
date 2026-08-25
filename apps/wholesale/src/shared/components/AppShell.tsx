import type { ReactNode } from "react";
import { Topbar } from "@/shared/components/Topbar";

/**
 * 상단 헤더(로고 + 주 메뉴 + 계정) + 본문. 모든 ERP 화면의 바깥 껍데기다.
 *
 * 좌측 사이드바가 있던 자리를 없애고 네비를 헤더로 올렸다 — 목록·표가 쓰는 가로 폭을
 * 벌기 위해서다. 경위와 남은 위험은 `Topbar` 주석에 적어 뒀다.
 *
 * 화면 전체 스크롤을 쓰지 않는다 — 높이를 h-dvh로 고정하고, 넘치는 내용은
 * 각 패널의 Panel.Body가 받는다. 그래서 헤더·하단 액션이 늘 같은 자리다.
 *
 * ⚠️ min-h-0이 사슬처럼 이어져야 한다. flex 자식의 기본값은 min-height:auto라
 *    한 군데만 빠져도 자식이 줄어들지 못하고 스크롤이 화면 밖으로 밀린다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <Topbar />
      {/* 페이지 루트는 이 flex 칸을 min-h-0 flex-1로 이어받는다 */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        {children}
      </main>
    </div>
  );
}
