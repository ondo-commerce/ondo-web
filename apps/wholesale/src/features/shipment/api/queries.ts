"use client";

import {
  queryOptions,
  useQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { apiFetch, apiFetchPage, type PageMeta } from "@ondo/api";
import { shipmentKeys } from "./keys";
import {
  OUTBOUND_PAGE_SIZE,
  RETAILER_PAGE_SIZE,
  STAGE_STATUS,
} from "../constants";
import {
  sumCounts,
  toOutboundRetailerRow,
  toOutboundRowView,
  toOutboundView,
  toPackingRetailerRow,
  toPackingRowView,
  toStatementView,
} from "../derive";
import type {
  OutboundDetail,
  OutboundRetailer,
  OutboundRowView,
  OutboundStatus,
  OutboundSummary,
  OutboundView,
  PackingRetailer,
  PackingRow,
  PackingRowView,
  RetailerRowView,
  ShipmentStage,
  Statement,
  StatementView,
} from "../types";

/**
 * 출고 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 */
export const SHIPMENT_PATH = {
  packingRetailers: "/api/wholesale/packing-items/retailers",
  packingItems: "/api/wholesale/packing-items",
  outboundRetailers: "/api/wholesale/outbounds/retailers",
  outbounds: "/api/wholesale/outbounds",
  outbound: (outboundId: number) => `/api/wholesale/outbounds/${outboundId}`,
  ship: (outboundId: number) => `/api/wholesale/outbounds/${outboundId}/ship`,
  statement: (outboundId: number) =>
    `/api/wholesale/outbounds/${outboundId}/statement`,
} as const;

/** 서버에 보낼 검색어. 빈 문자열은 안 보낸다(키에도 `undefined`로 들어간다) */
export function toQ(q: string): string | undefined {
  return q === "" ? undefined : q;
}

export interface PackingRowsQuery {
  retailerId: number;
  q: string | undefined;
}

export interface OutboundRetailersQuery {
  status: OutboundStatus;
  q: string | undefined;
}

export interface OutboundListQuery {
  retailerId: number;
  status: OutboundStatus;
  q: string | undefined;
}

/**
 * 안에서 `useSuspenseQuery`를 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * 예외는 칩 건수 셋(`useQueries`, 아래 설명). `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 *
 * 소매처 목록 둘은 **옵션 객체**로 둔다 — 칩 건수(합계)와 아코디언(행)이 같은 키를 다른
 * `select`로 본다. 같은 리소스는 같은 키여야 한쪽을 다시 받으면 다른 쪽도 새로워진다.
 */

/** 포장 대기 소매처. 페이징 없음(스펙: 대기 중인 소매처만이라 수가 제한적) */
export function packingRetailersQueryOptions(q: string | undefined) {
  return queryOptions({
    queryKey: shipmentKeys.packingRetailers(q),
    queryFn: () =>
      apiFetch<PackingRetailer[]>(SHIPMENT_PATH.packingRetailers, {
        searchParams: { q },
      }),
  });
}

/**
 * 출고 소매처. 첫 페이지(100곳)만 — 화면에 페이저가 없다. `from`·`to`·`sort`는 안 보낸다(화면에 없다).
 */
export function outboundRetailersQueryOptions(query: OutboundRetailersQuery) {
  return queryOptions({
    queryKey: shipmentKeys.outboundRetailers(query),
    queryFn: () =>
      apiFetchPage<OutboundRetailer>(SHIPMENT_PATH.outboundRetailers, {
        searchParams: {
          status: query.status,
          q: query.q,
          page: 0,
          size: RETAILER_PAGE_SIZE,
        },
      }),
  });
}

export function usePackingRetailersQuery(q: string | undefined) {
  return useSuspenseQuery({
    ...packingRetailersQueryOptions(q),
    select: (rows): RetailerRowView[] => rows.map(toPackingRetailerRow),
  });
}

/**
 * 한 소매처의 포장 대기 줄. 페이징 없음(스펙: 체크박스로 고른 뒤 한 번에 보내는 화면).
 * `q`는 소매처 목록과 같은 값이어야 머리의 건수와 맞는다(스펙 설명). `receiveBy`는 안 보낸다 —
 * 수령방식 필터는 받은 목록 안에서 화면이 건다(머리 집계는 필터와 무관해야 한다).
 */
export function usePackingRowsQuery(query: PackingRowsQuery) {
  return useSuspenseQuery({
    queryKey: shipmentKeys.packingRows(query),
    queryFn: () =>
      apiFetch<PackingRow[]>(SHIPMENT_PATH.packingItems, {
        searchParams: { retailerId: query.retailerId, q: query.q },
      }),
    select: (rows): PackingRowView[] => rows.map(toPackingRowView),
  });
}

export function useOutboundRetailersQuery(query: OutboundRetailersQuery) {
  return useSuspenseQuery({
    ...outboundRetailersQueryOptions(query),
    select: (page): { rows: RetailerRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toOutboundRetailerRow),
      meta: page.meta,
    }),
  });
}

/** 한 소매처의 봉투 목록. 머리에 걸었던 필터(`status`·`q`)를 그대로 보낸다(스펙: "그래야 outboundCount와 맞는다") */
export function useOutboundRowsQuery(query: OutboundListQuery) {
  return useSuspenseQuery({
    queryKey: shipmentKeys.outboundRows(query),
    queryFn: () =>
      apiFetchPage<OutboundSummary>(SHIPMENT_PATH.outbounds, {
        searchParams: {
          retailerId: query.retailerId,
          status: query.status,
          q: query.q,
          page: 0,
          size: OUTBOUND_PAGE_SIZE,
        },
      }),
    select: (page): { rows: OutboundRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toOutboundRowView),
      meta: page.meta,
    }),
  });
}

export function useOutboundDetailQuery(outboundId: number) {
  return useSuspenseQuery({
    queryKey: shipmentKeys.detail(outboundId),
    queryFn: () => apiFetch<OutboundDetail>(SHIPMENT_PATH.outbound(outboundId)),
    select: (detail): OutboundView => toOutboundView(detail),
  });
}

/** 장끼. 출고 확정 전엔 404(스펙) — 경계의 `notFound`가 받는다 */
export function useStatementQuery(outboundId: number) {
  return useSuspenseQuery({
    queryKey: shipmentKeys.statement(outboundId),
    queryFn: () => apiFetch<Statement>(SHIPMENT_PATH.statement(outboundId)),
    select: (statement): StatementView => toStatementView(statement),
  });
}

/** 칩 건수. 못 받은 단계는 `null` — 괄호 없이 라벨만 그린다. 0으로 지어내지 않는다 */
export type StageCounts = Record<ShipmentStage, number | null>;

/**
 * 3단 칩 건수 = 소매처 목록 세 개의 건수 합. 단계 집계 엔드포인트가 없다(04-wire §3).
 *
 * **경계(`useSuspenseQuery`)가 아니라 `useQueries`다.** 칩 줄은 서버와 무관하게 늘 눌러야 한다 —
 * 건수 하나 못 받았다고 세그먼트가 에러 블록으로 바뀌면 사장이 단계를 못 옮긴다(wire-order F4).
 * 지금 보고 있는 단계의 목록과 **같은 키**를 봐서(위 옵션 객체) 요청이 겹치지 않고, 목록 경계의
 * `다시 시도`가 성공하면 칩도 같이 채워진다. 이 feature에서 `useQuery` 계열은 여기뿐이다.
 */
export function useStageCountsQueries(q: string | undefined): {
  counts: StageCounts;
  /** 하나라도 실패했는가. 칩 옆 `건수 다시 시도` 버튼의 조건 */
  failed: boolean;
  retry: () => void;
} {
  const [ready, packed, shipped] = useQueries({
    queries: [
      {
        ...packingRetailersQueryOptions(q),
        select: (rows: PackingRetailer[]) =>
          sumCounts(rows.map(toPackingRetailerRow)),
      },
      {
        ...outboundRetailersQueryOptions({ status: STAGE_STATUS.packed, q }),
        select: (page: { items: readonly OutboundRetailer[] }) =>
          sumCounts(page.items.map(toOutboundRetailerRow)),
      },
      {
        ...outboundRetailersQueryOptions({ status: STAGE_STATUS.shipped, q }),
        select: (page: { items: readonly OutboundRetailer[] }) =>
          sumCounts(page.items.map(toOutboundRetailerRow)),
      },
    ],
  });
  const results = [ready, packed, shipped];
  return {
    counts: {
      ready: ready.data ?? null,
      packed: packed.data ?? null,
      shipped: shipped.data ?? null,
    },
    failed: results.some((r) => r.isError),
    retry: () => {
      for (const r of results) if (r.isError) void r.refetch();
    },
  };
}
