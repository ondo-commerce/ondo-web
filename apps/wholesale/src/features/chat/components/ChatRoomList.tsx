"use client";

import { Badge, Button, cn, Panel, SearchInput, Segmented } from "@ondo/ui";
import Link from "next/link";
import type { KeyboardEvent, RefObject } from "react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  AutoReplyNoteLine,
  AutoReplySwitch,
  useAutoReplyToggle,
} from "./AutoReplySwitch";
import { useRoomListQuery } from "../api/queries";
import { isChatSessionLostError } from "../api/session";
import {
  LIST_TEXT,
  ROOM_LIST_FILTER_LABEL,
  ROOM_LIST_FILTERS,
  ROOM_QUERY_MAX,
  ROOM_SEARCH_DEBOUNCE_MS,
  SESSION_LOST_TEXT,
} from "../constants";
import {
  hasListCondition,
  normalizeQuery,
  roomHref,
  toRoomRows,
} from "../derive";
import type {
  ChatRoomRowView,
  ReadMarks,
  RoomListFilter,
  RoomListParams,
} from "../types";
import { QueryBoundary, QueryErrorView } from "@/shared/api/QueryBoundary";

interface RowsProps {
  selectedRoomId: number | null;
  readMarks: ReadMarks;
  /** 입력창 Esc가 선택 행으로 돌아올 때(S4-11) 부르는 쪽이 이 목록 안에서 행을 찾는다 */
  listRef: RefObject<HTMLUListElement | null>;
  /** 행을 클릭하거나 Enter로 열었다 — 부르는 쪽이 입력창으로 포커스를 옮긴다(S2-6) */
  onOpen: () => void;
  /** 조건 결과 0의 `조건 지우기`(디자인 결정 56) */
  onClear: () => void;
}

interface ListProps extends RowsProps {
  /** 지금 조건(칩, 검색). 칩과 행 링크는 이 값을 바로 쓴다 */
  list: RoomListParams;
  /** 조건 지우기마다 오른다 — 검색칸을 빈칸으로 다시 마운트하고 포커스 */
  searchReset: number;
  /** 조건 없는 목록이 0개로 확인됐다 — 걸러 낼 게 없어 필터 줄을 숨긴다(디자인 결정 57) */
  noRooms: boolean;
  onFilter: (filter: RoomListFilter) => void;
  onQuery: (q: string | null) => void;
}

/**
 * 왼쪽 목록 패널(360px 고정, 디자인 결정 1). 실패와 로딩은 이 패널 안에서만.
 * 머리 오른쪽에 자동 답변 스위치(S9, 결정 22) — 설정은 도매처 하나에 하나라 방 머리가 아니라 여기다.
 *
 * 필터 줄(loop-08b S4)은 경계 밖이다 — 목록이 실패해도 칩과 검색칸은 남아 바로 조건을 바꿀 수 있다(S4-6).
 * 조건을 바꾸면 **이전 행을 그대로 두고** 새 목록을 뒤에서 받는다(`useDeferredValue`). 목록은 Suspense라 키가
 * 바뀌면 원래는 스켈레톤으로 떨어진다. 미뤄 둔 값으로 그리면 React가 새 값의 렌더가 기다리는 동안 옛 화면을 둔다.
 * 그동안 제목 옆 "찾는 중"과 행 자리 `aria-busy`(디자인 결정 55). 15초 갱신은 조건이 그대로라 표시가 안 뜬다.
 */
export function ChatRoomListPanel({
  list,
  searchReset,
  noRooms,
  onFilter,
  onQuery,
  ...rows
}: ListProps) {
  const autoReply = useAutoReplyToggle();
  const shown = useDeferredValue(list);
  const busy = shown !== list;
  return (
    <Panel role="region" aria-label={LIST_TEXT.label} className="w-90 shrink-0">
      <Panel.Title
        suffix={busy ? <BusyMark /> : null}
        action={<AutoReplySwitch state={autoReply} />}
      >
        {LIST_TEXT.title}
      </Panel.Title>
      <AutoReplyNoteLine note={autoReply.note} />
      {noRooms ? null : (
        <ListFilterBar
          key={searchReset}
          list={list}
          focusOnMount={searchReset > 0}
          onFilter={onFilter}
          onQuery={onQuery}
        />
      )}
      <div
        className="flex min-h-0 flex-1 flex-col"
        aria-busy={busy || undefined}
        data-ac="S4-6"
      >
        <QueryBoundary
          /* 실패한 목록도 조건을 바꾸면 새 조건으로 다시 받는다 — `다시 시도`를 따로 안 눌러도 */
          resetKeys={[shown.filter, shown.q]}
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
          <ChatRoomList {...rows} shown={shown} linkParams={list} />
        </QueryBoundary>
      </div>
    </Panel>
  );
}

/** 제목 옆 "찾는 중"(디자인 결정 55). 12px muted, 스피너는 보내는 중 말풍선과 같은 모양 */
function BusyMark() {
  return (
    <span
      data-ac="S4-6"
      className="text-muted-foreground flex items-center gap-1.5 text-xs"
    >
      <span
        aria-hidden
        className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
      />
      {LIST_TEXT.busy}
    </span>
  );
}

/**
 * 검색칸(위) + 칩(아래), 둘 다 목록 안쪽 전폭(디자인 결정 52 — 주문 탭과 같은 순서).
 *
 * 검색은 마지막 입력 300ms 뒤 한 번 묻는다. **한글 조합 중엔 타이머를 걸지 않고** 조합이 끝난 때부터 센다
 * (§4-2 2) — 안 그러면 "ㅅ", "소", "솜"마다 요청이 나간다. 칸 글자는 이 컴포넌트 state, 목록이 묻는 값은
 * 부르는 쪽 조건이다. 조건 지우기는 이 컴포넌트를 다시 마운트해 칸을 비운다(`key`).
 */
function ListFilterBar({
  list,
  focusOnMount,
  onFilter,
  onQuery,
}: {
  list: RoomListParams;
  focusOnMount: boolean;
  onFilter: (filter: RoomListFilter) => void;
  onQuery: (q: string | null) => void;
}) {
  const [text, setText] = useState(list.q ?? "");
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  };
  const schedule = (value: string) => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      onQuery(normalizeQuery(value));
    }, ROOM_SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => cancel, []);

  /* packages/ui SearchInput이 ref를 받지 않아 감싼 상자에서 찾는다(입력창과 같은 방식) */
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) boxRef.current?.querySelector("input")?.focus();
  }, [focusOnMount]);

  return (
    <div className="grid shrink-0 gap-3 pb-4" data-ac="S4-8">
      <div ref={boxRef}>
        <SearchInput
          className="w-full"
          placeholder={LIST_TEXT.search}
          aria-label={LIST_TEXT.search}
          maxLength={ROOM_QUERY_MAX}
          value={text}
          data-ac="S4-3 S4-5 S4-8 S4-10"
          onChange={(e) => {
            setText(e.target.value);
            if (!composing.current) schedule(e.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
            cancel();
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            schedule(e.currentTarget.value);
          }}
        />
      </div>
      <Segmented
        className="w-full"
        role="radiogroup"
        aria-label={LIST_TEXT.filterGroup}
        value={list.filter}
        onValueChange={(next) => {
          const found = ROOM_LIST_FILTERS.find((f) => f === next);
          if (found) onFilter(found);
        }}
        data-ac="S4-2 S4-8"
      >
        {ROOM_LIST_FILTERS.map((f) => (
          <Segmented.Item key={f} value={f} data-ac="S4-2 S4-5">
            {ROOM_LIST_FILTER_LABEL[f]}
          </Segmented.Item>
        ))}
      </Segmented>
    </div>
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
  onClear,
  shown,
  linkParams,
}: RowsProps & {
  /** 그리는 목록의 조건(미뤄 둔 값). 바꾸는 중엔 지금 조건보다 한 박자 늦다 */
  shown: RoomListParams;
  /** 행 링크에 달 조건(지금 값) */
  linkParams: RoomListParams;
}) {
  const query = useRoomListQuery(shown);
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

  /* 조건 결과 0(§4-2 5 2, 3). 오른쪽은 그대로 — 고르세요든 열어 둔 방이든. 칩만으로 0이어도 같다 */
  if (rows.length === 0 && hasListCondition(shown)) {
    return (
      <div
        className="grid justify-items-center gap-3 py-12 text-center"
        data-ac="S4-5 S4-11"
      >
        <p className="text-muted-foreground text-sm">{LIST_TEXT.noMatch}</p>
        <Button
          type="button"
          variant="line"
          size="sm"
          onClick={onClear}
          data-ac="S4-5"
        >
          {LIST_TEXT.clearConditions}
        </Button>
      </div>
    );
  }

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
    /* relative: 행 안 sr-only 글(absolute)이 이 스크롤 상자를 기준으로 서게. 없으면 기준이 문서라 아래 행의
       sr-only가 화면 밖에 서서 h-dvh 화면에 문서 세로 스크롤이 생긴다(1470에서 +1487px, S4-8) */
    <div className="scroll-slim relative min-h-0 flex-1 overflow-y-auto">
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
              href={roomHref(row.roomId, linkParams.filter, linkParams.q)}
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
  href,
  selected,
  tabbable,
  onFocus,
  onOpen,
}: {
  row: ChatRoomRowView;
  /** 지금 조건을 단 주소(`roomHref`). 방을 옮겨도 칩과 검색이 따라간다 */
  href: string;
  selected: boolean;
  tabbable: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-room-id={row.roomId}
      data-ac="S2-2 S2-5 S4-1"
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
