import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/shared/components/AppShell";

/* 주문 내역·미송·정산을 탭 세 개로 벌려 놓고 도는 업무라 탭 줄에서 화면이 구분돼야
   한다. 각 page.tsx가 `%s` 자리를 채우고, 채우지 않는 홈은 기본값을 그대로 쓴다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 마켓", default: "온도 마켓" },
};

/** 셸이 있는 14화면. 계정 4화면(`(account)`)은 이 셸을 쓰지 않는다 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
