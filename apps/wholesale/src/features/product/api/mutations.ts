"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { PRODUCT_PATH } from "./queries";
import { withListing } from "../derive";
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
 *
 * 저장 셋(등록, 수정, 상태 변경)은 응답으로 캐시를 고치고 무효화는 `refetchType: "none"`(#404).
 * 저장 도중 상세를 다시 받으면 그 GET이 401일 때 QueryCache 전역 이동이 폼을 날린다 — 수정은
 * PATCH 뒤 상태 변경까지 이어지는 한 번의 저장이라 그 사이에 GET이 끼면 안 된다. 다시 받기는
 * 저장이 끝나 화면을 옮긴 뒤 새로 마운트되는 목록, 상세 패널이 stale을 보고 한 번 한다.
 */
const SAVE_INVALIDATE = { refetchType: "none" } as const;

/**
 * 저장 401을 화면이 받는다(#404). 전역 `MutationCache.onError`가 `/login`으로 보내면 쓰던 폼이
 * 날아간다 — 업로드처럼 화면이 잠그고 다른 탭 재로그인으로 이어서 저장한다. 문자열은
 * `app/sessionLoss.ts`의 `SESSION_LOSS_INLINE`과 같아야 한다(feature는 app을 import 못 한다).
 * 401만 이 표시를 본다 — 403, 500, 네트워크 오류는 원래도 전역 이동이 없다. 삭제는 그대로 이동한다.
 */
const INLINE_SESSION_LOSS = { sessionLoss: "inline" } as const;

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
    meta: INLINE_SESSION_LOSS,
    mutationFn: createProduct,
    onSuccess: (created) => {
      // 응답이 곧 상세다 — 등록 직후 우측 패널이 한 번 더 부르지 않게 미리 넣는다
      queryClient.setQueryData(productKeys.detail(created.id), created);
      return queryClient.invalidateQueries({
        queryKey: productKeys.lists(),
        ...SAVE_INVALIDATE,
      });
    },
  });
}

export function useUpdateProductMutation(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE_SESSION_LOSS,
    mutationFn: (body: ProductUpdateRequest) =>
      apiFetch<ProductDetail>(PRODUCT_READ_PATH.product(productId), {
        method: "PATCH",
        body,
      }),
    onSuccess: (updated) => {
      // 응답이 곧 상세다(목에서 같은 `productDetail`). 실서버가 다르면 다음 화면의 GET이 고친다
      queryClient.setQueryData(productKeys.detail(productId), updated);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: productKeys.lists(),
          ...SAVE_INVALIDATE,
        }),
        queryClient.invalidateQueries({
          queryKey: productKeys.detail(productId),
          ...SAVE_INVALIDATE,
        }),
      ]);
    },
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
 *
 * `meta.sessionLoss: "inline"` — 401이어도 전역 핸들러가 `/login`으로 보내지 않는다
 * (`app/sessionLoss.ts`). 격자가 받아 큐를 멈추고 화면이 저장을 잠근다. 전체 이동이 먼저
 * 터지면 이미 올라간 사진과 입력이 같이 사라진다(#252 S4-3).
 */
export function useUploadListingImageMutation() {
  return useMutation({
    meta: { sessionLoss: "inline" },
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
    meta: INLINE_SESSION_LOSS,
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
    onSuccess: (listing, input) => {
      /*
       * 응답은 게시글 하나라 상세의 `listing` 칸만 바꾼다. 이걸 빼면 저장 직후 다시 연 수정 화면이
       * 옛 캐시(판매 중)로 폼을 연다 — 폼 초기값은 첫 렌더의 상세다(loop-01 시즌 종료 시험)
       */
      queryClient.setQueryData<ProductDetail>(
        productKeys.detail(input.productId),
        (detail) => withListing(detail, listing),
      );
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: productKeys.lists(),
          ...SAVE_INVALIDATE,
        }),
        queryClient.invalidateQueries({
          queryKey: productKeys.detail(input.productId),
          ...SAVE_INVALIDATE,
        }),
      ]);
    },
  });
}
