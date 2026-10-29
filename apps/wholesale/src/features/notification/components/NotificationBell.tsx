"use client";

import { IconButton, Popover } from "@ondo/ui";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { Bell } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { CountBadge } from "./CountBadge";
import { NotificationPanel } from "./NotificationPanel";
import { notificationKeys } from "../api/keys";
import { useMarkNotificationsReadMutation } from "../api/mutations";
import { bellBadge, newerCount, unreadOf } from "../derive";
import { refreshHeaderCounts } from "@/shared/api/headerCountsKey";
import { useSingleFlight } from "@/shared/lib/useSingleFlight";
import type {
  HeaderCounts,
  NotificationPage,
  NotificationRowView,
  PanelNotice,
} from "../types";

type ListData = InfiniteData<NotificationPage, string | null>;

/**
 * 헤더 종 + 알림 패널(디자인 결정 28, A안). packages/ui `Popover` 360, 종 아래 오른쪽 맞춤.
 *
 * 패널 상태(연 때 수, 안내 한 줄, 잠긴 행)를 패널이 아니라 여기 두는 이유: Popover 내용은 닫히면 사라진다.
 * 그래도 상태는 열 때마다 처음으로 돌아가야 해서 여는 순간 지운다.
 *
 * 읽음 규칙(Q1, 01-plan §4-1 7, 8):
 *  - 안 읽은 행 → 그 행 잠김 → read `{ids}` 1회(응답 안 기다림) + 이동. 같은 틱 연타도 1회(S11-5)
 *  - 읽은 행 → POST 없이 이동. 모르는 type → 이동 없이 읽음만(S11-16)
 *  - `모두 읽음` N은 count 값(받은 행 수가 아니다, S11-8). 409면 아무것도 안 바꾸고 다시 받는다(S11-9)
 *  - "새 알림 N개 보기"는 count 차이다. 연 뒤 다른 기기가 하나 읽고 새 것이 하나 오면 수가 같아 줄이 안 뜨고,
 *    `모두 읽음`도 409 없이 그 새 행까지 읽는다. 계약 §5-2가 허용한 한계다 — 목록을 따로 엿보면 30초마다 GET이
 *    늘고(§4-1⑤) 계약에 없는 차단이 생겨서 뺐다(03-review M1 M2). 06b의 latestNotificationId로 푼다
 */
export function NotificationBell({
  counts,
}: {
  counts: HeaderCounts | undefined;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  /** 패널을 연 때(또는 마지막으로 첫 장을 다시 받은 때)의 안 읽음 수. "새 알림 N개 보기"의 기준 */
  const [baseline, setBaseline] = useState<number | null>(null);
  const [notice, setNotice] = useState<PanelNotice>(null);
  /** 누른 행. 화면 표시(aria-disabled)는 state, 같은 틱 연타 막기는 ref — state는 다음 렌더에야 보인다 */
  const [lockedIds, setLockedIds] = useState<ReadonlySet<number>>(new Set());
  const lockedRef = useRef(new Set<number>());

  const rowRead = useMarkNotificationsReadMutation();
  const markAll = useMarkNotificationsReadMutation();
  const markAllFlight = useSingleFlight();

  const bell = bellBadge(counts);
  const unread = unreadOf(counts);

  const readCachedUnread = useCallback(
    () =>
      unreadOf(
        queryClient.getQueryData<HeaderCounts>(notificationKeys.counts()),
      ),
    [queryClient],
  );

  const onOpenChange = (next: boolean) => {
    if (next) {
      /* 열 때마다 첫 장부터 받는다. 지난번 이어 받은 장이 남아 있으면 그게 먼저 그려진다 */
      queryClient.removeQueries({ queryKey: notificationKeys.list() });
      setBaseline(unread);
      setNotice(null);
      lockedRef.current = new Set();
      setLockedIds(new Set());
    }
    setOpen(next);
  };

  /** 첫 장만 남기고 다시 받는다. 이어 받은 장은 버린다. count도 같이, 기준 수는 그 뒤 값으로 */
  const reloadFirstPage = async () => {
    queryClient.setQueryData<ListData>(notificationKeys.list(), (data) =>
      data === undefined
        ? data
        : {
            pages: data.pages.slice(0, 1),
            pageParams: data.pageParams.slice(0, 1),
          },
    );
    await Promise.all([
      queryClient.refetchQueries({ queryKey: notificationKeys.list() }),
      refreshHeaderCounts(queryClient),
    ]);
    setBaseline(readCachedUnread());
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const lock = (id: number) => {
    lockedRef.current.add(id);
    setLockedIds(new Set(lockedRef.current));
  };

  const unlock = (id: number) => {
    lockedRef.current.delete(id);
    setLockedIds(new Set(lockedRef.current));
  };

  /**
   * 행 누름. `true`를 돌려주면 이동을 막는다(부르는 쪽이 preventDefault).
   * 잠긴 행, 모두 읽음 처리 중이면 아무것도 안 한다.
   */
  const onRowActivate = (row: NotificationRowView): boolean => {
    if (lockedRef.current.has(row.id) || markAll.isPending) return true;
    setNotice(null);
    if (row.href === null) {
      /* 모르는 type — 패널에 남는다. 응답이 오면 잠금을 풀어 읽은 행 모양으로 돌아온다 */
      if (row.unread) {
        lock(row.id);
        rowRead.mutate({ ids: [row.id] }, { onSettled: () => unlock(row.id) });
      }
      return true;
    }
    if (row.unread) {
      lock(row.id);
      rowRead.mutate({ ids: [row.id] });
    }
    if (!row.unread) lock(row.id);
    setOpen(false);
    return false;
  };

  const onMarkAll = () =>
    markAllFlight((release) => {
      const expected = unread;
      if (expected === null || expected < 1) {
        release();
        return;
      }
      setNotice(null);
      markAll
        .mutateAsync({ all: true, expectedUnread: expected })
        .then(
          () => setBaseline(readCachedUnread()),
          async (error: unknown) => {
            if (isApiError(error) && error.status === 409) {
              setNotice("changed");
              await reloadFirstPage();
            } else setNotice("markFailed");
          },
        )
        .finally(release);
    });

  const onShowNewer = () => {
    setNotice(null);
    void reloadFirstPage();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {/* 채팅 링크와 같은 32px(와이어프레임 .ibtn, QA F9). 기본 sm(28px)이면 나란히 놓였을 때 크기가 다르다 */}
        <IconButton
          variant="ghost"
          size="md"
          aria-label={bell.label}
          title="알림"
          /* 열린 동안은 hover와 같은 면(와이어프레임 `.ibtn[aria-expanded]` = secondary, QA F7).
             accent는 흰 헤더에서 거의 안 보인다(실측 L 98.3) */
          className="data-[state=open]:bg-secondary data-[state=open]:text-foreground relative"
          data-ac="S11-2 S11-4"
        >
          <Bell aria-hidden />
          {bell.badge !== null ? (
            <CountBadge text={bell.badge} data-ac="S11-2 S11-3" />
          ) : null}
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        aria-labelledby={titleId}
        data-ac="S11-4"
        aria-busy={markAll.isPending || undefined}
        /* 첫 포커스는 제목(tabindex -1). Radix 기본은 첫 버튼(`모두 읽음`)이라 Enter 한 번에 전부 읽힌다 */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        className="flex max-h-[calc(100dvh-70px)] w-90 flex-col"
      >
        <NotificationPanel
          titleId={titleId}
          titleRef={titleRef}
          scrollRef={scrollRef}
          unread={unread}
          newer={newerCount(baseline, unread)}
          notice={notice}
          marking={markAll.isPending}
          lockedIds={lockedIds}
          onMarkAll={onMarkAll}
          onShowNewer={onShowNewer}
          onRowActivate={onRowActivate}
        />
      </Popover.Content>
    </Popover>
  );
}
