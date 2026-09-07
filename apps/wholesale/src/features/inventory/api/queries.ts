"use client";

import { useQueries, useSuspenseQuery } from "@tanstack/react-query";
import { apiFetchPage, type PageMeta } from "@ondo/api";
import { inventoryKeys } from "./keys";
import {
  toInventoryRow,
  toMovementQuery,
  toMovementView,
  toProductView,
} from "../derive";
import type {
  InventoryRowView,
  StockMovement,
  StockMovementView,
} from "../types";
import {
  productDetailQueryOptions,
  productListQueryOptions,
  type ProductListQuery,
} from "@/shared/api/product";

/**
 * 재고 전용 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다 —
 * 상품 목록·상세는 `shared/api/product`가 든다.
 */
export const INVENTORY_PATH = {
  inbounds: "/api/wholesale/inbounds",
  stockAdjustments: (variantId: number) =>
    `/api/wholesale/variants/${variantId}/stock-adjustments`,
  stockMovements: (variantId: number) =>
    `/api/wholesale/variants/${variantId}/stock-movements`,
} as const;

/**
 * 안에서 `useSuspenseQuery`를 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * 예외는 목록의 행별 상세 하나(`useQueries`, 아래 설명). `select`로 wire를 뷰로 바꿔서 화면은
 * wire 모양을 모른다.
 */

/**
 * 재고 목록 한 페이지 = 상품 목록 + **행마다 상세 하나씩**.
 *
 * 목록 응답(`ProductSummaryResponse`)에는 재고 합계가 없다(04-wire §3-1). 상품 행의
 * `현재고`·`판매가능`은 SKU 합계라 상세가 있어야 나온다. 그래서 페이지의 상품 수만큼 상세를 같이
 * 부른다 — N+1이지만 페이지가 20이고, 펼친 행·우측 카드가 같은 키(`productKeys.detail`)를 봐서
 * 펼칠 때는 요청이 더 안 나간다. 서버가 목록에 합계를 실어 주면 이 함수는 목록 하나로 줄어든다.
 *
 * **목록은 경계(`useSuspenseQuery`)가, 상세 N개는 행이 실패를 받는다(`useQueries`).**
 * 상세까지 `useSuspenseQueries`로 묶으면 스무 개 중 하나가 실패할 때 표 전체가 경계로 떨어져
 * 사장이 재고 탭을 못 쓴다(wire-inventory F1). 상세의 `data`·`error`는 화면이 직접 가르지
 * 않고 `derive.toInventoryRow`가 행 상태로 바꾼다 — 이 feature에서 `useQuery` 계열은 여기뿐이다.
 */
export function useInventoryListQuery(query: ProductListQuery): {
  rows: InventoryRowView[];
  meta: PageMeta;
  /** 실패한 행의 상세만 다시 부른다. 표는 그대로다 */
  retryDetail: (productId: number) => void;
} {
  const { data: page } = useSuspenseQuery(productListQueryOptions(query));
  const details = useQueries({
    queries: page.items.map((summary) => ({
      ...productDetailQueryOptions(summary.id),
      select: toProductView,
    })),
  });
  const rows = page.items.map((summary, i) =>
    toInventoryRow(summary, {
      data: details[i]?.data,
      error: details[i]?.error,
    }),
  );
  const retryDetail = (productId: number) => {
    const i = page.items.findIndex((summary) => summary.id === productId);
    void details[i]?.refetch();
  };
  return { rows, meta: page.meta, retryDetail };
}

/** 상품 하나의 SKU 재고. 우측 카드가 쓴다 — 목록이 이미 받은 캐시를 같이 본다 */
export function useInventoryProductQuery(productId: number) {
  return useSuspenseQuery({
    ...productDetailQueryOptions(productId),
    select: toProductView,
  });
}

/** SKU 변동 이력. 서버가 시간 역순으로 준다 — 화면은 그 순서를 그대로 그린다 */
export function useStockMovementsQuery(variantId: number) {
  return useSuspenseQuery({
    queryKey: inventoryKeys.movementsOf(variantId),
    queryFn: () =>
      apiFetchPage<StockMovement>(INVENTORY_PATH.stockMovements(variantId), {
        searchParams: toMovementQuery(),
      }),
    select: (page): { rows: StockMovementView[]; meta: PageMeta } => ({
      rows: page.items.map(toMovementView),
      meta: page.meta,
    }),
  });
}
