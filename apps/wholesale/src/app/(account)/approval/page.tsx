import type { Metadata } from "next";
import { ApprovalStatusView } from "@/features/account";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 대기" };

/* 상호명을 조회 문자열로 받지 않는다 — 세션이 들고 있다. 주소를 고쳐 남의
   상호명을 이 화면에 띄울 통로를 만들지 않으려는 것이다 */
export default function Page() {
  return (
    <AuthLayout width="wide">
      <ApprovalStatusView />
    </AuthLayout>
  );
}
