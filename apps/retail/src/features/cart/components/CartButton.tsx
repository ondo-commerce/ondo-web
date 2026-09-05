import { Button } from "@ondo/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";

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
 * **`shared/components/`가 아니라 이 feature 안에 있다.** 담긴 수가 무엇인지 아는
 * 것은 장바구니 도메인이고, 셸은 그것을 모른 채 자리만 비워 둔다 —
 * `app/(shop)/layout.tsx`가 이 컴포넌트를 헤더에 끼워 넣는다.
 *
 * 숫자는 **서버**(`GET /cart-items/count`)가 준다. 레이아웃이 요청마다 받아 prop으로
 * 넘기고, 장바구니 화면의 쓰기가 끝나면 `router.refresh()`가 레이아웃까지 다시
 * 그려서 본문과 같은 값을 본다 — 원본의 §6-4 결함(같은 화면에서 헤더·뱃지·본문이
 * 서로 다른 숫자)이 살아나지 않는다. 클라이언트 훅이 없어 서버 컴포넌트다.
 */
export function CartButton({
  count,
}: {
  /** 담긴 종류 수. null이면 아직 승인 전 계정이라 서버가 안 준 것 — 숫자를 지어내지 않는다 */
  count: number | null;
}) {
  return (
    /* ≤40rem에서 44×44 — 손가락 최소 타깃(`_base.css:340` `.iconbtn`) */
    <Button
      asChild
      variant="ghost"
      className="relative size-8 px-0 phone:size-11"
    >
      {/* 뱃지 숫자와 접근성 이름이 같은 값을 읽는다 — 원본의 3중 불일치(§6-4) 수정 */}
      <Link
        href="/cart"
        aria-label={count === null ? "장바구니" : `장바구니, ${count}개 담김`}
      >
        <ShoppingBag aria-hidden className="size-4.5" />
        {count === null ? null : (
          <span
            aria-hidden
            className="bg-foreground text-card absolute top-px right-px grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none tracking-normal"
          >
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}
