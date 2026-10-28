"use client";

import { Badge, Button, cn, Panel } from "@ondo/ui";
import Link from "next/link";
import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useRoomListQuery } from "../api/queries";
import { isChatSessionLostError } from "../api/session";
import { LIST_TEXT, SESSION_LOST_TEXT } from "../constants";
import { toRoomRows } from "../derive";
import type { ChatRoomRowView, ReadMarks } from "../types";
import { QueryBoundary, QueryErrorView } from "@/shared/api/QueryBoundary";

interface ListProps {
  selectedRoomId: number | null;
  readMarks: ReadMarks;
  /** 입력창 Esc가 선택 행으로 돌아올 때(S4-11) 부르는 쪽이 이 목록 안에서 행을 찾는다 */
  listRef: RefObject<HTMLUListElement | null>;
  /** 행을 클릭하거나 Enter로 열었다 — 부르는 쪽이 입력창으로 포커스를 옮긴다(S2-6) */
  onOpen: () => void;
}

/** 왼쪽 목록 패널(360px 고정, 디자인 결정 1). 실패와 로딩은 이 패널 안에서만 */
export function ChatRoomListPanel(props: ListProps) {
  return (
    <Panel role="region" aria-label={LIST_TEXT.label} className="w-90 shrink-0">
      <Panel.Title>{LIST_TEXT.title}</Panel.Title>
      <QueryBoundary
        fallback={<ListSkeleton rows={6} />}
        errorFallback={({ error, described, retry }) =>
          // 세션이 끊긴 뒤라면 다시 시도해도 같다 — 버튼 없이 이유만(공용 `/login` 이동 대신, 리뷰 F1)
          isChatSessionLostError(error) ? (
            <p
              role="alert"
              className="text-destructive-strong py-12 text-center text-sm"
            >
              {SESSION_LOST_TEXT}
            </p>
          ) : (
            <QueryErrorView described={described} onRetry={retry} />
          )
        }
      >
        <ChatRoomList {...props} />
      </QueryBoundary>
    </Panel>
  );
}

/** 행 높이에 맞춘 막대 두 줄 × n */
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid gap-2 px-3 py-2.5">
          <div className="bg-muted h-4 w-2/5 animate-pulse rounded-control" />
          <div className="bg-muted h-4 w-4/5 animate-pulse rounded-control" />
        </div>
      ))}
    </div>
  );
}

function ChatRoomList({
  selectedRoomId,
  readMarks,
  listRef,
  onOpen,
}: ListProps) {
  const query = useRoomListQuery();
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = query;
  // "오늘"의 기준은 마지막으로 받은 시각이다 — 15초마다 갱신되고, 렌더 중에 시계를 읽지 않는다
  const rows = toRoomRows(query.data.pages, readMarks, query.dataUpdatedAt);

  /* roving tabindex — 목록 전체가 탭 정지 하나(README 키보드 계약). 들어오면 선택 행, 없으면 첫 행 */
  const [focusedRoomId, setFocusedRoomId] = useState<number | null>(null);
  const tabbableRoomId =
    rows.find((r) => r.roomId === selectedRoomId)?.roomId ??
    rows.find((r) => r.roomId === focusedRoomId)?.roomId ??
    rows[0]?.roomId;

  /* 이어 받기(S2-3): 마지막 행 아래 표지가 보이면 다음 장. 실패 중이면 자동으로 다시 부르지 않는다 —
     사장이 `다시 시도`를 누를 때까지 */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchNextPageError]);

  /* ↑↓로 행 사이 포커스 이동(S2-6). 첫 행 위, 끝 행 아래에선 멈춘다. 끝 행에 닿으면 다음 장을 부른다 */
  const moveFocus = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [
      ...event.currentTarget.querySelectorAll<HTMLAnchorElement>(
        "a[data-room-id]",
      ),
    ];
    const index = links.findIndex((link) => link === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    const target = links[Math.max(0, Math.min(next, links.length - 1))];
    target?.focus();
    if (next >= links.length - 1 && hasNextPage && !isFetchingNextPage)
      void fetchNextPage();
  };

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center" data-ac="S2-4">
        <p className="text-muted-foreground text-sm">{LIST_TEXT.emptyTitle}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {LIST_TEXT.emptyDetail}
        </p>
      </div>
    );
  }

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <ul
        ref={listRef}
        aria-label={LIST_TEXT.label}
        data-ac="S2-2 S2-3 S2-6"
        className="grid gap-1 p-0.5"
        onKeyDown={moveFocus}
      >
        {rows.map((row) => (
          <li key={row.roomId}>
            <ChatRoomRow
              row={row}
              selected={row.roomId === selectedRoomId}
              tabbable={row.roomId === tabbableRoomId}
              onFocus={() => setFocusedRoomId(row.roomId)}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
      {isFetchingNextPage ? <ListSkeleton rows={1} /> : null}
      {isFetchNextPageError ? (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs">
          <span className="text-destructive-strong">
            {LIST_TEXT.moreFailed}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="ml-auto"
            onClick={() => void fetchNextPage()}
          >
            {LIST_TEXT.retry}
          </Button>
        </div>
      ) : null}
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </div>
  );
}

/**
 * 목록 행 — `<a>` 하나에 두 줄. 안에 버튼을 두지 않는다(S2-5, 중첩 대화형 요소 금지).
 * 1줄 이름 + 시각, 2줄 미리보기 + `답 필요` + 안 읽은 수(디자인 결정 3). 선택 행 위 글자는
 * muted 대신 secondary-foreground — 회색 면 위 muted는 4.3:1이라 기준(4.5:1)에 못 미친다(결정 21).
 */
function ChatRoomRow({
  row,
  selected,
  tabbable,
  onFocus,
  onOpen,
}: {
  row: ChatRoomRowView;
  selected: boolean;
  tabbable: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  return (
    <Link
      href={`/chats?room=${row.roomId}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-room-id={row.roomId}
      data-ac="S2-2 S2-5"
      onFocus={onFocus}
      onClick={onOpen}
      className={cn(
        "group focus-visible:ring-ring grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-control px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-hidden",
        selected ? "bg-secondary" : "hover:bg-accent",
      )}
    >
      <span className="truncate font-medium">{row.name}</span>
      <span
        data-ac="S2-2"
        className={cn(
          "text-right text-xs tabular-nums",
          selected ? "text-secondary-foreground" : "text-muted-foreground",
        )}
      >
        {row.time}
      </span>
      <span
        className={cn(
          "text-body self-center truncate",
          selected ? "text-secondary-foreground" : "text-muted-foreground",
        )}
      >
        {row.preview}
      </span>
      <span className="flex min-h-6 items-center justify-end gap-1">
        {row.needsReply ? (
          <Badge tone="active" className="h-6" data-ac="S2-2">
            {LIST_TEXT.needsReply}
          </Badge>
        ) : null}
        {row.unreadLabel ? (
          <span
            data-ac="S2-2 S3-7"
            data-unread={row.unreadCount}
            className="bg-primary text-primary-foreground h-5 min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums"
          >
            <span aria-hidden>{row.unreadLabel}</span>
            <span className="sr-only">{`안 읽은 메시지 ${row.unreadCount}개`}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
