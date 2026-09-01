"use client";

import {
  lineQty,
  removeLines,
  useCartLines,
  useCartSelected,
  type CartLine,
} from "@/features/cart";
import {
  CheckoutView,
  type CheckoutLine,
  type OrderScenario,
} from "@/features/order";

/**
 * 장바구니와 주문서를 잇는 조립부.
 *
 * **여기가 두 feature를 같이 아는 유일한 자리다.** `features/order`가
 * `features/cart`를 직접 부르면 feature끼리 수평 참조가 생기고, 장바구니를
 * 지울 때 주문 화면이 같이 깨진다. `app/(shop)/layout.tsx`가 헤더에
 * `CartButton`을 끼워 넣는 것과 같은 방식이다(`docs/02-folder-structure.md` 원칙 3).
 *
 * 여기서 하는 일은 셋뿐이다.
 * ① 담긴 것 중 **고른 것만** 넘긴다(RT-32 · S2-1). 선택을 푼 조합은 주문서에 없다.
 * ② 수량 **글자**를 숫자로 읽는다 — 읽는 곳은 `lineQty`(→ `parseQty`) 하나다.
 * ③ 접수된 조합을 장바구니에서 뺀다.
 */
function toCheckoutLine(line: CartLine): CheckoutLine {
  return {
    lineId: line.lineId,
    wholesalerId: line.wholesalerId,
    wholesalerName: line.wholesalerName,
    wholesalerLocation: line.wholesalerLocation,
    productId: line.productId,
    productName: line.productName,
    colorLabel: line.colorLabel,
    size: line.size,
    price: line.price,
    qty: lineQty(line),
  };
}

export function CheckoutClient({ scenario }: { scenario: OrderScenario }) {
  const lines = useCartLines();
  const selected = useCartSelected();

  const picked = lines
    .filter((line) => selected.has(line.lineId))
    /* 수량을 못 읽은 줄(`45.5`)은 0장이라 주문서에 올려도 살 것이 없다.
       장바구니가 이미 그런 줄로는 `주문하기`를 막지만, 주소로 직접 들어오는
       길이 열려 있어 여기서도 한 번 더 거른다 */
    .filter((line) => lineQty(line) > 0)
    .map(toCheckoutLine);

  return (
    <CheckoutView lines={picked} scenario={scenario} onAccepted={removeLines} />
  );
}
