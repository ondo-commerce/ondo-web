"use client";

import { OrderCompleteView } from "@/features/order";

/**
 * 완료 화면과 장바구니를 잇는 조립부. `features/order`가 `features/cart`를
 * 직접 부르지 않기 때문에 여기가 둘을 같이 아는 자리다(가정 A10 · 주문서와 같은 방식).
 *
 * `안 된 건만 다시 시도`로 다시 보낸 조합을 장바구니에서 빼는 일은 **아직 안 한다.**
 * 주문 API가 없어서(#166) 다시 보내기 자체가 화면 안 흉내이고, 흉내로 서버
 * 장바구니 행을 DELETE 하면 주문은 없는데 물건만 사라진다. 장바구니가 세션
 * 스토어이던 시절의 `removeLines`는 그 스토어와 함께 없어졌다.
 */

/* TODO(#166): 주문 생성 API가 붙으면 다시 보낸 행을 장바구니에서 뺀다 */
function keepCartUntilOrderApi(): void {
  /* 흉내 낸 재시도로 서버 장바구니를 건드리지 않는다 */
}

export function CompleteClient() {
  return <OrderCompleteView onRetried={keepCartUntilOrderApi} />;
}
