import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CartButton } from "@/features/cart";
import { AppShell } from "@/shared/components/AppShell";

/* 주문 내역·미송·정산을 탭 세 개로 벌려 놓고 도는 업무라 탭 줄에서 화면이 구분돼야
   한다. 각 page.tsx가 `%s` 자리를 채우고, 채우지 않는 홈은 기본값을 그대로 쓴다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 마켓", default: "온도 마켓" },
};

/**
 * 셸이 있는 14화면. 계정 4화면(`(account)`)은 이 셸을 쓰지 않는다.
 *
 * 헤더의 장바구니 뱃지를 **여기서 조립한다.** 뱃지는 담긴 조합 수를 알아야 하고
 * 그 지식은 `features/cart`에 있는데, 셸은 `shared/`라 feature를 읽을 수 없다.
 * feature끼리·역방향 import 대신 부모인 이 레이아웃이 끼워 넣는다
 * (`docs/02-folder-structure.md` 원칙 3).
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <AppShell cart={<CartButton />}>{children}</AppShell>;
}
