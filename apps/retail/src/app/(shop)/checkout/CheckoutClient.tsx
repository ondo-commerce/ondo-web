"use client";

import { lineQty, useCartDeselected, type CartLine } from "@/features/cart";
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
 * ① 담긴 것 중 **고른 것만** 넘긴다(RT-32 · S2-1). 선택을 푼 조합과 주문 불가
 *    행(`orderable: false`)은 주문서에 없다.
 * ② 수량 **글자**를 숫자로 읽는다 — 읽는 곳은 `lineQty`(→ `parseQty`) 하나다.
 * ③ 접수된 조합을 장바구니에서 빼는 일은 **아직 안 한다.** 주문 API가 없어서
 *    (#166) 접수 자체가 화면 안 흉내이고, 흉내 낸 접수로 진짜 장바구니 행을
 *    DELETE 하면 주문은 없는데 물건만 사라진다. #166이 주문 생성과 같이 붙인다.
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
    price: line.price ?? 0,
    qty: lineQty(line),
  };
}

/* TODO(#166): 주문 생성 API가 붙으면 접수된 행을 장바구니에서 뺀다 */
function keepCartUntilOrderApi(): void {
  /* 위 ③ — 흉내 낸 접수로 서버 장바구니를 건드리지 않는다 */
}

export function CheckoutClient({
  lines,
  scenario,
}: {
  /** `GET /cart-items`를 뷰로 바꾼 것. 장바구니 화면과 같은 응답이다 */
  lines: readonly CartLine[];
  scenario: OrderScenario;
}) {
  const deselected = useCartDeselected();

  const picked = lines
    .filter((line) => line.orderable && !deselected.has(line.lineId))
    /* 수량이 0인 줄은 주문서에 올려도 살 것이 없다. 장바구니가 이미 그런 줄로는
       `주문하기`를 막지만, 주소로 직접 들어오는 길이 열려 있어 여기서도 거른다 */
    .filter((line) => lineQty(line) > 0)
    .map(toCheckoutLine);

  return (
    <CheckoutView
      lines={picked}
      scenario={scenario}
      onAccepted={keepCartUntilOrderApi}
    />
  );
}
