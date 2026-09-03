"use client";

import { Button } from "@ondo/ui";
import Link from "next/link";
import {
  ACCOUNT_PATH,
  SESSION_DISCLAIMER,
  SESSION_REQUIRED_LEAD,
  SESSION_REQUIRED_TITLE,
} from "../constants";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";

/**
 * 세션이 있어야 열리는 화면 셋이 로그아웃 상태에서 대신 그리는 것.
 *
 * **폼을 내주지 않는다.** 예전에는 세션이 없어도 칸을 다 채우고 버튼까지 눌렸는데
 * 아무것도 저장되지 않았다 — 온보딩은 이유 없이 `/login`으로 떨어졌고
 * (`wholesale-account` F2), 재신청은 심사 중 화면으로 넘어가 **성공한 것처럼
 * 보였다**(F3). 더미 신청서를 폴백으로 그리지 않는 자리이기도 하다(F6).
 *
 * **로그아웃 한 가지만 그린다.** 판정 전·옮기는 중을 여기로 그리면 정상 세션인
 * 사장이 `로그인이 필요해요`를 한 번 보고 지나간다(`AccountGate`가 정한다).
 */
export function SessionRequired({
  lead,
}: {
  lead: (typeof SESSION_REQUIRED_LEAD)[keyof typeof SESSION_REQUIRED_LEAD];
}) {
  return (
    <>
      <AuthPanel title={SESSION_REQUIRED_TITLE} lead={lead}>
        <AuthSection>
          <Button asChild size="lg" className="w-full">
            <Link href={ACCOUNT_PATH.login}>로그인 화면으로</Link>
          </Button>
        </AuthSection>
      </AuthPanel>

      {/* 왜 로그인이 풀렸는지가 이 화면에서 가장 자주 나올 질문이다 */}
      <AuthFoot>{SESSION_DISCLAIMER}</AuthFoot>
    </>
  );
}
