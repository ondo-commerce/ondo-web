import type { Metadata } from "next";
import { AuthLayout } from "@/shared/components/AuthLayout";
import { PlaceholderPage } from "@/shared/components/PlaceholderPage";

export const metadata: Metadata = { title: "승인 거절" };

export default function Page() {
  return (
    <AuthLayout>
      <PlaceholderPage title="승인 거절" />
    </AuthLayout>
  );
}
