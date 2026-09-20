"use client";

import { cn, Panel } from "@ondo/ui";
import Link from "next/link";
import { useDashboardSummaryQuery } from "../api/queries";
import type { RatioSegment, TodoTileView } from "../types";
import { QuerySkeleton } from "@/shared/api/QueryBoundary";
import { formatNumber } from "@/shared/lib/format";

/**
 * 할 일 타일 4장 — 확정 → 포장 → 출고 → 미송. 타일 하나가 통째로 그 탭으로 가는 링크다.
 *
 * `Panel.Title`을 안 쓴다 — 아래 여백이 24px라 타일 높이의 절반을 먹는다. 제목·큰 숫자·둘째 줄·링크
 * 네 줄이 고정이라 여기서 직접 줄을 세운다.
 */
export function TodoTiles() {
  const { data } = useDashboardSummaryQuery();
  return (
    <TileGrid>
      {data.tiles.map((tile) => (
        <TodoTile key={tile.key} tile={tile} />
      ))}
    </TileGrid>
  );
}

/** 기다리는 동안. 타일 자리 넷을 미리 잡아 두어 도착했을 때 아래 큐가 안 튄다 */
export function TodoTilesSkeleton() {
  return (
    <TileGrid>
      {Array.from({ length: 4 }, (_, i) => (
        <Panel key={i}>
          <QuerySkeleton />
        </Panel>
      ))}
    </TileGrid>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid shrink-0 grid-cols-4 gap-2">{children}</div>;
}

function TodoTile({ tile }: { tile: TodoTileView }) {
  return (
    <Link
      href={tile.href}
      className="focus-visible:ring-ring min-w-0 rounded-panel focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <Panel className="hover:bg-accent h-full gap-2 transition-colors">
        <p className="text-muted-foreground text-sm">{tile.title}</p>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-3xl font-semibold tabular-nums">
            {formatNumber(tile.value)}
          </span>
          <span className="text-sm">{tile.unit}</span>
          {tile.valueTail !== null ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              · {tile.valueTail}
            </span>
          ) : null}
        </p>
        <p
          className={cn(
            "text-sm",
            tile.subEmphasized
              ? "text-destructive-strong font-medium"
              : "text-muted-foreground",
          )}
        >
          {tile.sub}
        </p>
        {tile.ratio !== null ? <RatioBar segments={tile.ratio} /> : null}
        {/* 링크 표시는 글자 색 하나로 — 타일 전체가 링크라 버튼 상자를 또 그리지 않는다 */}
        <p className="text-primary mt-auto pt-1 text-sm">{tile.linkLabel}</p>
      </Panel>
    </Link>
  );
}

/**
 * 구간 색. 두 번째 강조색을 만들지 않는 규칙이라 지남만 빨강이고 나머지는 회색 두 단계다 —
 * 미등록은 "챙길 것"이라 진한 회색, 정상은 배경에 가까운 옅은 회색.
 */
const SEGMENT_CLASS: Record<RatioSegment["key"], string> = {
  overdue: "bg-destructive",
  noDate: "bg-border-strong",
  onTrack: "bg-secondary-strong",
};

/** 미송 구성 비율 막대. 읽기 전용 표식이라 숫자는 둘째 줄이 말하고 여기선 비율만 보인다 */
function RatioBar({ segments }: { segments: readonly RatioSegment[] }) {
  return (
    <div
      aria-hidden
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full"
    >
      {segments.map((segment) =>
        segment.percent > 0 ? (
          <div
            key={segment.key}
            className={cn("h-full rounded-full", SEGMENT_CLASS[segment.key])}
            style={{ width: `${segment.percent}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
