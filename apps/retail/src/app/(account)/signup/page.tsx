import type { Metadata } from "next";
import { SignupView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  return (
    <AuthLayout>
      <SignupView />
    </AuthLayout>
  );
}
