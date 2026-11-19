"use client";

import { Button, cn, Notice } from "@ondo/ui";
import { isApiError } from "@ondo/api";
import { ArrowUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { useNotificationListQuery } from "../api/queries";
import { markAllText, PANEL_TEXT } from "../constants";
import { flattenPages, hasNewer, toNotificationRow, unreadOf } from "../derive";
import type { HeaderCounts, NotificationRowView, PanelNotice } from "../types";

/** 버튼 안 작은 회전 표시. 채팅 보내는 중과 같은 모양 */
function Spinner() {
  return (
    <span
      aria-hidden
      className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
    />
  );
}

/* 폰 폭(≤40rem)에서 패널 안 버튼과 새 알림 줄은 44(디자인 결정 50) */
const PANEL_BUTTON = "phone:h-11";

/**
 * 알림 패널 속(디자인 결정 50~57, 도매 결정 30~35의 소매판). 머리 줄(제목 + `모두 읽음`)은 목록 상태와 상관없이
 * 그린다 — `모두 읽음` N은 count 값이라 목록을 기다리지 않는다. 목록 401만 버튼을 숨긴다(결정 55).
 *
 * 목록 쿼리를 여기서 부른다. 패널(Popover 내용)은 열렸을 때만 붙어서 닫혀 있으면 목록 요청이 0이다(S2-4).
 * 높이는 Popover가 받고 **목록만** 안에서 흐른다. 페이지는 스크롤하지 않는다.
 */
export function NotificationPanel({
  titleId,
  titleRef,
  scrollRef,
  counts,
  notice,
  marking,
  lockedIds,
  onMarkAll,
  onShowNewer,
  onRowActivate,
}: {
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  counts: HeaderCounts | undefined;
  notice: PanelNotice;
  marking: boolean;
  lockedIds: ReadonlySet<number>;
  onMarkAll: () => void;
  onShowNewer: () => void;
  /** `true`면 이동을 막는다 */
  onRowActivate: (row: NotificationRowView) => boolean;
}) {
  const query = useNotificationListQuery();
  const unread = unreadOf(counts);
  const listSessionLost =
    query.data === undefined &&
    isApiError(query.error) &&
    query.error.status === 401;
  const newer = hasNewer(counts, query.data?.pages[0]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3">
        {/* 떠 있는 작은 표면이라 16/500(도매 결정 31) */}
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-medium outline-hidden"
        >
          {PANEL_TEXT.title}
        </h2>
        {unread !== null && unread >= 1 && !listSessionLost ? (
          <Button
            type="button"
            variant="line"
            size="sm"
            className={PANEL_BUTTON}
            disabled={marking}
            aria-busy={marking || undefined}
            onClick={onMarkAll}
            data-ac="S2-6"
          >
            {marking ? (
              <>
                <Spinner />
                {PANEL_TEXT.processing}
              </>
            ) : (
              markAllText(unread)
            )}
          </Button>
        ) : null}
      </div>

      {/* 409와 새 알림 먼저는 사장 잘못이 아니라 빨강을 안 쓴다(결정 54). 실패와 401은 오류 한 줄 */}
      {notice === "changed" || notice === "newerFirst" ? (
        <Notice
          role="status"
          /* 떠 있는 작은 표면이라 Notice 기본(12 16, 14)보다 작게 — 와이어프레임 `.pop .notice` 8 12, 13 */
          className="mt-3 shrink-0 px-3 py-2 text-body"
          data-ac={notice === "changed" ? "S2-6" : "S2-6 S2-7"}
        >
          {notice === "changed" ? PANEL_TEXT.changed : PANEL_TEXT.newerFirst}
        </Notice>
      ) : null}
      {notice === "markFailed" || notice === "sessionLost" ? (
        <p
          role="alert"
          className="text-destructive-strong mt-3 flex shrink-0 items-center gap-1.5 text-body"
          data-ac={notice === "markFailed" ? "S2-6" : "S2-6 S2-3"}
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {notice === "markFailed"
            ? PANEL_TEXT.markFailed
            : PANEL_TEXT.markSessionLost}
        </p>
      ) : null}

      {newer ? (
        <button
          type="button"
          onClick={onShowNewer}
          data-ac="S2-7"
          className={cn(
            "bg-accent text-accent-foreground focus-visible:ring-ring mt-3 flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control text-sm font-medium focus-visible:ring-2 focus-visible:outline-hidden",
            PANEL_BUTTON,
          )}
        >
          <ArrowUp aria-hidden className="size-4" />
          {PANEL_TEXT.newer}
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className="scroll-slim -mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2"
      >
        <PanelList
          query={query}
          sessionLost={listSessionLost}
          locked={marking}
          lockedIds={lockedIds}
          onRowActivate={onRowActivate}
        />
      </div>
    </>
  );
}

/** 목록 자리. 불러오는 중, 401, 실패, 빈 상태, 행 + `더 보기` */
function PanelList({
  query,
  sessionLost,
  locked,
  lockedIds,
  onRowActivate,
}: {
  query: ReturnType<typeof useNotificationListQuery>;
  sessionLost: boolean;
  /** 모두 읽음 처리 중이면 행도 잠근다 — 처리 중에 이동하면 결과를 못 본다 */
  locked: boolean;
  lockedIds: ReadonlySet<number>;
  onRowActivate: (row: NotificationRowView) => boolean;
}) {
  if (query.isPending && !query.isError)
    return (
      <div role="status" aria-label="불러오는 중" data-ac="S2-4 S2-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="py-2 pl-4">
            <div className="bg-muted h-3.5 w-11/20 animate-pulse rounded-control" />
            <div className="bg-muted mt-2 h-3 w-17/20 animate-pulse rounded-control" />
          </div>
        ))}
      </div>
    );

  if (sessionLost)
    return (
      <div role="alert" data-ac="S2-3" className="py-8 text-center">
        <p className="text-sm font-medium">{PANEL_TEXT.sessionLost}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {PANEL_TEXT.sessionLostHint}
        </p>
      </div>
    );

  if (query.isError && query.data === undefined)
    return (
      <div
        role="alert"
        data-ac="S2-4"
        className="flex flex-col items-center gap-3 py-8 text-center"
      >
        <p className="text-sm font-medium">{PANEL_TEXT.loadFailed}</p>
        <Button
          type="button"
          variant="line"
          size="sm"
          className={PANEL_BUTTON}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          data-ac="S2-4"
        >
          {PANEL_TEXT.retry}
        </Button>
      </div>
    );

  /* 상대 시각의 "지금"은 받은 시각이다(도매와 같다). 렌더 중에 시계를 읽지 않는다 — 패널은 열린 동안
     저절로 안 바뀌므로 "방금"이 받은 순간 기준으로 고정되는 게 맞다 */
  const rows = flattenPages(query.data?.pages ?? []).map((n) =>
    toNotificationRow(n, query.dataUpdatedAt),
  );

  if (rows.length === 0)
    return (
      <div data-ac="S2-4" className="py-8 text-center">
        <p className="text-muted-foreground text-sm">{PANEL_TEXT.empty}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {PANEL_TEXT.emptyHint}
        </p>
      </div>
    );

  return (
    <>
      <ul
        aria-label={PANEL_TEXT.listLabel}
        data-ac="S2-4"
        className="flex flex-col gap-1"
      >
        {rows.map((row) => (
          <li key={row.id}>
            <NotificationRow
              row={row}
              disabled={locked || lockedIds.has(row.id)}
              onActivate={onRowActivate}
            />
          </li>
        ))}
      </ul>

      {query.hasNextPage ? (
        <div className="mt-2 flex flex-col gap-2" data-ac="S2-4 S2-8 S2-11">
          {query.isFetchNextPageError ? (
            <p
              role="alert"
              className="text-destructive-strong flex items-center gap-1.5 text-sm"
            >
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {PANEL_TEXT.moreFailed}
            </p>
          ) : null}
          <Button
            type="button"
            variant="line"
            size="sm"
            className={cn("w-full", PANEL_BUTTON)}
            disabled={query.isFetchingNextPage}
            aria-busy={query.isFetchingNextPage || undefined}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? (
              <>
                <Spinner />
                {PANEL_TEXT.moreLoading}
              </>
            ) : query.isFetchNextPageError ? (
              PANEL_TEXT.retry
            ) : (
              PANEL_TEXT.more
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}

const ROW_CLASS =
  "focus-visible:ring-ring grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-control py-2.5 pr-3 pl-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset aria-disabled:cursor-default phone:min-h-11";

/**
 * 행 하나(디자인 결정 57, 도매 결정 30). 점 8 + title + 오른쪽 시각, 아래 body **두 줄까지**(결정 51 — 한 줄이면
 * 360 패널에서 "→ 11/8(일)" 새 날짜가 잘린다). 종류 아이콘은 없다(title 끝말이 종류).
 * 갈 곳이 있으면 행 전체가 `<a>` 하나, 없으면(모르는 type, kind) `<button>` — 안에 다른 버튼을 두지 않는다.
 */
function NotificationRow({
  row,
  disabled,
  onActivate,
}: {
  row: NotificationRowView;
  disabled: boolean;
  onActivate: (row: NotificationRowView) => boolean;
}) {
  const onClick = (event: MouseEvent) => {
    if (disabled || onActivate(row)) event.preventDefault();
  };
  const content: ReactNode = (
    <>
      <span
        aria-hidden
        className={cn("size-2 rounded-full", row.unread && "bg-primary")}
      />
      <span
        className={cn(
          "truncate text-sm",
          row.unread ? "font-medium" : "text-secondary-foreground",
        )}
      >
        {row.unread ? (
          <span className="sr-only">{PANEL_TEXT.unreadPrefix}</span>
        ) : null}
        {row.title}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {row.time}
      </span>
      {row.body !== null ? (
        <span className="text-muted-foreground col-span-2 col-start-2 line-clamp-2 text-body">
          {row.body}
        </span>
      ) : null}
    </>
  );

  if (row.href === null)
    return (
      <button
        type="button"
        className={ROW_CLASS}
        aria-disabled={disabled || undefined}
        data-id={row.id}
        data-unread={row.unread}
        data-ac="S2-5"
        onClick={onClick}
      >
        {content}
      </button>
    );

  return (
    <Link
      href={row.href}
      className={ROW_CLASS}
      aria-disabled={disabled || undefined}
      data-id={row.id}
      data-unread={row.unread}
      data-ac="S2-4 S2-5"
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
