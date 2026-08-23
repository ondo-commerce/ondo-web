"use client";

import { cn } from "@ondo/ui";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "@/shared/config/nav";

/**
 * 좌측 세로 네비. 접으면 아이콘만 남는다.
 *
 * 접힘 상태는 `(erp)` 레이아웃에 사는 이 컴포넌트의 로컬 상태다 — App Router에서
 * 레이아웃은 페이지를 넘나들어도 다시 마운트되지 않으므로 이동해도 유지된다.
 * (새로고침까지 유지하려면 localStorage로 올린다. 지금은 필요 없다.)
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "bg-card border-border sticky top-0 flex h-screen shrink-0 flex-col border-r transition-[width] duration-200",
        collapsed ? "w-16" : "w-52",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center",
          collapsed ? "justify-center" : "gap-2 pr-2 pl-4",
        )}
      >
        {collapsed ? (
          <CollapseButton collapsed onClick={() => setCollapsed(false)} />
        ) : (
          <>
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-1"
              title="온도 ERP"
            >
              <span aria-hidden className="text-base">
                ⌘
              </span>
              <span className="truncate text-lg font-bold tracking-tighter">
                온도 ERP
              </span>
            </Link>

            <CollapseButton
              collapsed={false}
              onClick={() => setCollapsed(true)}
              className="ml-auto"
            />
          </>
        )}
      </div>

      <nav
        aria-label="주 메뉴"
        className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2"
      >
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            // /products/new 처럼 하위 경로에 있어도 상위 항목이 켜져 있어야 한다
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "focus-visible:ring-ring flex h-10 items-center rounded-control text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function CollapseButton({
  collapsed,
  onClick,
  className,
}: {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = collapsed ? ChevronsRight : ChevronsLeft;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      className={cn(
        "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground focus-visible:ring-ring grid size-8 shrink-0 place-items-center rounded-control transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
    >
      <Icon className="size-4.5" aria-hidden />
    </button>
  );
}
