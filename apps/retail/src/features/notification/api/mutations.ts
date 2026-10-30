"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { notificationKeys } from "./keys";
import { NOTIFICATION_PATH } from "../constants";
import { markPagesRead } from "../derive";
import type {
  FetchedNotificationPage,
  HeaderCounts,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResult,
} from "../types";
import {
  HEADER_COUNTS_KEY,
  refreshHeaderCounts,
  SESSION_LOSS_INLINE,
  sessionGeneration,
  stopHeaderCounts,
} from "@/shared/api/headerCounts";
import { mockReady } from "@/shared/api/mockReady";
import { withUnreadNotifications } from "@/shared/headerCounts";

type ListData = InfiniteData<FetchedNotificationPage, string | null>;

interface ReadContext {
  /** 읽음 보내기 전에 목록 요청을 취소했는지. 했으면 성공 뒤 다시 받는다 */
  listCancelled: boolean;
  /** 보낼 때의 세션 세대. 응답 때 다르면 계정이 바뀐 것이라 콜백이 아무것도 안 한다(codex-meta M1) */
  session: number;
}

/**
 * 읽음(ids 하나, 또는 모두). 도매 `useMarkNotificationsReadMutation`과 같은 순서다.
 *
 * 보내기 전에 진행 중인 목록 요청(첫 장, `더 보기`)을 취소한다(05b-2 R1). 그 요청은 읽음 전 값을 들고 온다 —
 * 읽음이 먼저 끝나고 그게 늦게 도착하면 헤더는 0인데 점이 되살아난다. 취소된 응답은 TanStack이 버린다.
 *
 * 성공하면:
 *  1. 받아 둔 목록의 그 행(모두면 전부)을 읽음으로 바꾼다 — 패널이 다시 받지 않아도 점이 사라진다
 *  2. 모두 읽음이었거나, 목록 요청을 취소했거나 그 사이 새로 떠났으면 목록을 다시 받는다(§4-2 4 "목록 다시 받기").
 *     단건이고 아무것도 안 떴으면 안 받는다 — 열린 패널은 저절로 안 바뀐다(D36⑤)
 *  3. 진행 중 count를 취소하고, 응답의 남은 수를 종 배지에 넣은 뒤 다시 받는다(§4-1 4 늦은 count 규칙)
 *
 * 401이면 헤더 count도 멈춘다(와이어프레임 `#state-mark-all` "헤더 count 도 같이 멈춘다"). 세션이 없는데 30초마다
 * 두드리지 않는다. 다시 도는 건 로그인 뒤(`clearHeaderSession`)나 새로고침이다.
 *
 * 콜백을 훅 옵션에 둔다(`mutate`의 두 번째 인자가 아니라) — 행을 누르면 패널이 닫히며 컴포넌트가 사라지는데,
 * 호출별 콜백은 그때 불리지 않는다. 옵션 콜백은 mutation 자체가 부른다.
 */
export function useMarkNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: MarkNotificationsReadRequest) => {
      await mockReady();
      return apiFetch<MarkNotificationsReadResult>(NOTIFICATION_PATH.read, {
        method: "POST",
        body: request,
      });
    },
    meta: SESSION_LOSS_INLINE,
    onMutate: async (): Promise<ReadContext> => {
      /* 세대는 await 전에 적는다 — 취소를 기다리는 사이 로그아웃이 끼어도 보낸 계정 기준이다 */
      const session = sessionGeneration();
      const listKey = notificationKeys.list();
      const listCancelled = queryClient.isFetching({ queryKey: listKey }) > 0;
      if (listCancelled) await queryClient.cancelQueries({ queryKey: listKey });
      return { listCancelled, session };
    },
    onSuccess: async (result, request, context) => {
      if (context.session !== sessionGeneration()) return;
      const listKey = notificationKeys.list();
      const all = "all" in request;
      const listStale =
        context.listCancelled ||
        queryClient.isFetching({ queryKey: listKey }) > 0;
      if (listStale) await queryClient.cancelQueries({ queryKey: listKey });
      const ids = "ids" in request ? new Set(request.ids) : null;
      const readAt = new Date().toISOString();
      queryClient.setQueryData<ListData>(listKey, (data) =>
        data === undefined ? data : markPagesRead(data, ids, readAt),
      );
      if (all || listStale)
        void queryClient.invalidateQueries({ queryKey: listKey });
      await refreshHeaderCounts(queryClient, () =>
        queryClient.setQueryData<HeaderCounts | undefined>(
          HEADER_COUNTS_KEY,
          (prev) => withUnreadNotifications(prev, result.notifications),
        ),
      );
    },
    onError: async (error, _request, context) => {
      /* 앞 계정의 늦은 401이 새 계정 count를 멈추지 않게(codex-meta M1). onMutate 전에 실패했으면 context가 없다 */
      if (context === undefined || context.session !== sessionGeneration())
        return;
      /* 성공 경로와 같은 취소와 울타리(`stopHeaderCounts`). 값만 넣으면 늦은 count가 덮는다(03-review R1) */
      if (isApiError(error) && error.status === 401)
        await stopHeaderCounts(queryClient);
    },
  });
}
