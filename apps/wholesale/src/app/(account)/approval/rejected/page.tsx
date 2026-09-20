import type { Metadata } from "next";
import { ApprovalRejectedView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 거절" };

export default function Page() {
  return (
    <AuthLayout width="wide">
      <ApprovalRejectedView />
    </AuthLayout>
  );
}
