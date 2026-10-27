"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { PRODUCT_PATH } from "./queries";
import type {
  Listing,
  ListingImageUpload,
  PostStatus,
  ProductCreateRequest,
  ProductDetail,
  ProductUpdateRequest,
} from "../types";
import {
  PRODUCT_PATH as PRODUCT_READ_PATH,
  productKeys,
} from "@/shared/api/product";

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
  return apiFetch<ProductDetail>(PRODUCT_READ_PATH.products, {
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
      apiFetch<ProductDetail>(PRODUCT_READ_PATH.product(productId), {
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
      apiFetch<void>(PRODUCT_READ_PATH.product(productId), {
        method: "DELETE",
      }),
    onSuccess: (_, productId) => {
      // 지운 상품의 상세는 다시 부르면 404다. 무효화가 아니라 제거
      queryClient.removeQueries({ queryKey: productKeys.detail(productId) });
      return queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/**
 * 게시글 이미지 1장 업로드(#250). 응답 `url`을 `listing.images[]`에 그대로 싣는다 —
 * 무효화할 쿼리가 없다. 게시글에 붙기 전까지 서버 상태가 바뀌지 않기 때문이다.
 *
 * multipart 파트명은 `file` 하나(계약 §5-2). `Content-Type`은 안 정한다 — boundary를
 * 브라우저가 붙여야 해서 `apiFetch`가 `FormData`를 그대로 넘긴다.
 * `idempotencyKey`는 슬롯당 하나로 재시도에도 같은 값(D23). 동시에 여러 번 불러도 된다 —
 * `mutateAsync`마다 요청이 따로 나가고, 동시 수는 격자의 큐가 정한다.
 */
export function useUploadListingImageMutation() {
  return useMutation({
    mutationFn: (input: {
      file: File;
      idempotencyKey: string;
      signal?: AbortSignal;
    }) => {
      const body = new FormData();
      body.append("file", input.file);
      return apiFetch<ListingImageUpload>(PRODUCT_PATH.listingImages, {
        method: "POST",
        body,
        idempotencyKey: input.idempotencyKey,
        signal: input.signal,
      });
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
