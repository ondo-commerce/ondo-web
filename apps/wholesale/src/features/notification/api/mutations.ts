"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { notificationKeys } from "./keys";
import { refreshHeaderCounts } from "@/shared/api/headerCountsKey";
import { NOTIFICATION_PATH } from "../constants";
import { markPagesRead, withUnread } from "../derive";
import type {
  HeaderCounts,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResult,
  NotificationPage,
} from "../types";

/**
 * `meta.sessionLoss: "inline"` — 401이어도 전역 핸들러가 `/login`으로 보내지 않는다(`app/sessionLoss.ts`).
 * 헤더는 어느 화면에나 있어서, 알림 하나 누른 게 다른 화면의 쓰던 글을 버리게 하면 안 된다(S11-13).
 * feature는 `app/`을 import할 수 없어 값을 다시 적는다 — 바꾸면 거기도 같이 바꾼다.
 */
const SESSION_LOSS_INLINE = { sessionLoss: "inline" } as const;

type ListData = InfiniteData<NotificationPage, string | null>;

/**
 * 읽음(ids 하나, 또는 모두). 성공하면:
 *  1. 받아 둔 목록의 그 행(모두면 전부)을 읽음으로 바꾼다 — 패널이 다시 받지 않아도 점이 사라진다
 *  2. 진행 중 count를 취소하고, 응답의 남은 수를 배지에 넣은 뒤 다시 받는다(S11-12 역전 규칙)
 *
 * 콜백을 훅 옵션에 둔다(`mutate`의 두 번째 인자가 아니라) — 행을 누르면 패널이 닫히며 컴포넌트가 사라지는데,
 * 호출별 콜백은 그때 불리지 않는다. 옵션 콜백은 mutation 자체가 부른다.
 */
export function useMarkNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: MarkNotificationsReadRequest) =>
      apiFetch<MarkNotificationsReadResult>(NOTIFICATION_PATH.read, {
        method: "POST",
        body: request,
      }),
    meta: SESSION_LOSS_INLINE,
    onSuccess: async (result, request) => {
      const ids = "ids" in request ? new Set(request.ids) : null;
      const readAt = new Date().toISOString();
      queryClient.setQueryData<ListData>(notificationKeys.list(), (data) =>
        data === undefined ? data : markPagesRead(data, ids, readAt),
      );
      await refreshHeaderCounts(queryClient, () =>
        queryClient.setQueryData<HeaderCounts | undefined>(
          notificationKeys.counts(),
          (prev) => withUnread(prev, result.notifications),
        ),
      );
    },
  });
}
