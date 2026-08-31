import type { Metadata } from "next";
import { ApprovalRejectedView, readStoreName } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 거절" };

/*
 * 상호명을 조회 문자열로 받아 재신청 뒤 승인 대기 화면까지 들고 간다.
 * 이 화면 자체는 상호를 그리지 않지만 여기서 끊으면 다음 화면이 더미로 돌아간다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const storeName = readStoreName(await searchParams);

  return (
    <AuthLayout width="wide">
      <ApprovalRejectedView storeName={storeName} />
    </AuthLayout>
  );
}
