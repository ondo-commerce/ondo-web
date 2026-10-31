"use client";

import { Button, Panel } from "@ondo/ui";
import { isApiError } from "@ondo/api";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { isRoomListSessionLost, useRoomListQuery } from "../api/queries";
import { APPROVAL_PATH, LIST_TEXT, LOGIN_PATH } from "../constants";
import { moreStateOf, toRoomRows } from "../derive";
import type { ChatRoomRowView, MoreState } from "../types";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 소매 채팅 목록 `/chats`(loop-06 S2-4, 디자인 결정 34, 35 → loop-08 S4). 30개씩 장을 받고 끝에 `더 보기`,
 * 15초마다 받은 장 전부를 첫 장부터 다시 받는다. 갱신은 화면에 표시하지 않는다(결정 63).
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
  const sessionLost = isRoomListSessionLost(query.error);

  /* 승인 전 계정(403) — 방 화면과 같은 갈래로 승인 대기 화면에 보낸다 */
  useEffect(() => {
    if (notApproved) router.replace(APPROVAL_PATH);
  }, [notApproved, router]);

  /* 실패는 받은 장이 없을 때만 그린다. 15초 갱신, 탭 복귀 다시 받기가 실패해도 이미 그린 행은 그대로 둔다(결정 66) */
  if (query.data === undefined)
    return query.isError && !notApproved ? (
      <LoadFailed onRetry={() => void query.refetch()} />
    ) : (
      <ListSkeleton />
    );

  /* "오늘"의 기준은 마지막으로 받은 시각이다 — 렌더 중에 시계를 읽지 않는다 */
  const rows = toRoomRows(
    query.data.pages.flatMap((page) => page.data),
    query.dataUpdatedAt,
  );
  const more = moreStateOf({
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isRefreshing: query.isFetching && !query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    sessionLost,
  });
  /* 같은 task 안 연타(S4-4)는 렌더 전이라 disabled가 아직 안 걸려 있다. `cancelRefetch: false`라 도는 요청이
     있으면 그 promise를 돌려받을 뿐 새 요청은 없다 — 기본값이면 앞 요청을 취소하고 다시 보낸다 */
  const loadMore = () => {
    if (more === "idle" || more === "failed")
      void query.fetchNextPage({ cancelRefetch: false });
  };

  return (
    <>
      {sessionLost ? <SessionLostNote /> : null}
      {rows.length === 0 ? (
        <div data-ac="S2-4" className="py-12 text-center">
          <p className="text-sm">{LIST_TEXT.emptyTitle}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {LIST_TEXT.emptyDetail}
          </p>
        </div>
      ) : (
        <ul aria-label={LIST_TEXT.label} className="grid gap-1">
          {rows.map((row) => (
            <li key={row.roomId}>
              <RoomRow row={row} />
            </li>
          ))}
        </ul>
      )}
      <MoreBox state={more} onMore={loadMore} />
    </>
  );
}

/**
 * 목록 끝 `더 보기`(디자인 결정 62, 64, 06b 알림 패널 `더 보기`와 같은 모양). Button line sm, 목록 폭 전체,
 * ≤40rem 높이 44 글자 14. 다음 장이 없으면 아무것도 그리지 않는다.
 * 실패면 버튼 위 오류 한 줄 + 글자가 `다시 시도`로 바뀐다(와이어프레임 `list_more("fail")`).
 */
function MoreBox({ state, onMore }: { state: MoreState; onMore: () => void }) {
  if (state === "hidden") return null;
  const busy = state === "busy";
  /* 와이어프레임 `list_more` 그대로: 잠김 S4-5, 실패 S4-7, 나머지 S4-4(상자와 버튼이 같은 값) */
  const ac = state === "locked" ? "S4-5" : state === "failed" ? "S4-7" : "S4-4";
  return (
    <div data-ac={ac} data-more={state} className="flex flex-col gap-1.5 pt-2">
      {state === "failed" ? (
        <p
          role="alert"
          className="text-destructive-strong text-body flex items-center justify-center gap-1"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {LIST_TEXT.moreFailed}
        </p>
      ) : null}
      <Button
        type="button"
        variant="line"
        size="sm"
        className="phone:h-11 phone:text-sm w-full"
        disabled={busy || state === "locked"}
        aria-busy={busy || undefined}
        onClick={onMore}
        data-ac={ac}
      >
        {busy ? (
          <>
            <Spinner />
            {LIST_TEXT.moreLoading}
          </>
        ) : state === "failed" ? (
          LIST_TEXT.retry
        ) : (
          LIST_TEXT.more
        )}
      </Button>
    </div>
  );
}

/**
 * 갱신 401(디자인 결정 65, D39⑥). 머리 아래 오류 한 줄 + `로그인하기`. 이 화면엔 쓰던 글이 없어 로그인 링크를
 * 둔다 — 전체 이동(`<a href>`)이라 남은 캐시도 같이 버린다. 받은 행은 그대로 누를 수 있다.
 */
function SessionLostNote() {
  return (
    <div data-ac="S4-7" className="mb-3 flex flex-wrap items-center gap-2">
      <p
        role="alert"
        className="text-destructive-strong text-body flex min-w-0 flex-1 items-center gap-1"
      >
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        {LIST_TEXT.sessionLost}
      </p>
      <Button
        asChild
        variant="line"
        size="sm"
        className="phone:h-11 phone:text-sm"
      >
        <a href={LOGIN_PATH} data-ac="S4-7">
          {LIST_TEXT.login}
        </a>
      </Button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
    />
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
