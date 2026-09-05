"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { productKeys } from "./keys";
import { PRODUCT_PATH } from "./queries";
import type {
  Listing,
  PostStatus,
  ProductCreateRequest,
  ProductDetail,
  ProductUpdateRequest,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`의 팩토리로 무효화한다 — 목록과 상세가 같은
 * 리소스를 보고 있어서, 한쪽만 갱신하면 배지는 판매중인데 상세는 시즌종료가 된다.
 */

/**
 * 응답을 wire 그대로 돌려준다. 상세 쿼리의 캐시에 **wire를** 넣어야 해서다 —
 * `useProductDetailQuery`의 `select`가 읽을 때 뷰로 바꾼다. 여기서 먼저 뷰로 바꿔 넣으면
 * `select`가 뷰를 한 번 더 변환해 값이 깨진다.
 */
function createProduct(body: ProductCreateRequest): Promise<ProductDetail> {
  return apiFetch<ProductDetail>(PRODUCT_PATH.products, {
    method: "POST",
    body,
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: (created) => {
      // 응답이 곧 상세다 — 등록 직후 우측 패널이 한 번 더 부르지 않게 미리 넣는다
      queryClient.setQueryData(productKeys.detail(created.id), created);
      return queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useUpdateProductMutation(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductUpdateRequest) =>
      apiFetch<ProductDetail>(PRODUCT_PATH.product(productId), {
        method: "PATCH",
        body,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: productKeys.detail(productId),
        }),
      ]),
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: number) =>
      apiFetch<void>(PRODUCT_PATH.product(productId), { method: "DELETE" }),
    onSuccess: (_, productId) => {
      // 지운 상품의 상세는 다시 부르면 404다. 무효화가 아니라 제거
      queryClient.removeQueries({ queryKey: productKeys.detail(productId) });
      return queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/**
 * 시즌 종료 ↔ 재개. PATCH는 `listing.status`를 받지 않아서(스펙) 상태만 따로 간다.
 * `productId`는 요청에 안 실리지만 무효화할 상세를 가리키려고 받는다.
 */
export function useListingStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      listingId: number;
      productId: number;
      next: PostStatus;
    }) =>
      apiFetch<Listing>(
        input.next === "SEASON_ENDED"
          ? PRODUCT_PATH.seasonEnd(input.listingId)
          : PRODUCT_PATH.reopen(input.listingId),
        { method: "POST" },
      ),
    onSuccess: (_, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: productKeys.detail(input.productId),
        }),
      ]),
  });
}
