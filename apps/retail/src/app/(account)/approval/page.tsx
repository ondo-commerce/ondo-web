import type { Metadata } from "next";
import { ApprovalStatusView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 대기" };

export default function Page() {
  return (
    <AuthLayout width="wide">
      <ApprovalStatusView />
    </AuthLayout>
  );
}
