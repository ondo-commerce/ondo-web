import { cn } from "@ondo/ui";
import { Bell, CircleUser } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * 본문 위 상단 바. 좌측 사이드바 오른쪽 열의 맨 위에 붙는다.
 *
 * 높이를 사이드바 로고 줄과 같은 h-14로 맞춰서 두 헤더가 한 줄에 정렬된다.
 * sticky가 아니다 — 화면 전체 스크롤이 없어서 붙을 대상이 없다 (AppShell 참고).
 * 네비게이션은 사이드바가 전부 맡고, 여기에는 계정·알림처럼 화면과 무관한 것만 둔다.
 */
export function Topbar() {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 px-5">
      {/* 좌측은 비워둔다. 화면 제목은 각 페이지의 Panel.Title이 갖는다 */}
      <div className="flex-1" />

      <IconButton icon={Bell} label="알림">
        {/* TODO: 안 읽은 알림이 있을 때만 점을 띄운다.
            <span className="bg-destructive absolute top-1.5 right-1.5 size-1.5 rounded-full" /> */}
      </IconButton>

      <IconButton icon={CircleUser} label="계정" />
    </header>
  );
}

function IconButton({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  children?: React.ReactNode;
}) {
  // TODO: 클릭 시 Popover를 연다 (@ondo/ui의 Popover 재사용).
  //       알림 = 목록 + "모두 읽음", 계정 = 내 정보 / 설정 / 로그아웃.
  //       상태를 쓰게 되는 순간 이 파일 맨 위에 "use client"가 필요하다.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
        "focus-visible:ring-ring relative grid size-10 shrink-0 cursor-pointer place-items-center",
        "rounded-control transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
      )}
    >
      <Icon className="size-4.5" aria-hidden />
      {children}
    </button>
  );
}
