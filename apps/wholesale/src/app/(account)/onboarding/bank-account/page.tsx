import type { Metadata } from "next";
import { OnboardingBankView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "정산 계좌 등록" };

/* 칸이 3개뿐이라 440px이다. 로그인과 같은 폭 — 입력이 적은 화면 쪽이다 */
export default function Page() {
  return (
    <AuthLayout>
      <OnboardingBankView />
    </AuthLayout>
  );
}
