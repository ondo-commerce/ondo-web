import type { Metadata } from "next";
import { SettingsView } from "@/features/account";
import { requireSession } from "@/shared/api/server";

export const metadata: Metadata = { title: "설정" };

/* 값은 전부 `/me`에서 온다 — 더미로 두면 로그인한 계정과 다른 상호·주소가 보인다
   (#217 R6, `side-02` #4). 셸 레이아웃이 이미 세션을 확인했으므로 값만 다시 읽는다 */
export default async function Page() {
  const me = await requireSession();
  return (
    <SettingsView
      shopName={me.shopName}
      email={me.email}
      appliedAt={me.appliedAt}
    />
  );
}
