"use client";

import { useFavorites } from "@/features/catalog";
import { OrderDetailView, type OrderRecord } from "@/features/order";

/**
 * 주문 상세와 찜 feature를 잇는 조립부. 수령 상호는 서버 page가 `/me`에서
 * 읽어 넘긴다(`receiverStore`).
 *
 * `features/order`가 찜·계정을 직접 부르지 않는다 — feature끼리 수평 참조하지 않는
 * 대신 여기서 조립한다(가정 A10 · `app/(shop)/layout.tsx`가 헤더에 뱃지를 끼워
 * 넣는 것과 같은 방식).
 *
 * 찜을 `useFavorites`로 받는 것은 표 한 줄마다 훅을 부를 수 없어서다. 집합
 * 하나를 통째로 넘기면 상품 상세·홈·찜 목록과 **같은 값**을 본다.
 *
 * 다시 담기(`useAddCartItemMutation`)는 여기 없다 — `POST /cart-items`가 받는
 * `variantId`가 주문 상세 응답(`OrderItem`)에 없어 보낼 요청을 만들 수 없다
 * (`04-wire.md` §3). 스펙에 실리면 이 자리에서 잇는다.
 */
export function OrderDetailClient({
  order,
  receiverStore,
}: {
  order: OrderRecord;
  /** 로그인한 소매처 상호(`/me.shopName` → `storeNameLabel`) */
  receiverStore: string;
}) {
  const { favorites, toggleFavorite } = useFavorites();

  return (
    <OrderDetailView
      order={order}
      receiverStore={receiverStore}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
    />
  );
}
