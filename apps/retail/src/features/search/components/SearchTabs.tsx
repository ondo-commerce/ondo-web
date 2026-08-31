"use client";

import { cn } from "@ondo/ui";
import Link from "next/link";
import { SEARCH_TABS, SEARCH_TAB_LABEL } from "../constants";
import { searchHref } from "../derive";
import type { SearchTab } from "../types";

/**
 * 결과 분류 탭 4개. 규격은 도매 GNB 탭과 같다 — h38 · 밑줄 2px.
 *
 * **버튼이 아니라 링크다.** 고른 탭이 주소에 있어야 뒤로 가기·새로고침에도
 * 검색어와 탭이 같이 살아 있다. 탭을 옮겨도 `?q=`는 그대로 실려 간다.
 */
export function SearchTabs({
  query,
  tab,
  counts,
}: {
  query: string;
  tab: SearchTab;
  counts: Record<SearchTab, number>;
}) {
  return (
    <nav
      aria-label="검색 결과 분류"
      /* 패널 안쪽 여백을 지나 좌우 끝까지 선을 긋는다(`_base.css` `.tabs`).
         phone에서 가로로 흘린다 — 4탭이 390px에서 아슬아슬하다 */
      className="border-border scroll-slim -mx-4 flex items-center gap-0.5 overflow-x-auto border-b px-4"
    >
      {SEARCH_TABS.map((key) => {
        const active = key === tab;

        return (
          <Link
            key={key}
            href={searchHref(query, key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-9.5 shrink-0 items-center gap-1.5 border-b-2 px-3",
              active
                ? "border-foreground text-foreground font-medium"
                : "text-muted-foreground border-transparent",
            )}
          >
            {SEARCH_TAB_LABEL[key]}
            <span className="text-muted-foreground text-xs tabular-nums">
              {counts[key]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
