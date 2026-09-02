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
 * 세션이 있어야 열리는 화면(`승인 대기` · `승인 거절` · `계좌 온보딩`)이
 * 로그아웃 상태에서 대신 그리는 것.
 *
 * **폼을 내주지 않는다.** 예전에는 세션이 없어도 화면이 정상으로 뜨고, 칸을 다
 * 채우고 버튼까지 눌렸는데 아무것도 저장되지 않았다 — 온보딩은 이유 없이
 * `/login`으로 떨어졌고(`wholesale-account` F2), 거절 재신청은 `가입 심사 중이에요`
 * 화면으로 넘어가 **성공한 것처럼 보였다**(F3). 실행되지 않을 일은 실행 전에
 * 막고, 왜 막았는지 말한다.
 *
 * 더미 신청서를 폴백으로 그리지 않는 자리이기도 하다 — 로그아웃 상태로 주소만
 * 알면 남의 상호명·사업자 등록번호·거절 사유 전문이 그대로 보였다(F6).
 *
 * **로그아웃 한 가지만 그린다.** 판정 전(`unknown`)·옮기는 중처럼 곧 사라질
 * 프레임을 무엇으로 채울지는 자격을 판정하는 자리가 정한다(`AccountGate`) —
 * 그 순간을 로그아웃으로 그리면 정상 세션인 사장이 `로그인이 필요해요`를 한 번
 * 보고 지나간다.
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
