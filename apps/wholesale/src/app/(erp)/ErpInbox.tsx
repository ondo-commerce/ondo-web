"use client";

import { useSessionEmail } from "@/features/account";
import { HeaderInbox } from "@/features/notification";

/**
 * 헤더 채팅 링크 + 알림 종에 로그인 이메일을 넘긴다(count 캐시를 계정마다 나눈다). `layout.tsx`는 서버
 * 컴포넌트라 훅을 못 부르고, notification이 account를 직접 읽으면 feature끼리 import다 — 그래서 여기서 잇는다.
 */
export function ErpInbox() {
  const email = useSessionEmail();
  return <HeaderInbox account={email} />;
}
