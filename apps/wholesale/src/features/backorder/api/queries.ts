"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { apiFetchBody, apiFetchPage, type PageMeta } from "@ondo/api";
import { backorderKeys } from "./keys";
import { SKU_LIST_SORT } from "../constants";
import {
  sortSkus,
  toDetailView,
  toSkuView,
  type BackorderListQuery,
} from "../derive";
import type {
  BackorderDetailView,
  BackorderList,
  BackorderSku,
  BackorderSkuView,
} from "../types";

/**
 * 미송 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 */
export const BACKORDER_PATH = {
  skus: "/api/wholesale/backorders/variants",
  skuBackorders: (variantId: number) =>
    `/api/wholesale/variants/${variantId}/backorders`,
  allocations: "/api/wholesale/backorders/allocations",
  expectedInbound: (variantId: number) =>
    `/api/wholesale/variants/${variantId}/expected-inbound`,
} as const;

/**
 * 안에서 `useSuspenseQuery`만 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 */

/**
 * 미송 SKU 목록. `sort`는 화면 규칙(`backorderQty,desc`)을 명시해 보낸다 — 이유는 `SKU_LIST_SORT`.
 * 동률 2차 키는 서버가 못 받아서 페이지 안에서 `sortSkus`가 고정한다(#201).
 */
export function useBackorderSkusQuery(query: BackorderListQuery) {
  return useSuspenseQuery({
    queryKey: backorderKeys.list(query),
    queryFn: () =>
      apiFetchPage<BackorderSku>(BACKORDER_PATH.skus, {
        searchParams: {
          q: query.q,
          page: query.page,
          size: query.size,
          sort: SKU_LIST_SORT,
        },
      }),
    select: (page): { rows: BackorderSkuView[]; meta: PageMeta } => ({
      rows: sortSkus(page.items.map(toSkuView)),
      meta: page.meta,
    }),
  });
}

/**
 * SKU의 미송 건 + 요약. 봉투가 `{ data, stats }`라 `apiFetchBody`로 통째로 받는다.
 * 펼친 행·우측 요약·예상 입고일 폼이 같은 키를 봐서 한 번만 받는다.
 * `sort`는 안 보낸다 — 화면 정렬(주문 일시 오래된 순)은 `derive.sortByOrderedAt`이 한다.
 */
export function useSkuBackordersQuery(variantId: number) {
  return useSuspenseQuery({
    queryKey: backorderKeys.detail(variantId),
    queryFn: () =>
      apiFetchBody<BackorderList>(BACKORDER_PATH.skuBackorders(variantId)),
    select: (list): BackorderDetailView => toDetailView(list),
  });
}
