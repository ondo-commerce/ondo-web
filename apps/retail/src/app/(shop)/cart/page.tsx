import type { Metadata } from "next";
import { CartView } from "@/features/cart";

export const metadata: Metadata = { title: "장바구니" };

/* 담긴 목록은 서버가 모른다 — 세션 스토어(`shared/cart-store`)가 들고 있어서
   화면이 통째로 클라이언트 컴포넌트다. 첫 HTML은 여전히 서버에서 완성된다 */
export default function Page() {
  return <CartView />;
}
