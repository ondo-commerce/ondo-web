"use client";

import { OrderListView } from "@/features/order";
import { ORDERS } from "@/features/order";
import type { OrderFilterProps } from "./page";

/**
 * 주문 내역과 장바구니를 잇는 조립부. `features/order`가 `features/cart`를
 * 직접 부르지 않기 때문에 여기가 둘을 같이 아는 자리다(가정 A10).
 *
 * **다시 담기는 아직 서버로 가지 않는다.** 장바구니 담기(`POST /cart-items`)는
 * `variantId`를 받는데, 주문 내역이 아직 fixtures(`ORDERS`)라 그 값이 없다 —
 * 주문 연동(#166)이 주문 라인에 `variantId`를 싣는 순간 `useAddCartItemMutation`
 * (`features/cart`)으로 바꾼다. 장바구니가 세션 스토어이던 시절의 `addLines`는
 * 그 스토어와 함께 없어졌다.
 */

/* TODO(#166): 주문 라인에 variantId가 실리면 useAddCartItemMutation으로 담는다 */
function reorderUntilOrderApi(): void {
  /* fixtures 주문에는 variantId가 없어 보낼 요청을 만들 수 없다 */
}

export function OrdersClient({ filter, sort, open }: OrderFilterProps) {
  return (
    <OrderListView
      orders={ORDERS}
      filter={filter}
      sort={sort}
      open={open}
      onReorder={reorderUntilOrderApi}
    />
  );
}
