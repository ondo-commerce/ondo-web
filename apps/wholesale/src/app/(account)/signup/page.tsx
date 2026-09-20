import type { Metadata } from "next";
import { SignupView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  /* 칸이 11개라 560px이다. 440px에 넣으면 2열 칸이 각 196px로 좁아져
     `매장 대표 전화번호` 같은 긴 라벨이 두 줄로 접힌다 */
  return (
    <AuthLayout width="wide">
      <SignupView />
    </AuthLayout>
  );
}
