import type { Metadata } from "next";
import { LoginView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "로그인" };

export default function Page() {
  return (
    <AuthLayout>
      <LoginView />
    </AuthLayout>
  );
}
