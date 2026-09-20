import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ApprovalStatusView,
  homePathForStatus,
  toAccountStatus,
  toApplicationView,
} from "@/features/account";
import { requireSession } from "@/shared/api/server";
import { AuthLayout } from "@/shared/components/AuthLayout";

export const metadata: Metadata = { title: "승인 대기" };

/* 세션(쿠키)을 읽어 `/me`를 부른다. `cookies()`만으로도 동적이 되지만 못 박는다 */
export const dynamic = "force-dynamic";

/*
 * `/me`가 원본이다. 세션이 없으면 `requireSession`이 `/login`으로 보낸다 —
 * `(account)` 그룹엔 셸 레이아웃이 없어 page가 직접 부른다.
 *
 * 심사 중이 아닌 계정은 제 화면으로 돌려보낸다. 승인된 사장이 주소를 직접 치면
 * 마켓으로, 거절된 사장은 거절 화면으로 — 이 화면은 `심사 중` 배지를 박아 두고
 * 있어서 다른 상태를 그리면 거짓말이 된다.
 */
export default async function Page() {
  const me = await requireSession();
  const status = toAccountStatus(me.approvalStatus);
  if (status !== "PENDING") redirect(homePathForStatus(status));

  return (
    <AuthLayout width="wide">
      <ApprovalStatusView application={toApplicationView(me)} />
    </AuthLayout>
  );
}
