"use client";

import { addLines, type CartLine } from "@/features/cart";
import { OrderListView, reorderPrice, type OrderLine } from "@/features/order";
import { ORDERS } from "@/features/order";
import type { OrderFilterProps } from "./page";

/**
 * 주문 내역과 장바구니를 잇는 조립부. `features/order`가 `features/cart`를
 * 직접 부르지 않기 때문에 여기가 둘을 같이 아는 자리다(가정 A10).
 *
 * 여기서 하는 일은 **주문 라인을 장바구니 줄 모양으로 바꾸는 것 하나**다.
 * `lineId` 규칙(`${도매처id}:${상품id}-${색}-${사이즈}`)은 장바구니·상품
 * 상세와 같다 — 그래야 이미 담긴 조합에 수량이 더해지고, 같은 SKU가 두 줄로
 * 서지 않는다.
 *
 * 단가가 오른 줄은 **지금 가격**으로 담긴다(`reorderPrice`). 주문 시점 가격으로
 * 담으면 주문서에서 다른 금액이 나온다.
 */
function toCartLine(
  line: OrderLine,
  wholesaler: { name: string; location: string },
): CartLine {
  return {
    lineId: `${line.wholesalerId}:${line.productId}-${line.colorLabel}-${line.size}`,
    wholesalerId: line.wholesalerId,
    wholesalerName: wholesaler.name,
    wholesalerLocation: wholesaler.location,
    productId: line.productId,
    productName: line.productName,
    productCode: line.productCode,
    colorLabel: line.colorLabel,
    size: line.size,
    price: reorderPrice(line),
    soldOut: line.soldOut ?? false,
    qtyText: String(line.qty),
  };
}

export function OrdersClient({ filter, sort, open }: OrderFilterProps) {
  return (
    <OrderListView
      orders={ORDERS}
      filter={filter}
      sort={sort}
      open={open}
      onReorder={(lines) =>
        addLines(
          lines.map((line) => {
            /* 도매처 이름·주소는 주문의 도매처 건에서 온다 — 라인에 다시 적어
               두면 같은 도매처 주소가 화면마다 갈린다(가정 A5-e) */
            const leg = ORDERS.flatMap((order) => order.legs).find(
              (it) => it.wholesalerId === line.wholesalerId,
            );

            return toCartLine(line, {
              name: leg?.wholesalerName ?? "",
              location: leg?.wholesalerLocation ?? "",
            });
          }),
        )
      }
    />
  );
}
