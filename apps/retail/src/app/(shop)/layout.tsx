import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountChip } from "@/features/account";
import { CART_PATH, CartButton, type CartCountWire } from "@/features/cart";
import { requireSession, serverApi } from "@/shared/api/server";
import { AppShell } from "@/shared/components/AppShell";

/* 주문 내역·미송·정산을 탭 세 개로 벌려 놓고 도는 업무라 탭 줄에서 화면이 구분돼야
   한다. 각 page.tsx가 `%s` 자리를 채우고, 채우지 않는 홈은 기본값을 그대로 쓴다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 마켓", default: "온도 마켓" },
};

/* 세션(쿠키)을 읽는 레이아웃이라 아래 전부가 요청마다 렌더된다. `cookies()`만으로도
   그렇게 되지만, 빌드가 어느 화면을 정적으로 굳히려 드는지 헷갈리지 않게 못 박는다 */
export const dynamic = "force-dynamic";

/**
 * 헤더 뱃지 숫자. **세션 확인 뒤에** 부른다 — 세션이 없으면 `requireSession`이
 * 먼저 `/login`으로 보내야지, 이 요청의 401이 먼저 던져지면 안 된다.
 *
 * **못 받으면 `null`(아이콘만)이고 던지지 않는다.** 뱃지는 장식이다 — 이 레이아웃이
 * throw하면 `(shop)/error.tsx`는 같은 세그먼트의 레이아웃 에러를 못 받고(Next 규칙)
 * `app/error.tsx`도 없어서, 숫자 하나 때문에 셸 아래 14화면(상품 검색·주문 내역·
 * 정산)이 전부 Next 기본 에러 화면이 된다. 그래서 이유를 가리지 않고 삼킨다:
 * - 승인 전 계정의 403(`ACCOUNT_NOT_APPROVED`) — 셸 전체를 승인 대기로 보내지
 *   않는다. 로그인 화면이 이미 상태별로 갈라 보내고, 승인 대기 화면은 이 셸 밖
 *   (`(account)`)이라 여기서 또 보내면 서로 튕긴다.
 * - 5xx·타임아웃·연결 실패 — 서버가 아픈 것은 각 화면의 본문 요청이 자기
 *   자리에서 알린다. 뱃지가 대신 죽을 일이 아니다.
 * 401은 바로 앞의 `requireSession`이 `/login`으로 보내므로 여기까지 오지 않는다.
 */
async function fetchCartCount(): Promise<number | null> {
  const api = await serverApi();
  try {
    const { count } = await api.fetch<CartCountWire>(CART_PATH.count);
    return count;
  } catch {
    return null;
  }
}

/**
 * 셸이 있는 14화면. 계정 4화면(`(account)`)은 이 셸을 쓰지 않는다.
 *
 * **여기가 로그인 가드다.** 서버에서 `/me`를 불러 세션이 없으면 `/login`으로
 * 보낸다 — 첫 HTML이 나가기 전에 갈리므로 로그인 전 화면이 한 프레임도 안 보인다.
 * 그 응답의 상호명을 계정 칩에 넘겨 첫 HTML부터 이름이 있게 한다.
 * 이 때문에 `(shop)` 전체가 동적 렌더다(`cookies()`를 읽는다).
 *
 * 헤더의 장바구니 뱃지와 계정 칩을 **여기서 조립한다.** 뱃지는 담긴 조합 수를,
 * 칩은 로그인한 상호명을 알아야 하는데 그 지식은 각각 `features/cart`와
 * `features/account`에 있고, 셸은 `shared/`라 feature를 읽을 수 없다.
 * feature끼리·역방향 import 대신 부모인 이 레이아웃이 끼워 넣는다
 * (`docs/02-folder-structure.md` 원칙 3).
 *
 * 뱃지 숫자는 `GET /cart-items/count`에서 온다. 장바구니 화면의 쓰기가 끝나면
 * `router.refresh()`가 이 레이아웃까지 다시 실행해서 본문과 같은 값을 본다.
 */
export default async function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await requireSession();
  const cartCount = await fetchCartCount();

  return (
    <AppShell
      cart={<CartButton count={cartCount} />}
      account={<AccountChip storeName={me.shopName} />}
    >
      {children}
    </AppShell>
  );
}
