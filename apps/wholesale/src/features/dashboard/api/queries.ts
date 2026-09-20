"use client";

import {
  queryOptions,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { apiFetch, apiFetchPage } from "@ondo/api";
import { dashboardKeys } from "./keys";
import {
  ATTENTION_FETCH_SIZE,
  ATTENTION_SORT,
  QUEUE_PAGE_SIZE,
  QUEUE_SORT,
  REFRESH_INTERVAL_MS,
} from "../constants";
import {
  toAttentionView,
  toNewOrderRows,
  toSummaryPeek,
  toSummaryView,
} from "../derive";
import type {
  AttentionView,
  BackorderSku,
  DashboardSummary,
  DashboardSummaryPeek,
  NewOrderRowView,
  NewOrderSummary,
} from "../types";

/**
 * 대시보드 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 * 주문·미송 경로는 그 feature들에도 있지만 feature끼리 import 하지 않으니 다시 적는다.
 */
export const DASHBOARD_PATH = {
  summary: "/api/wholesale/dashboard/summary",
  orders: "/api/wholesale/orders",
  backorderSkus: "/api/wholesale/backorders/variants",
} as const;

/**
 * 세 쿼리가 같이 쓰는 폴링 옵션. 백그라운드 탭에선 멈추고, 창으로 돌아오면 즉시 한 번 받는다.
 * 앱 기본은 창 포커스 재조회가 꺼져 있다(providers — 어드민이 창을 옮길 때마다 전부 다시 부르면
 * 시끄럽다). 이 화면은 "돌아왔을 때 새 주문이 보여야 하는" 화면이라 여기만 켠다.
 */
const POLLING = {
  refetchInterval: REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

/**
 * 안에서 `useSuspenseQuery`만 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 * 예외는 `useDashboardSummaryPeek` 하나고 이유를 거기 적었다.
 */

/** summary 옵션의 원본. 기다리는 훅과 엿보는 훅이 같은 키·같은 요청을 나눠 써서 fetch가 한 번만 나간다 */
function summaryQueryOptions() {
  return queryOptions({
    queryKey: dashboardKeys.summary(),
    queryFn: () => apiFetch<DashboardSummary>(DASHBOARD_PATH.summary),
    ...POLLING,
  });
}

export function useDashboardSummaryQuery() {
  return useSuspenseQuery({
    ...summaryQueryOptions(),
    select: toSummaryView,
  });
}

/**
 * summary를 **기다리지 않고** 엿본다 — 큐·주의 패널의 경과 기준 시각(`now`), 탭 제목 배지, 큐 하단 취소 건수용.
 *
 * `useQuery`를 쓰는 유일한 자리다. summary가 실패해도 큐·주의 패널은 살아 있어야 하는데, 그 둘이
 * `useSuspenseQuery`로 summary를 같이 보면 한 경계에 묶여 같이 죽는다. 그래서 이 조각은 경계 밖에서
 * 있으면 쓰고 없으면 넘어간다(`undefined`). `isPending`·`isError`를 화면에서 가르지 않는다 — 값이 없을 뿐이다.
 * 같은 키를 보므로 요청이 한 번 더 나가지 않는다.
 */
export function useDashboardSummaryPeek(): DashboardSummaryPeek | undefined {
  const { data } = useQuery({
    ...summaryQueryOptions(),
    select: toSummaryPeek,
  });
  return data;
}

/**
 * 확정 대기 큐 — 주문 탭 목록과 같은 엔드포인트에 `filter=NEW`, 오래된 순.
 * `now`가 `select` 안에 들어간다 — 경과 표기는 서버 시각 기준이고, summary가 새로 올 때마다 다시 계산돼야 한다.
 */
export function useNewOrderQueueQuery(now: string) {
  return useSuspenseQuery({
    queryKey: dashboardKeys.newOrders(),
    queryFn: () =>
      apiFetchPage<NewOrderSummary>(DASHBOARD_PATH.orders, {
        searchParams: {
          filter: "NEW",
          sort: QUEUE_SORT,
          page: 0,
          size: QUEUE_PAGE_SIZE,
        },
      }),
    ...POLLING,
    select: (page): NewOrderRowView[] => toNewOrderRows(page.items, now),
  });
}

/** 주의 목록의 재료 — 미송 SKU 오래된 순 한 페이지. 상위 3·상위 2는 `toAttentionView`가 페이지 안에서 고른다 */
export function useAttentionQuery(now: string) {
  return useSuspenseQuery({
    queryKey: dashboardKeys.attention(),
    queryFn: () =>
      apiFetchPage<BackorderSku>(DASHBOARD_PATH.backorderSkus, {
        searchParams: {
          sort: ATTENTION_SORT,
          page: 0,
          size: ATTENTION_FETCH_SIZE,
        },
      }),
    ...POLLING,
    select: (page): AttentionView => toAttentionView(page.items, now),
  });
}
