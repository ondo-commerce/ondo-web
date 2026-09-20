import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface ScrollSpyItem {
  /** 대상 섹션의 element id */
  id: string;
  label: string;
}

export interface ScrollSpyNavProps extends HTMLAttributes<HTMLElement> {
  items: ScrollSpyItem[];
  /** 현재 강조할 항목. 스크롤 추적은 이 컴포넌트가 하지 않는다 — 호출부가 정한다 */
  activeId?: string;
}

/** 긴 등록 폼 우측의 목차. 항목을 누르면 해당 섹션으로 앵커 이동한다 */
export function ScrollSpyNav({
  className,
  items,
  activeId,
  ...props
}: ScrollSpyNavProps) {
  return (
    <nav
      aria-label="폼 목차"
      className={cn(
        "border-border bg-card w-50 overflow-hidden rounded-control border",
        className,
      )}
      {...props}
    >
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === activeId ? "true" : undefined}
              className={cn(
                "hover:bg-secondary block px-3 py-2 text-xs transition-colors",
                item.id === activeId
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
