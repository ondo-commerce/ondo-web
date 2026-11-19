"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { guardSession } from "./session";
import type { AddToCart } from "../types";

/**
 * 재고 카드의 `장바구니에 담기`(loop-05b S8-5). 담는 함수는 조립부가 준다 — 이 feature는 `features/cart`를
 * 모른다(§4-1 9, `ProductDetailClient.tsx`와 같은 방식).
 *
 * `guardSession`으로 감싸는 이유(S8-8): 담기 401에 공용 처리가 `/login`으로 전체 이동하면 입력창의 쓰던 글과
 * 카드 수량이 사라진다(D28). 끊김 오류로 바꾸면 방이 보내기와 담기를 같이 잠근다. 받는 함수가 뮤테이션이
 * 아니라 맨 함수여야 하는 이유도 같다 — cart의 뮤테이션이면 MutationCache가 원래 401을 먼저 본다.
 *
 * 성공하면 `router.refresh()` 1회 — 헤더 장바구니 숫자는 `(shop)/layout.tsx`가 서버에서 다시 센다.
 * `networkMode: "always"`: 오프라인이면 멈춰 있다가 저절로 나가지 않고 바로 실패한다(보내기와 같다).
 * 카드마다 이 훅이 하나라 `isPending`이 카드마다 따로다.
 */
export function useStockCartMutation(addToCart: AddToCart) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { variantId: number; qty: number }) =>
      guardSession(queryClient, () => addToCart(input)),
    networkMode: "always",
    onSuccess: () => router.refresh(),
  });
}
