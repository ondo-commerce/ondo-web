"use client";

import { Button, Panel } from "@ondo/ui";
import { isApiError } from "@ondo/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { useRoomListQuery } from "../api/queries";
import { APPROVAL_PATH, LIST_TEXT } from "../constants";
import { toRoomRows } from "../derive";
import type { ChatRoomRowView } from "../types";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 소매 채팅 목록 `/chats`(loop-06 S2-4, 디자인 결정 34, 35). 첫 장 30개만 — `더 보기`와 15초 갱신은 06b.
 * 목록에선 읽음을 보내지 않는다. 방을 열어야 읽힌다.
 *
 * 패널 하나 안에서 머리(h1)는 늘 그리고 그 아래가 막대, 빈 상태, 실패, 행으로 갈린다. 소매 셸은 문서형
 * 스크롤이라 행이 많으면 페이지가 내려간다(목록 안 스크롤 없음).
 */
export function ChatRoomListView() {
  const headingId = useId();
  return (
    <div className="mx-auto max-w-wrap">
      <Panel
        role="region"
        aria-labelledby={headingId}
        data-ac="S2-4"
        className="gap-0"
      >
        <div className="mb-4 flex items-center">
          <h1 id={headingId} className="text-xl font-medium">
            {LIST_TEXT.title}
          </h1>
        </div>
        <ListBody />
      </Panel>
    </div>
  );
}

function ListBody() {
  const router = useRouter();
  const query = useRoomListQuery();
  const notApproved =
    isApiError(query.error) &&
    query.error.code === RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED;

  /* 승인 전 계정(403) — 방 화면과 같은 갈래로 승인 대기 화면에 보낸다 */
  useEffect(() => {
    if (notApproved) router.replace(APPROVAL_PATH);
  }, [notApproved, router]);

  /* 실패는 받은 장이 없을 때만 그린다. 탭 복귀 다시 받기가 실패해도 이미 그린 행은 그대로 둔다 */
  if (query.data === undefined)
    return query.isError && !notApproved ? (
      <LoadFailed onRetry={() => void query.refetch()} />
    ) : (
      <ListSkeleton />
    );

  /* "오늘"의 기준은 마지막으로 받은 시각이다 — 렌더 중에 시계를 읽지 않는다 */
  const rows = toRoomRows(query.data.data, query.dataUpdatedAt);
  if (rows.length === 0)
    return (
      <div data-ac="S2-4" className="py-12 text-center">
        <p className="text-sm">{LIST_TEXT.emptyTitle}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {LIST_TEXT.emptyDetail}
        </p>
      </div>
    );

  return (
    <>
      <ul aria-label={LIST_TEXT.label} className="grid gap-1">
        {rows.map((row) => (
          <li key={row.roomId}>
            <RoomRow row={row} />
          </li>
        ))}
      </ul>
      {query.data.meta.nextCursor !== null ? (
        <p
          data-ac="S2-4"
          className="text-muted-foreground px-3 pt-3 text-xs leading-4"
        >
          {LIST_TEXT.firstPageOnly}
        </p>
      ) : null}
    </>
  );
}

/**
 * 행 — `<a>` 하나에 두 줄(loop-04 디자인 결정 3 그대로). 1줄 도매처명(500, 말줄임) + 시각,
 * 2줄 마지막 한 줄(muted, 말줄임) + 안 읽은 수 알약(primary). 알약 글자는 숨기고 수는 이름 끝에 붙인다.
 */
function RoomRow({ row }: { row: ChatRoomRowView }) {
  return (
    <Link
      href={row.href}
      data-room-id={row.roomId}
      data-ac="S2-4"
      className="hover:bg-accent focus-visible:ring-ring grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-control px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <span title={row.name} className="truncate font-medium">
        {row.name}
      </span>
      <span className="text-muted-foreground text-right text-xs tabular-nums">
        {row.time}
      </span>
      <span className="text-muted-foreground text-body self-center truncate">
        {row.preview}
      </span>
      <span className="flex min-h-5 items-center justify-end gap-1">
        {row.unreadLabel === null ? null : (
          <span
            aria-hidden
            data-ac="S2-4"
            data-unread={row.unreadCount}
            className="bg-primary text-primary-foreground h-5 min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums"
          >
            {row.unreadLabel}
          </span>
        )}
      </span>
      {row.unreadCount > 0 ? (
        <span className="sr-only">{LIST_TEXT.unreadSr(row.unreadCount)}</span>
      ) : null}
    </Link>
  );
}

/** 행 높이에 맞춘 막대 두 줄 × 3(디자인 결정 35). 머리는 위에서 이미 그렸다 */
function ListSkeleton() {
  return (
    <div role="status" aria-label={LIST_TEXT.loading} className="grid gap-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2 px-3 py-2.5">
          <div className="bg-muted h-4 w-3/10 animate-pulse rounded-control" />
          <div className="bg-muted h-4 w-7/10 animate-pulse rounded-control" />
        </div>
      ))}
    </div>
  );
}

/** 첫 장 실패. `다시 시도`가 1회 다시 묻는다(S2-4). 방 화면 실패와 같은 꼴 */
function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-ac="S2-4"
      className="flex flex-col items-center gap-3 py-12 text-center"
    >
      <div>
        <p className="text-sm font-medium">{LIST_TEXT.loadFailed}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {LIST_TEXT.loadFailedDetail}
        </p>
      </div>
      <Button
        type="button"
        variant="line"
        size="sm"
        onClick={onRetry}
        data-ac="S2-4"
      >
        {LIST_TEXT.retry}
      </Button>
    </div>
  );
}
