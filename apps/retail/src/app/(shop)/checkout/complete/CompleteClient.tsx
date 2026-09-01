"use client";

import { removeLines } from "@/features/cart";
import { OrderCompleteView } from "@/features/order";

/**
 * 완료 화면과 장바구니를 잇는 조립부. `features/order`가 `features/cart`를
 * 직접 부르지 않기 때문에 여기가 둘을 같이 아는 자리다(가정 A10 · 주문서와 같은 방식).
 *
 * `안 된 건만 다시 시도`로 다시 보낸 조합은 장바구니에서 빠진다 — 접수됐을
 * 때와 같은 이유다. 다시 보낸 물건이 장바구니에도 남아 있으면 완료 화면의
 * 합계와 헤더 뱃지가 같은 조합을 두 번 센다.
 */
export function CompleteClient() {
  return <OrderCompleteView onRetried={removeLines} />;
}
