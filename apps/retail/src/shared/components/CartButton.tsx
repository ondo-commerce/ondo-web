import { Button } from "@ondo/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { CART_ITEM_COUNT } from "@/shared/fixtures";

/**
 * 장바구니 아이콘 + 담긴 조합 수 카운터.
 *
 * `packages/ui`의 `Badge`를 쓰지 않는다 — 저건 높이 26px 알약형 **상태** 배지고
 * 여기 필요한 건 아이콘 위에 겹치는 원형 **카운터**다. 형태가 다른 물건이라
 * Badge를 늘리는 대신 이 컴포넌트 안에 둔다(Rule of Two 전).
 *
 * `IconButton`이 아니라 `Button asChild`인 이유: IconButton은 asChild를 받지 않아
 * 항상 <button>이 된다. 화면을 옮기는 것은 <a>여야 새 탭 열기·미리보기가 산다.
 */
export function CartButton() {
  return (
    <Button asChild variant="ghost" className="relative size-8 px-0">
      {/* 뱃지 숫자와 접근성 이름이 같은 값을 읽는다 — 원본의 3중 불일치(§6-4) 수정 */}
      <Link href="/cart" aria-label={`장바구니, ${CART_ITEM_COUNT}개 담김`}>
        <ShoppingBag aria-hidden className="size-4.5" />
        <span
          aria-hidden
          className="bg-foreground text-card absolute top-px right-px grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none tracking-normal"
        >
          {CART_ITEM_COUNT}
        </span>
      </Link>
    </Button>
  );
}
