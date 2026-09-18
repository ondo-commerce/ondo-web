"use client";

import { Panel } from "@ondo/ui";
import Link from "next/link";
import { useEffect } from "react";
import { AttentionPanel } from "./AttentionPanel";
import { NewOrderQueue } from "./NewOrderQueue";
import { TodayPanel } from "./TodayPanel";
import { TodoTiles, TodoTilesSkeleton } from "./TodoTiles";
import { dashboardKeys } from "../api/keys";
import { useDashboardSummaryPeek } from "../api/queries";
import {
  ATTENTION_TEXT,
  DASHBOARD_TITLE,
  QUEUE_TEXT,
  TAB_HREF,
} from "../constants";
import { documentTitle } from "../derive";
import {
  QueryBoundary,
  QueryBoundaryGroup,
  QueryErrorView,
} from "@/shared/api/QueryBoundary";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { formatNumber } from "@/shared/lib/format";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 대시보드 — 좌 처리할 것(타일 4장 + 확정 대기 큐) · 우 확인할 것(오늘 · 주의).
 *
 * 통계 화면이 아니다. 도매 쪽엔 새 주문이 들어왔음을 알려 주는 것이 없어서 이 화면이 그 역할을 한다 —
 * 그래서 세 쿼리가 30초마다 돌고, 탭 제목에 신규 주문 건수가 붙는다.
 *
 * 경계는 셋 — 타일 4장(summary) · 큐(주문 목록) · 주의(미송 목록). 우측 `오늘`도 summary라 타일과
 * 같은 키를 보지만 자기 경계가 따로 있다. summary가 죽어도 큐는 살아야 한다 — 큐가 이 화면의 존재 이유다.
 * 재시도는 뷰 하나가 나눠 쓴다(`QueryBoundaryGroup`) — 타일과 오늘이 같은 키라 따로면 `다시 시도`가 둘 뜬다.
 *
 * 좌우 배치는 `ListDetailLayout`을 그대로 쓴다 — 우측 폭(w-md)이 다른 탭과 같아야 탭을 오갈 때 시선이 안 흔들린다.
 */
export function DashboardView() {
  /* 다른 탭에서 확정·포장한 결과가 30초 캐시에 갇히지 않게 진입 때 한 번 비운다. 같은 탭 안 왕복은 폴링이 맡는다 */
  useInvalidateOnMount(dashboardKeys.all);
  const peek = useDashboardSummaryPeek();
  /* 경과 기준 시각. 서버 시각이 없을 때(첫 로딩·summary 실패)만 브라우저 시계 — 큐가 summary 때문에 멈추면 안 된다 */
  const now = peek?.now ?? new Date().toISOString();
  useDocumentTitleBadge(peek?.newOrderCount ?? 0);

  return (
    <QueryBoundaryGroup>
      <ListDetailLayout
        list={
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {/* 실패해도 타일 자리는 남는다 — 에러 블록이 큐 위에 맨바닥으로 그려지지 않게 Panel로 감싼다 */}
            <QueryBoundary
              fallback={<TodoTilesSkeleton />}
              errorFallback={({ described, retry }) => (
                <Panel className="shrink-0">
                  <QueryErrorView
                    described={described}
                    onRetry={retry}
                    className="py-6"
                  />
                </Panel>
              )}
            >
              <TodoTiles />
            </QueryBoundary>

            <Panel className="flex-1">
              <Panel.Title
                className="mb-4"
                sub={QUEUE_TEXT.sub}
                action={
                  <Link
                    href={TAB_HREF.orders}
                    className="text-primary text-sm hover:underline"
                  >
                    {QUEUE_TEXT.seeAll}
                  </Link>
                }
              >
                {QUEUE_TEXT.title}
              </Panel.Title>
              <QueryBoundary>
                <NewOrderQueue now={now} />
              </QueryBoundary>
              {/* summary를 못 받았으면 줄 자체를 안 그린다 — 0건으로 지어내지 않는다 */}
              {peek !== undefined ? (
                <p className="text-muted-foreground mt-3 shrink-0 text-sm tabular-nums">
                  <span className="text-foreground font-medium">
                    {QUEUE_TEXT.cancelledPrefix}
                  </span>{" "}
                  {formatNumber(peek.cancelledToday)}건
                </p>
              ) : null}
            </Panel>
          </div>
        }
        detail={
          <>
            <Panel className="shrink-0">
              <QueryBoundary>
                <TodayPanel />
              </QueryBoundary>
            </Panel>
            <Panel className="flex-1">
              <Panel.Title className="mb-4">{ATTENTION_TEXT.title}</Panel.Title>
              <QueryBoundary>
                <AttentionPanel now={now} />
              </QueryBoundary>
            </Panel>
          </>
        }
      />
    </QueryBoundaryGroup>
  );
}

/**
 * 탭 제목에 신규 주문 건수 배지 — `(4) 대시보드 · 온도 ERP`. 다른 창을 보고 있어도 탭 글자로 보인다.
 *
 * 되돌릴 땐 **우리가 붙인 제목일 때만** 되돌린다. 라우트를 옮기면 Next가 새 제목을 먼저 쓰고 그 뒤에
 * 이 cleanup이 돌아서, 무조건 되돌리면 주문 탭 제목이 `대시보드`로 남는다.
 */
function useDocumentTitleBadge(newOrderCount: number) {
  useEffect(() => {
    const badged = documentTitle(newOrderCount);
    document.title = badged;
    return () => {
      if (document.title === badged) document.title = DASHBOARD_TITLE;
    };
  }, [newOrderCount]);
}
