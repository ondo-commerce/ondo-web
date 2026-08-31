"use client";

import { Button } from "@ondo/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCartCount } from "@/shared/cart-store";

/**
 * 장바구니 아이콘 + 담긴 조합 수 카운터.
 *
 * `packages/ui`의 `Badge`를 쓰지 않는다 — 저건 높이 26px 알약형 **상태** 배지고
 * 여기 필요한 건 아이콘 위에 겹치는 원형 **카운터**다. 형태가 다른 물건이라
 * Badge를 늘리는 대신 이 컴포넌트 안에 둔다(Rule of Two 전).
 *
 * `IconButton`이 아니라 `Button asChild`인 이유: IconButton은 asChild를 받지 않아
 * 항상 <button>이 된다. 화면을 옮기는 것은 <a>여야 새 탭 열기·미리보기가 산다.
 *
 * 숫자를 고정 더미(`CART_ITEM_COUNT`)에서 읽던 자리다. 장바구니 화면에서 조합을
 * 지워도 뱃지가 4에 멈춰 있으면, 원본의 §6-4 결함(같은 화면에서 헤더·뱃지·본문이
 * 서로 다른 숫자)이 그대로 살아난다. **본문과 같은 스토어 하나**를 읽는다.
 */
export function CartButton() {
  const count = useCartCount();

  return (
    /* ≤40rem에서 44×44 — 손가락 최소 타깃(`_base.css:340` `.iconbtn`) */
    <Button
      asChild
      variant="ghost"
      className="relative size-8 px-0 phone:size-11"
    >
      {/* 뱃지 숫자와 접근성 이름이 같은 값을 읽는다 — 원본의 3중 불일치(§6-4) 수정 */}
      <Link href="/cart" aria-label={`장바구니, ${count}개 담김`}>
        <ShoppingBag aria-hidden className="size-4.5" />
        <span
          aria-hidden
          className="bg-foreground text-card absolute top-px right-px grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none tracking-normal"
        >
          {count}
        </span>
      </Link>
    </Button>
  );
}
