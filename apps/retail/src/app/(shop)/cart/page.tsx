import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CART_PATH,
  CartView,
  toCartLines,
  type CartWire,
} from "@/features/cart";
import { APPROVAL_PATH, isNotApproved, serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "장바구니" };

/**
 * 담긴 목록을 **서버에서** 받아 첫 HTML에 싣는다(ADR-0003). 수량·빼기·되돌리기는
 * `CartView` 안의 뮤테이션이 보내고, 성공하면 `router.refresh()`가 이 페이지를
 * 다시 실행한다 — 그래서 여기가 곧 "다시 그리는 길"이다.
 *
 * 403(`ACCOUNT_NOT_APPROVED`)만 승인 대기 화면으로 보낸다. 나머지(5xx·연결 실패)는
 * 그대로 던져 `error.tsx`가 받는다.
 */
export default async function Page() {
  const api = await serverApi();
  let cart: CartWire;
  try {
    cart = await api.fetch<CartWire>(CART_PATH.items);
  } catch (error) {
    if (isNotApproved(error)) redirect(APPROVAL_PATH);
    throw error;
  }

  return <CartView lines={toCartLines(cart)} />;
}
