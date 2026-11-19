"use client";

import { useRouter } from "next/navigation";
import { useAddCartItemMutation, useChangeQtyMutation } from "@/features/cart";
import { InquiryButton, InquiryEntry, InquiryError } from "@/features/chat";
import { ORDER_PATH } from "@/features/order";
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
  send: (item: CartItemDraft) => Promise<{ cartItemId: number }>,
): Promise<AddToCartResult> {
  const settled = await Promise.allSettled(items.map((item) => send(item)));
  const done: CartItemDraft[] = [];
  const cartItemIds: number[] = [];
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
    cartItemIds.push(result.value.cartItemId);
  });
  return { done, cartItemIds, failed };
}

export function ProductDetailClient({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const { mutateAsync } = useAddCartItemMutation({ refresh: false });
  const { mutateAsync: setQty } = useChangeQtyMutation({ refresh: false });

  /* 판매처 칸의 `문의하기`(loop-05a)도 같은 이유로 여기서 끼운다 — 상세는 `features/chat`을 모른다 */
  return (
    <InquiryEntry
      wholesalerId={Number(product.wholesaler.id)}
      listingId={Number(product.id)}
    >
      <ProductDetailView
        product={product}
        sellerAction={<InquiryButton ac="S5-1 S5-4 S5-11 S5-12" />}
        sellerNotice={<InquiryError />}
        onAddToCart={async (items, mode) => {
          const result = await settleEach(items, async (item) => {
            const added = await mutateAsync(item);
            /* 바로 주문하기: 같은 옵션이 이미 있었으면 서버가 더한 수량을 고른 수량으로
               되돌린다. 여기서 실패하면 그 옵션은 못 담은 것으로 친다 — 다시 누르면
               담기와 맞추기를 한 번 더 해서 결국 고른 수량이 된다 */
            if (mode === "set" && added.qty !== item.qty) {
              await setQty({ cartItemId: added.cartItemId, qty: item.qty });
            }
            return added;
          });
          if (result.done.length > 0) router.refresh();
          return result;
        }}
        /* 주문서 주소는 `features/order`가 안다. 상세는 담긴 줄의 id만 넘긴다.
           여기서 `router.refresh()`를 같이 부르지 않는다 — push 바로 뒤에 부르면 새 기록이
           덮어쓰기로 바뀌어, 주문서에서 뒤로 가기가 상품 상세를 건너뛰었다. 헤더 뱃지는
           담기가 끝난 직후(`onAddToCart`) 이미 refresh 했다 */
        onOrderNow={(cartItemIds) => {
          router.push(ORDER_PATH.checkout(cartItemIds));
        }}
      />
    </InquiryEntry>
  );
}
