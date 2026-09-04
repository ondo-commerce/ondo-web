"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { apiFetch, apiFetchPage, type PageMeta } from "@ondo/api";
import { productKeys } from "./keys";
import {
  toProductRowView,
  toProductView,
  type ProductListQuery,
} from "../derive";
import type {
  CategoryNode,
  ColorGroup,
  ProductDetail,
  ProductRowView,
  ProductSummary,
  ProductView,
} from "../types";

/**
 * 상품·게시 경로. 훅 1개 = 엔드포인트 1개(docs/05). 여기 없는 경로는 이 feature가
 * 부르지 않는다.
 */
export const PRODUCT_PATH = {
  products: "/api/wholesale/products",
  product: (productId: number) => `/api/wholesale/products/${productId}`,
  seasonEnd: (listingId: number) =>
    `/api/wholesale/listings/${listingId}/season-end`,
  reopen: (listingId: number) => `/api/wholesale/listings/${listingId}/reopen`,
  categories: "/api/wholesale/categories",
  colors: "/api/wholesale/colors",
} as const;

/**
 * 안에서 `useSuspenseQuery`만 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 */

export function useProductListQuery(query: ProductListQuery) {
  return useSuspenseQuery({
    queryKey: productKeys.list(query),
    queryFn: () =>
      apiFetchPage<ProductSummary>(PRODUCT_PATH.products, {
        searchParams: { q: query.q, page: query.page, size: query.size },
      }),
    select: (page): { rows: ProductRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toProductRowView),
      meta: page.meta,
    }),
  });
}

export function useProductDetailQuery(productId: number) {
  return useSuspenseQuery({
    queryKey: productKeys.detail(productId),
    queryFn: () => apiFetch<ProductDetail>(PRODUCT_PATH.product(productId)),
    select: (detail): ProductView => toProductView(detail),
  });
}

/**
 * 카테고리·색상은 고정 마스터다(스펙: "프론트 캐시 가능"). 탭을 열어 두는 동안
 * 다시 부를 이유가 없어 무기한으로 둔다 — 값이 바뀌는 건 배포 단위다.
 */
const MASTER_STALE_TIME = Infinity;

export function useCategoriesQuery() {
  return useSuspenseQuery({
    queryKey: productKeys.categories(),
    queryFn: () => apiFetch<CategoryNode[]>(PRODUCT_PATH.categories),
    staleTime: MASTER_STALE_TIME,
  });
}

export function useColorsQuery() {
  return useSuspenseQuery({
    queryKey: productKeys.colors(),
    queryFn: () => apiFetch<ColorGroup[]>(PRODUCT_PATH.colors),
    staleTime: MASTER_STALE_TIME,
  });
}
