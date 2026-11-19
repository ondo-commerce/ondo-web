"use client";

import { cn, Panel } from "@ondo/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { useDashboardSummaryQuery } from "../api/queries";
import type { TodoTileView } from "../types";
import { QuerySkeleton } from "@/shared/api/QueryBoundary";
import { formatNumber } from "@/shared/lib/format";

/**
 * 할 일 타일 4장 — 확정 → 포장 → 출고 → 미송. 타일 하나가 통째로 그 탭으로 가는 링크다.
 *
 * 타일은 제목과 큰 숫자 두 줄뿐이다(2026-11-18 사용자 지시). 둘째 줄 설명, 옆 숫자, 비율 막대, "○○ 탭 →"
 * 글자를 뺐다 — 자세한 건 눌러서 간 탭이 말한다. 남긴 글자는 하나, 묵은 봉투 경고(`subEmphasized`)뿐이다.
 * 처리 안 하면 사고가 나는 신호라 숫자 왼쪽에 빨간 글자로 둔다.
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

function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid shrink-0 grid-cols-4 gap-2">{children}</div>;
}

function TodoTile({ tile }: { tile: TodoTileView }) {
  return (
    <Link
      href={tile.href}
      className="focus-visible:ring-ring min-w-0 rounded-panel focus-visible:ring-2 focus-visible:outline-hidden"
    >
      {/* hover는 테두리 색으로. 타일이 회색 바탕 위라 연한 파랑 면을 깔지 않는다 */}
      <StatTile
        className="hover:border-primary transition-colors"
        title={tile.title}
        value={tile.value}
        unit={tile.unit}
        note={tile.subEmphasized ? tile.sub : null}
        noteEmphasized
      />
    </Link>
  );
}

/**
 * 숫자 타일 한 장 — 윗줄 제목(오른쪽에 작은 곁글), 아랫줄 오른쪽 끝에 큰 숫자.
 * 할 일 타일과 우측 `오늘` 타일이 같이 써서 대시보드 윗줄이 한 모양으로 읽힌다.
 */
export function StatTile({
  title,
  meta = null,
  value,
  unit,
  note = null,
  noteEmphasized = false,
  className,
}: {
  title: string;
  /** 제목 줄 오른쪽 끝의 작은 글자(`최근 갱신 16:52`) */
  meta?: ReactNode;
  value: number;
  unit: string;
  /** 숫자 왼쪽의 한 줄. 없으면 숫자만 오른쪽에 선다 */
  note?: ReactNode;
  noteEmphasized?: boolean;
  className?: string;
}) {
  return (
    <Panel className={cn("h-full gap-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-sm">{title}</p>
        {meta}
      </div>
      <div className="mt-auto flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate text-sm tabular-nums",
            noteEmphasized
              ? "text-destructive-strong font-medium"
              : "text-muted-foreground",
          )}
        >
          {note}
        </p>
        <p className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-3xl font-semibold">{formatNumber(value)}</span>
          <span className="text-sm">{unit}</span>
        </p>
      </div>
    </Panel>
  );
}
