import { cn } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 로그인 전 4화면(로그인·회원가입·승인 대기·승인 거절)의 바깥.
 *
 * 셸이 없다. 아직 로그인하지 않은 사장에게 통합 검색·찜·장바구니·계정 메뉴를
 * 보여 줄 이유가 없고, 보이면 누를 수 있는 것처럼 읽힌다.
 *
 * 세로 가운데 정렬을 `h-dvh`로 하지 않는다 — 회원가입 원본이 1273px로 화면보다
 * 길다. 위아래 여백을 준 그리드라 짧은 화면은 가운데에 서고 긴 화면은 잘리지
 * 않고 아래로 흐른다.
 *
 * 로고를 카드 **밖** 위에 두는 건 확정 와이어프레임(`_base.css` `.auth__brand`)
 * 대로다. 원본 Figma의 파랑은 게이트 D1로 따라가지 않고 굵기로만 가른다.
 *
 * 폭을 `(account)/layout.tsx`가 아니라 **각 page.tsx**가 정한다. 승인 두 화면은
 * 진행 표시 3단과 신청 요약이 들어가 560px이고 로그인·가입은 440px인데,
 * 라우트 그룹 레이아웃은 어느 화면이 열렸는지 모른다. 폴더를 `(narrow)`/`(wide)`로
 * 쪼개면 주소는 그대로여도 파일 자리가 폭 때문에 흔들린다.
 */
export function AuthLayout({
  width = "narrow",
  children,
}: {
  /** narrow 440px (로그인·회원가입) · wide 560px (승인 대기·거절) — 둘 다 실측값 */
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  return (
    <div className="grid flex-1 place-items-center px-5 py-14">
      <div
        className={cn("w-full", width === "wide" ? "max-w-140" : "max-w-110")}
      >
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-xl tracking-tighter">
            <span className="font-bold">On</span>
            <span className="font-semibold">도마켓</span>
          </span>
          <span className="text-muted-foreground text-body">
            동대문 도매 직거래
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
