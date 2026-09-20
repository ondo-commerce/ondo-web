/**
 * 장바구니 경로. 여기 없는 경로는 이 feature가 부르지 않는다.
 *
 * `queries.ts`가 없는 이유: 소매는 목록을 Server Component가 `serverApi()`로 받는다
 * (ADR-0003). 그래서 경로가 서버(`app/(shop)/cart/page.tsx` · `layout.tsx`)와
 * 브라우저(`mutations.ts`) 양쪽에서 쓰이고, 어느 쪽 지시어도 없는 이 파일에 둔다.
 */
export const CART_PATH = {
  items: "/api/retail/cart-items",
  count: "/api/retail/cart-items/count",
  item: (cartItemId: number) => `/api/retail/cart-items/${cartItemId}`,
} as const;
