import { Button } from "@ondo/ui";
import { Store } from "lucide-react";
import Link from "next/link";
import { EMPTY_PARTNERS } from "../constants";

/**
 * 거래한 도매처가 한 곳도 없을 때. 아이콘 하나 · 한 줄 설명 · **다음 행동 버튼**이
 * 빈 상태의 공통 형식이다(RT-33 · `05b_cart_empty.html`).
 *
 * 버튼은 실제로 이동하는 `<a>`다 — 빈 화면에서 유일하게 누를 것이 아무 데도 가지
 * 않으면 사장이 갇힌다(`retail-cart` 회차 F2).
 */
export function EmptyPartners() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <Store aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">{EMPTY_PARTNERS.title}</h3>
      <p className="text-muted-foreground text-body">
        {EMPTY_PARTNERS.description}
      </p>
      <div className="mt-3.5">
        <Button asChild>
          <Link href="/">상품 둘러보기</Link>
        </Button>
      </div>
    </div>
  );
}
