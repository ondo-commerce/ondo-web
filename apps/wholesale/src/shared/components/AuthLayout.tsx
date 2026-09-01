import { cn } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 계정 5화면(로그인·회원가입·승인 대기·승인 거절·정산 계좌 온보딩)의 바깥.
 *
 * **ERP 셸(`AppShell` — 상단 헤더 + 7탭)을 쓰지 않는다.** 아직 들어갈 자격이
 * 확인되지 않은 사람에게 주문·재고·정산 탭을 보여 줄 이유가 없다. 눌러도 다시
 * 튕겨 나오는 링크만 7개 생긴다.
 *
 * **스크롤을 여기서 받는다.** 도매 root layout의 `<body>`가 `overflow-hidden
 * h-full`이다 — ERP 화면이 `h-dvh` 고정이라 그렇다. root layout을 고치면 ERP
 * 6화면 전부에 영향이 가므로 건드리지 않고, 이 컨테이너가 자기 안에서 세로로
 * 흐른다. 문서 스크롤이 아니라 컨테이너 스크롤이라 "화면 전체 스크롤 없음"도
 * 깨지 않는다.
 *
 * 가운데 정렬을 `place-items-center` 한 겹으로 하지 않는 이유: 카드가 화면보다
 * 길어지면 가운데 정렬이 **위쪽을 스크롤 밖으로 밀어낸다.** 안쪽에 `min-h-full`
 * flex를 한 겹 더 두면 짧은 화면에서는 가운데에 서고, 긴 화면에서는 컨테이너가
 * 자라서 위아래가 잘리지 않는다.
 *
 * 폭을 `(account)/layout.tsx`가 아니라 **각 page.tsx**가 정한다. 회원가입·승인
 * 두 화면은 칸이 11개라 560px이고 로그인·계좌 온보딩은 440px인데, 라우트 그룹
 * 레이아웃은 어느 화면이 열렸는지 모른다. 폴더를 `(narrow)`/`(wide)`로 쪼개면
 * 주소는 그대로여도 파일 자리가 폭 때문에 흔들린다.
 */
export function AuthLayout({
  width = "narrow",
  children,
}: {
  /** narrow 440px (로그인·계좌 온보딩) · wide 560px (회원가입·승인 2화면) */
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center px-5 py-14">
        <div
          className={cn("w-full", width === "wide" ? "max-w-140" : "max-w-110")}
        >
          {/* 로고 마크 `⌘`와 글자는 `Topbar`가 쓰는 것 그대로다 — 로그인하고
              들어갔을 때 같은 로고가 헤더 왼쪽에 있어야 한 앱으로 읽힌다 */}
          <div className="mb-4 flex items-baseline gap-2">
            <span aria-hidden className="text-xl tracking-tighter">
              ⌘
            </span>
            <span className="text-xl font-bold tracking-tighter">온도 ERP</span>
            <span className="text-muted-foreground text-body">
              동대문 도매 관리
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
