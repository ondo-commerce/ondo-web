"use client";

import {
  queryOptions,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
  toInquiryView,
  toNewOrderRows,
  toSummaryPeek,
  toSummaryView,
  weekRangeOf,
} from "../derive";
import type {
  AttentionView,
  BackorderSku,
  DashboardSummary,
  DashboardSummaryPeek,
  InquiryStats,
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
  /** 초안 op(`x-ondo-draft`, #311). 실서버엔 아직 없어 404가 온다 — 카드 안 오류로 그린다(디자인 결정 50) */
  inquiryStats: "/api/wholesale/chat/inquiry-stats",
} as const;

/**
 * 네 쿼리(summary, 큐, 주의, 문의)가 같이 쓰는 폴링 옵션. 백그라운드 탭에선 멈추고, 창으로 돌아오면 즉시 한 번 받는다.
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

/**
 * 문의 카드 — 오늘 영업일 1일치(인자 없음 = 서버가 정한 오늘, 낮 12시 경계). 다른 세 쿼리와 같은 30초 polling.
 * 영업일을 FE가 정하지 않는다 — 사장 PC 시계가 틀리면 어제 숫자를 오늘로 부른다.
 */
export function useInquiryStatsQuery() {
  return useSuspenseQuery({
    queryKey: dashboardKeys.inquiryStats(),
    queryFn: () => apiFetch<InquiryStats>(DASHBOARD_PATH.inquiryStats),
    ...POLLING,
    select: toInquiryView,
  });
}

/**
 * 문의 카드 7일 줄(loop-08f S3) — 오늘 쿼리의 기준 영업일에서 6일 앞까지. 오늘 숫자가 있어야 부른다(이 훅은
 * 오늘 경계 안에서만 그려진다 — 오늘 최초 실패면 요청 0).
 *
 * **혼자 polling 하지 않는다.** 오늘 쿼리가 한 번 끝날 때마다(성공이든 실패든, `todaySettledAt`가 바뀔 때)
 * 한 번 다시 부른다. 자기 30초 타이머를 따로 두면 낮 12시를 넘는 주기에 오늘 응답보다 먼저 옛 기간을
 * 한 번 더 부른다(기획 S3-5 "옛 키 GET 0"). 오늘 응답 뒤에 부르니 주기는 오늘과 같은 30초다.
 * 기준 영업일이 바뀐 주기에는 다시 부르지 않는다 — 키가 바뀌어 `useQuery`가 새 기간을 직접 부른다.
 *
 * retry 0(기획 Q9 ①, Codex 15). 앱 기본 5xx 두 번 재시도가 polling과 겹치면 한 주기에 요청이 셋이 된다.
 * 실패하면 다음 주기가 재시도다(`chat/api/queries.ts`와 같은 이유).
 */
export function useInquiryWeekQuery(
  businessDay: string,
  todaySettledAt: number,
) {
  const range = weekRangeOf(businessDay);
  const query = useQuery({
    queryKey: dashboardKeys.inquiryWeek(range.from, range.to),
    queryFn: () =>
      apiFetch<InquiryStats>(DASHBOARD_PATH.inquiryStats, {
        searchParams: { from: range.from, to: range.to },
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { refetch } = query;
  const last = useRef({ businessDay, todaySettledAt });
  useEffect(() => {
    const prev = last.current;
    last.current = { businessDay, todaySettledAt };
    if (prev.businessDay !== businessDay) return;
    if (prev.todaySettledAt === todaySettledAt) return;
    void refetch();
  }, [businessDay, todaySettledAt, refetch]);
  return query;
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
