"use client";

import { useRouter } from "next/navigation";
import { useAddCartItemMutation } from "@/features/cart";
import {
  ProductDetailView,
  type AddToCartResult,
  type CartItemDraft,
  type ProductDetail,
} from "@/features/product";

/**
 * 상세 화면과 장바구니 뮤테이션을 붙이는 자리.
 *
 * `features/product`가 `features/cart`를 직접 import 하지 않는다 — feature끼리
 * 참조하지 않고 **부모인 `app/`이 끼워 넣는다**(`docs/02-folder-structure.md`
 * 원칙 3). 스펙이 한 요청에 조합 하나라(`AddCartItemRequest`) 조합 수만큼
 * `POST /cart-items`를 보낸다.
 *
 * **전부 끝까지 기다리고, reject하지 않는다.** `Promise.all`은 하나가 죽으면
 * 통째로 reject라 이미 들어간 조합을 화면이 모르고, 다시 누르면 같은 SKU가
 * 또 POST 된다(서버는 합산 — F2). 그래서 `allSettled`로 갈라 결과를 넘기고,
 * 헤더 뱃지 갱신(`router.refresh()`)은 **하나라도 담겼을 때 한 번만** —
 * 뮤테이션마다 refresh 하면 상세 전체가 N번 다시 그려진다(F3).
 *
 * 장바구니 회차(`feat-162`)의 `sendEach`와 같은 계약이다 — 두 브랜치가 합쳐지면
 * 한 곳으로 모을 것(`04-wire.md` §5).
 */
async function settleEach(
  items: readonly CartItemDraft[],
  send: (item: CartItemDraft) => Promise<unknown>,
): Promise<AddToCartResult> {
  const settled = await Promise.allSettled(items.map((item) => send(item)));
  const done: CartItemDraft[] = [];
  const failed: { input: CartItemDraft; error: unknown }[] = [];
  items.forEach((input, index) => {
    const result = settled[index];
    /* noUncheckedIndexedAccess: 같은 길이라 늘 있지만 타입은 undefined다. 없으면
       못 보낸 것으로 친다 — 성공으로 세는 것보다 안전하다 */
    if (result === undefined || result.status === "rejected") {
      failed.push({ input, error: result?.reason });
      return;
    }
    done.push(input);
  });
  return { done, failed };
}

export function ProductDetailClient({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const { mutateAsync } = useAddCartItemMutation({ refresh: false });

  return (
    <ProductDetailView
      product={product}
      onAddToCart={async (items) => {
        const result = await settleEach(items, (item) => mutateAsync(item));
        if (result.done.length > 0) router.refresh();
        return result;
      }}
    />
  );
}
