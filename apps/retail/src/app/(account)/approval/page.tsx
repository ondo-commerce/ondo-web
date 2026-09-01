import type { Metadata } from "next";
import { ApprovalStatusView, readStoreName } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 대기" };

/*
 * 상호명을 조회 문자열로 받는다.
 *
 * 세션도 쿠키도 없어서(백엔드 없음) 로그인·가입 화면이 알아낸 상호를 이 화면에
 * 넘길 길이 주소뿐이다. 없으면 더미로 돌아가므로 주소를 직접 쳐도 빈 줄이 생기지
 * 않는다. 이 때문에 라우트가 정적에서 동적으로 바뀐다 — 실제 세션이 붙으면
 * 조회 문자열째로 사라질 자리다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const storeName = readStoreName(await searchParams);

  return (
    <AuthLayout width="wide">
      <ApprovalStatusView storeName={storeName} />
    </AuthLayout>
  );
}
