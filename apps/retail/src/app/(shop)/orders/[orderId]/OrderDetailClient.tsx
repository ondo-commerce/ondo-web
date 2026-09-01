"use client";

import { addLines, type CartLine } from "@/features/cart";
import { useFavorites } from "@/features/catalog";
import {
  OrderDetailView,
  reorderPrice,
  type OrderLine,
  type OrderRecord,
} from "@/features/order";
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
 */
function toCartLine(line: OrderLine, order: OrderRecord): CartLine {
  const leg = order.legs.find((it) => it.wholesalerId === line.wholesalerId);

  return {
    /* 장바구니·상품 상세와 같은 규칙이라 이미 담긴 조합에 수량이 더해진다 */
    lineId: `${line.wholesalerId}:${line.productId}-${line.colorLabel}-${line.size}`,
    wholesalerId: line.wholesalerId,
    wholesalerName: leg?.wholesalerName ?? "",
    wholesalerLocation: leg?.wholesalerLocation ?? "",
    productId: line.productId,
    productName: line.productName,
    productCode: line.productCode,
    colorLabel: line.colorLabel,
    size: line.size,
    /* 단가가 오른 줄은 **지금 가격**으로 담긴다 — 주문 시점 가격으로 담으면
       주문서에서 다른 금액이 나온다 */
    price: reorderPrice(line),
    soldOut: line.soldOut ?? false,
    qtyText: String(line.qty),
  };
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
      onReorder={(lines) =>
        addLines(lines.map((line) => toCartLine(line, order)))
      }
    />
  );
}
