"use client";

import {
  useQueries,
  useQueryClient,
  useSuspenseQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetchPage, type PageMeta } from "@ondo/api";
import { useMemo } from "react";
import { inventoryKeys } from "./keys";
import {
  toInventoryRow,
  toMovementQuery,
  toMovementView,
  toProductView,
  type DetailQueryState,
} from "../derive";
import type {
  InventoryProductView,
  InventoryRowView,
  StockMovement,
  StockMovementView,
} from "../types";
import {
  productDetailQueryOptions,
  productKeys,
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
 * 상세 N개에서 행이 읽는 것(`data`·`error`)만 남긴다.
 *
 * **모듈 스코프여야 한다.** TanStack은 `combine`의 참조가 같을 때만 결과를 구조 공유해서,
 * 데이터가 안 바뀌면 같은 배열을 돌려준다. 인라인 함수면 렌더마다 새 배열이다.
 * `refetch` 같은 함수를 같이 담지 않는 것도 같은 이유 — 함수는 매번 다른 값이라 공유가 깨진다.
 */
function pickDetailStates(
  results: UseQueryResult<InventoryProductView>[],
): DetailQueryState[] {
  return results.map((result) => ({
    data: result.data,
    error: result.error,
  }));
}

/** 아직 상세 결과가 없는 행. 오는 중이라는 뜻이다 */
const DETAIL_PENDING: DetailQueryState = { data: undefined, error: null };

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
  const queryClient = useQueryClient();
  const { data: page } = useSuspenseQuery(productListQueryOptions(query));
  const details = useQueries({
    queries: page.items.map((summary) => ({
      ...productDetailQueryOptions(summary.id),
      select: toProductView,
    })),
    combine: pickDetailStates,
  });
  /*
   * **`rows`의 참조가 데이터가 같으면 유지돼야 한다.** 표가 이 배열을 effect 의존성으로 보고
   * 부모에게 "지금 표에 있는 상품 id"를 알리는데(#198 목록 밖 카드), 렌더마다 새 배열이면
   * effect → 부모 상태 → 재렌더 → 새 배열이 꼬리를 물어 무한 루프가 된다(#216).
   * `page`는 useSuspenseQuery가, `details`는 위 combine이 구조 공유하므로 둘이 같으면 같은 행이다.
   */
  const rows = useMemo(
    () =>
      page.items.map((summary, i) =>
        toInventoryRow(summary, details[i] ?? DETAIL_PENDING),
      ),
    [page.items, details],
  );
  /* 키로 다시 부른다 — useQueries 결과에서 refetch를 꺼내 들고 있으면 위 구조 공유가 깨진다 */
  const retryDetail = (productId: number) => {
    void queryClient.refetchQueries({
      queryKey: productKeys.detail(productId),
    });
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
