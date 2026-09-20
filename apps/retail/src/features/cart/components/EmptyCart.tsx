import { Button } from "@ondo/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { EMPTY_CART } from "../constants";

/**
 * 담긴 것이 하나도 없을 때. 아이콘 하나 · 한 줄 설명 · **다음 행동 버튼 두 개**가
 * 빈 상태의 공통 형식이다(`05b_cart_empty.html`).
 *
 * 두 버튼 다 실제로 이동하는 `<a>`다 — 빈 화면에서 유일하게 누를 것이 아무 데도
 * 가지 않으면 사장이 갇힌다(직전 회차 F2: onClick도 href도 없는 버튼).
 *
 * `주문 내역에서 다시 주문`이 목록으로만 가고 다시 주문 모달까지 열지는 않는다 —
 * 그 모달(RT-47)은 주문 회차 몫이라 아직 없다. 없는 것을 있는 척하지 않는다.
 */
export function EmptyCart() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <ShoppingBag aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">{EMPTY_CART.title}</h3>
      <p className="text-muted-foreground text-body">
        {EMPTY_CART.description}
      </p>
      <div className="mt-3.5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">상품 둘러보기</Link>
        </Button>
        <Button asChild variant="line">
          <Link href="/orders">주문 내역에서 다시 주문</Link>
        </Button>
      </div>
    </div>
  );
}
