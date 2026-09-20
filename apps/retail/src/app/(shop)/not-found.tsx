import { Button } from "@ondo/ui";
import Link from "next/link";

/**
 * `(shop)` 아래에서 `notFound()`가 떨어지는 자리 — 없는 상품 · 내려간 게시글 ·
 * 첫 장에 게시글이 없는 도매처 · 손으로 고친 주소. 없으면 Next 기본 영문
 * `404 This page could not be found.`가 셸 안에 뜨고 앱 안의 말이 한 줄도 없다(F4).
 *
 * **상품인지 도매처인지 구분하지 않는다** — `notFound()`는 인자를 못 받고, 이
 * 화면은 던진 페이지가 무엇이었는지 모른다. 그래서 문구는 중립이고 둘째 줄이
 * "게시가 내려갔을 수 있다"는 가장 흔한 이유를 대신 말한다 — 빈 상세를 그리면
 * "품절"로 읽히듯, 영문 404는 "사이트가 고장났다"로 읽힌다.
 *
 * `(shop)/error.tsx`와 같은 결. 다만 여기는 다시 시도할 것이 없어 홈 링크뿐이다.
 */
export default function ShopNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center">
      <div>
        <p className="text-sm font-medium">찾는 페이지가 없어요</p>
        <p className="text-muted-foreground mt-1 text-xs">
          주소가 잘못됐거나, 상품·도매처가 지금 마켓에 게시돼 있지 않아요.
        </p>
      </div>
      <Button asChild variant="line" size="sm">
        <Link href="/">홈으로</Link>
      </Button>
    </div>
  );
}
