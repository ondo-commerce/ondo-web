"use client";

import { Button, Popover } from "@ondo/ui";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { NotificationPanel } from "./NotificationPanel";
import { notificationKeys } from "../api/keys";
import { useMarkNotificationsReadMutation } from "../api/mutations";
import {
  hasNewer,
  isCurrentAddress,
  notificationBadgeLabel,
  unreadOf,
} from "../derive";
import type {
  FetchedNotificationPage,
  HeaderCounts,
  NotificationRowView,
  PanelNotice,
} from "../types";
import {
  HEADER_COUNTS_KEY,
  refreshHeaderCounts,
  useHeaderCountsValue,
} from "@/shared/api/headerCounts";

type ListData = InfiniteData<FetchedNotificationPage, string | null>;

/**
 * 헤더 종 + 알림 패널(06b S2, 디자인 결정 47~59). 도매 `NotificationBell`의 소매판이다(앱 사이 import 금지라 복제).
 * 채팅 링크 오른쪽, 장바구니 왼쪽에 `app/(shop)/layout.tsx`가 끼운다. count는 채팅 링크가 내는 요청 하나를
 * 같이 읽는다(`useHeaderCountsValue`, S2-1 "요청 2회 0").
 *
 * 패널 상태(안내 한 줄, 잠긴 행)를 패널이 아니라 여기 두는 이유: Popover 내용은 닫히면 사라진다.
 * 그래도 상태는 열 때마다 처음으로 돌아가야 해서 여는 순간 지운다.
 *
 * 읽음 규칙(§4-2 3, 4):
 *  - 안 읽은 행 → 그 행 잠김 → read `{ids}` 1회(응답 안 기다림) + 이동. 같은 틱 연타도 1회(S2-5)
 *  - 읽은 행 → POST 없이 이동. 모르는 type, kind → 이동 없이 읽음만. 지금 주소와 같으면 `router.refresh()`
 *  - `모두 읽음` N은 count 값(받은 행 수가 아니다). "새 알림 보기" 줄이 떠 있으면 POST를 안 보내고 첫 장을 다시
 *    받는다(도매 F3와 같은 이유 — expectedUnread는 다른 기기 읽음 1 + 새 1을 못 가른다). 409면 count와 첫 장 다시
 *  - "새 알림 보기"는 첫 행 id와 count `latestNotificationId` 비교(`hasNewer`). 수로 비교하지 않는다
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const counts = useHeaderCountsValue();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<PanelNotice>(null);
  /** 누른 행. 화면 표시(aria-disabled)는 state, 같은 틱 연타 막기는 ref — state는 다음 렌더에야 보인다 */
  const [lockedIds, setLockedIds] = useState<ReadonlySet<number>>(new Set());
  const lockedRef = useRef(new Set<number>());
  /** `모두 읽음` 한 번에 POST 한 건. `isPending`은 다음 틱에야 바뀌어 같은 틱 3연타를 못 막는다 */
  const markAllBusy = useRef(false);

  const rowRead = useMarkNotificationsReadMutation();
  const markAll = useMarkNotificationsReadMutation();

  const bell = notificationBadgeLabel(counts);

  /* 누른 순간의 값을 캐시에서 읽는다 — 렌더 때 값은 30초 count가 막 바뀐 틱에 하나 늦을 수 있다 */
  const cachedCounts = () =>
    queryClient.getQueryData<HeaderCounts>(HEADER_COUNTS_KEY);
  const cachedFirstPage = () =>
    queryClient.getQueryData<ListData>(notificationKeys.list())?.pages[0];

  const onOpenChange = (next: boolean) => {
    if (next) {
      /* 열 때마다 첫 장부터 받는다. 지난번 이어 받은 장이 남아 있으면 그게 먼저 그려진다 */
      queryClient.removeQueries({ queryKey: notificationKeys.list() });
      setNotice(null);
      lockedRef.current = new Set();
      setLockedIds(new Set());
    }
    setOpen(next);
  };

  /** 첫 장만 남기고 다시 받는다. 이어 받은 장은 버린다. count도 같이 */
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
    lock(row.id);
    if (row.unread) rowRead.mutate({ ids: [row.id] });
    setOpen(false);
    if (isCurrentAddress(row.href, window.location)) {
      router.refresh();
      return true;
    }
    return false;
  };

  const onMarkAll = () => {
    if (markAllBusy.current) return;
    const expected = unreadOf(cachedCounts());
    if (expected === null || expected < 1) return;
    markAllBusy.current = true;
    const release = () => {
      markAllBusy.current = false;
    };
    if (hasNewer(cachedCounts(), cachedFirstPage())) {
      setNotice("newerFirst");
      void reloadFirstPage().finally(release);
      return;
    }
    setNotice(null);
    markAll
      .mutateAsync({ all: true, expectedUnread: expected })
      .catch(async (error: unknown) => {
        if (isApiError(error) && error.status === 409) {
          setNotice("changed");
          await reloadFirstPage();
        } else if (isApiError(error) && error.status === 401)
          setNotice("sessionLost");
        else setNotice("markFailed");
      })
      .finally(release);
  };

  const onShowNewer = () => {
    setNotice(null);
    void reloadFirstPage();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {/* 채팅 링크, 장바구니와 같은 32px(≤40rem 44, 결정 47). 열린 동안 secondary 면(결정 59) — 채팅 링크의
            `aria-current` accent 면과 다르다 */}
        <Button
          type="button"
          variant="ghost"
          aria-label={bell.label}
          className="data-[state=open]:bg-secondary data-[state=open]:text-foreground relative size-8 px-0 phone:size-11"
          data-ac="S2-1 S2-2 S2-8"
        >
          <Bell aria-hidden className="size-4.5" />
          {bell.badge !== null ? (
            /* CartButton 카운터와 같은 모양(결정 47) — 소매 헤더의 숫자 셋이 같은 모양이어야 한다 */
            <span
              aria-hidden
              data-ac="S2-1 S2-2"
              className="bg-foreground text-card pointer-events-none absolute top-px right-px grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none tracking-normal tabular-nums"
            >
              {bell.badge}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        /* 폰 폭에서 좌우 16 안쪽(결정 50). Radix가 화면 끝에서 16을 남기고 밀어 넣는다 */
        collisionPadding={16}
        aria-labelledby={titleId}
        data-ac="S2-4"
        aria-busy={markAll.isPending || undefined}
        /* 첫 포커스는 제목(tabindex -1). Radix 기본은 첫 버튼(`모두 읽음`)이라 Enter 한 번에 전부 읽힌다 */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        /* 높이: 헤더 57 + 간격 6 + 아래 16(결정 50). 그림자는 같은 헤더의 계정 메뉴와 같은 dropdown */
        className="flex max-h-[calc(100dvh-79px)] w-90 flex-col shadow-dropdown phone:w-[calc(100vw-2rem)]"
      >
        <NotificationPanel
          titleId={titleId}
          titleRef={titleRef}
          scrollRef={scrollRef}
          counts={counts}
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
