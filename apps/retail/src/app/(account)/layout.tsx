import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthLayout } from "@/shared/components/AuthLayout";

/* 셸이 있는 화면과 탭 제목이 구분돼야 한다 — 각 page.tsx가 `%s` 자리를 채운다 */
export const metadata: Metadata = {
  title: { template: "%s · 온도 마켓 계정", default: "온도 마켓 계정" },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
