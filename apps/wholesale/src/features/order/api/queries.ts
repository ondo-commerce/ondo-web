"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { apiFetch, apiFetchPage, type PageMeta } from "@ondo/api";
import { orderKeys } from "./keys";
import {
  toOrderRowView,
  toOrderView,
  toPackingBatchViews,
  type OrderListQuery,
} from "../derive";
import type {
  OrderDetail,
  OrderFilter,
  OrderRowView,
  OrderSummary,
  OrderView,
  PackingBatchView,
  PackingQueueItem,
} from "../types";

/**
 * 주문·포장 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 */
export const ORDER_PATH = {
  orders: "/api/wholesale/orders",
  filters: "/api/wholesale/orders/filters",
  order: (orderId: number) => `/api/wholesale/orders/${orderId}`,
  confirm: (orderId: number) => `/api/wholesale/orders/${orderId}/confirm`,
  cancel: (orderId: number) => `/api/wholesale/orders/${orderId}/cancel`,
  packings: (orderId: number) => `/api/wholesale/orders/${orderId}/packings`,
  packing: (packingId: number) => `/api/wholesale/packings/${packingId}`,
} as const;

/**
 * 안에서 `useSuspenseQuery`만 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 */

export function useOrderListQuery(query: OrderListQuery) {
  return useSuspenseQuery({
    queryKey: orderKeys.list(query),
    queryFn: () =>
      apiFetchPage<OrderSummary>(ORDER_PATH.orders, {
        searchParams: {
          filter: query.filter,
          q: query.q,
          settlementStatus: query.settlementStatus,
          page: query.page,
          size: query.size,
        },
      }),
    select: (page): { rows: OrderRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toOrderRowView),
      meta: page.meta,
    }),
  });
}

/**
 * 상태 칩 건수. `filter`는 보내지 않는다(스펙: "목록의 필터를 여기에 걸면 칩 건수가
 * 자기 필터에 갇힌다"). `q`만 목록과 같은 값으로 보낸다.
 */
export function useOrderFiltersQuery(q: string | undefined) {
  return useSuspenseQuery({
    queryKey: orderKeys.filter(q),
    queryFn: () =>
      apiFetch<OrderFilter[]>(ORDER_PATH.filters, { searchParams: { q } }),
  });
}

export function useOrderDetailQuery(orderId: number) {
  return useSuspenseQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => apiFetch<OrderDetail>(ORDER_PATH.order(orderId)),
    select: (detail): OrderView => toOrderView(detail),
  });
}

/** 포장 대기열. 페이징 없음. `status`·`sort`는 안 보낸다 — 기본(만든 순)이면 된다 */
export function usePackingQueueQuery(orderId: number) {
  return useSuspenseQuery({
    queryKey: orderKeys.packings(orderId),
    queryFn: () => apiFetch<PackingQueueItem[]>(ORDER_PATH.packings(orderId)),
    select: (items): PackingBatchView[] => toPackingBatchViews(items),
  });
}
