"use client";

import { cn, IconButton } from "@ondo/ui";
import { Bell, CircleUser } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/shared/config/nav";

/**
 * 상단 헤더 — 로고 + 주 메뉴 7탭 + 알림·계정.
 *
 * **좌측 사이드바를 대체한다.** 원래는 사이드바가 네비를 전부 맡고 이 바에는 계정·알림만
 * 있었는데, 라인 표가 가로로 넘쳐서 목록 폭을 벌기 위해 네비를 위로 올렸다
 * (사이드바가 208px, 접어도 64px을 상시로 먹었다).
 *
 * ⚠️ `wholesale_screen_spec.md` §9.6 C1이 정확히 반대로 결정해 둔 항목이다 —
 *    "탭 7개가 가로로 늘어서면 시선이 흔들리고, 거래처·발주가 붙으면 한 줄에 안 들어간다".
 *    **그 위험은 그대로 남아 있다.** 탭이 늘어나면 이 배치는 다시 무너진다.
 *    문서는 아직 사이드바로 되어 있어서 코드와 어긋난 상태다.
 *
 * sticky가 아니다 — 화면 전체 스크롤이 없어서 붙을 대상이 없다 (AppShell 참고).
 */
export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="bg-card border-border flex h-14 shrink-0 items-center gap-6 border-b px-5">
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-1"
        title="온도 ERP"
      >
        <span aria-hidden className="text-xl">
          ⌘
        </span>
        <span className="text-lg font-bold tracking-tighter">온도 ERP</span>
      </Link>

      {/* 넘칠 때 잘리지 않고 흐르게 둔다. 탭이 늘어나면 여기가 먼저 티가 난다 */}
      <nav aria-label="주 메뉴" className="scroll-slim min-w-0 flex-1">
        <ul className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            // /products/new 처럼 하위 경로에 있어도 상위 항목이 켜져 있어야 한다
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <Link
                  href={href}
                  /* 정확히 그 경로일 때만 page다. /products/new에서 상위 탭을
                     page라고 하면 보조기술에 현재 페이지를 잘못 알린다 */
                  aria-current={
                    pathname === href ? "page" : active ? "location" : undefined
                  }
                  className={cn(
                    "focus-visible:ring-ring flex h-8 items-center gap-2 rounded-control px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <IconButton variant="ghost" aria-label="알림" title="알림">
        <Bell aria-hidden />

        {/* TODO: 안 읽은 알림이 있을 때만 점을 띄운다.
            <span className="bg-destructive absolute top-1.5 right-1.5 size-1.5 rounded-full" /> */}
      </IconButton>

      <IconButton variant="ghost" aria-label="계정" title="계정">
        <CircleUser aria-hidden />
      </IconButton>
    </header>
  );
}
