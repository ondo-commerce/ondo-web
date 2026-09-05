import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ApprovalRejectedView,
  homePathForStatus,
  toAccountStatus,
  toRejectionView,
} from "@/features/account";
import { requireSession } from "@/shared/api/server";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 거절" };

export const dynamic = "force-dynamic";

/*
 * `/me`의 `rejection`이 원본이다. 거절된 계정이 아니면 제 화면으로 돌려보낸다 —
 * 승인 대기 page와 같은 규칙이다.
 */
export default async function Page() {
  const me = await requireSession();
  const status = toAccountStatus(me.approvalStatus);
  if (status !== "REJECTED") redirect(homePathForStatus(status));

  return (
    <AuthLayout width="wide">
      <ApprovalRejectedView rejection={toRejectionView(me)} />
    </AuthLayout>
  );
}
