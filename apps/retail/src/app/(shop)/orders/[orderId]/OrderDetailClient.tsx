"use client";

import { useFavorites } from "@/features/catalog";
import { OrderDetailView, type OrderRecord } from "@/features/order";
import { useStoreName } from "@/features/account";

/**
 * 주문 상세와 다른 feature 둘(장바구니·찜)을 잇는 조립부.
 *
 * `features/order`가 둘 다 직접 부르지 않는다 — feature끼리 수평 참조하지 않는
 * 대신 여기서 조립한다(가정 A10 · 주문서·주문 내역과 같은 방식).
 *
 * 찜을 `useFavorites`로 받는 것은 표 한 줄마다 훅을 부를 수 없어서다. 집합
 * 하나를 통째로 넘기면 상품 상세·홈·찜 목록과 **같은 값**을 본다 — 같은 상품을
 * 두고 두 화면이 반대되는 하트를 보이지 않는다.
 *
 * **다시 담기는 아직 서버로 가지 않는다.** `POST /cart-items`는 `variantId`를
 * 받는데 주문 상세가 아직 fixtures라 그 값이 없다 — 주문 연동(#166)이 라인에
 * `variantId`를 실으면 `useAddCartItemMutation`(`features/cart`)으로 바꾼다.
 */

/* TODO(#166): 주문 라인에 variantId가 실리면 useAddCartItemMutation으로 담는다 */
function reorderUntilOrderApi(): void {
  /* fixtures 주문에는 variantId가 없어 보낼 요청을 만들 수 없다 */
}

export function OrderDetailClient({ order }: { order: OrderRecord }) {
  const { favorites, toggleFavorite } = useFavorites();
  const storeName = useStoreName();

  return (
    <OrderDetailView
      order={order}
      receiverStore={storeName}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onReorder={reorderUntilOrderApi}
    />
  );
}
