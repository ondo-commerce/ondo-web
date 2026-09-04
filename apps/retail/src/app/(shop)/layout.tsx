import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountChip } from "@/features/account";
import { CartButton } from "@/features/cart";
import { requireSession } from "@/shared/api/server";
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
 */
export default async function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await requireSession();

  return (
    <AppShell
      cart={<CartButton />}
      account={<AccountChip storeName={me.shopName} />}
    >
      {children}
    </AppShell>
  );
}
