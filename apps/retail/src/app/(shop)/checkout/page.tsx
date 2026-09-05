import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutClient } from "./CheckoutClient";
import { CART_PATH, toCartLines, type CartWire } from "@/features/cart";
import { resolveScenario } from "@/features/order";
import { APPROVAL_PATH, isNotApproved, serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "주문서 작성" };

/**
 * 주문서. 담긴 목록은 장바구니 화면과 **같은 서버 응답**(`GET /cart-items`)에서
 * 온다 — 세션 스토어가 목록을 들고 있던 시절에는 장바구니를 안 거치고 주소로
 * 들어오면 빈 주문서였다. 무엇을 골랐는지만 스토어(UI 상태)에서 읽는다.
 *
 * `?scenario=`는 **접수 결과를 무엇으로 그릴지**만 정한다(가정 A3). 주문 API는
 * 아직 안 붙어서(#166) 접수는 여전히 화면 안에서 흉내 낸다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const api = await serverApi();
  let cart: CartWire;
  try {
    cart = await api.fetch<CartWire>(CART_PATH.items);
  } catch (error) {
    if (isNotApproved(error)) redirect(APPROVAL_PATH);
    throw error;
  }

  return (
    <CheckoutClient
      lines={toCartLines(cart)}
      scenario={resolveScenario(query.scenario)}
    />
  );
}
