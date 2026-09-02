"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  SESSION_CHECKING_MESSAGE,
  SESSION_MOVING_MESSAGE,
  SESSION_REQUIRED_LEAD,
} from "../constants";
import { accountRedirectFor } from "../derive";
import { useSession, type SessionView } from "../store";
import type { AccountStatus } from "../types";
import { SessionRequired } from "./SessionRequired";

/** 통과했을 때 화면이 읽는 세션. `state` 분기가 이미 끝난 값이다 */
type SignedInSession = Extract<SessionView, { state: "signedIn" }>;

/** 화면에 설 자격 판정. 막혔으면 **왜** 막혔는지까지 같이 준다 */
export type GateVerdict =
  | { pass: true; session: SignedInSession }
  | { pass: false; blocked: "unknown" | "signedOut" | "moving" };

/**
 * 계정 화면 한 장에 **설 자격**을 본다. 세션 유무와 계정 상태를 한자리에서 본다.
 *
 * ERP는 `ErpGuard`가 상태까지 봤는데(`erpRedirectFor`) 계정 화면은 세션 유무만
 * 봐서, 로그인만 되어 있으면 자기 상태와 무관한 화면이 그대로 열렸다 —
 * `심사 중` 계정이 주소로 `/approval/rejected`를 열면 **받은 적 없는 거절 사유
 * 전문**이 보이고 `재신청하기`까지 눌려 신청 일시가 지금으로 덮였다
 * (`wholesale-account` F11). 무세션을 막은 F6 수정의 남은 절반이다.
 *
 * **판정을 화면마다 적지 않는다.** 세 화면이 각자 `if (status !== …)`를 쓰면
 * 화면이 늘 때 한 곳이 빠지고, 빠진 그 화면이 곧 남의 신청서를 그리는 자리가
 * 된다. 화면은 "여기 설 수 있는 상태" 하나만 말한다.
 *
 * ⚠️ **훅을 조건부로 부르지 않는다.** 부르는 화면들은 이 훅 앞뒤로 `useState`를
 *    쓰므로, 여기서 이른 반환을 하면 훅 호출 순서가 렌더마다 달라진다. 판정은
 *    값으로 돌려주고, 그리기는 부르는 쪽이 이른 반환으로 한다.
 */
export function useAccountGate(allowed: AccountStatus): GateVerdict {
  const router = useRouter();
  const session = useSession();

  /* 판정 전(`unknown`)에는 아무 데도 보내지 않는다 — 세션은 브라우저 저장소에만
     있어서 첫 프레임에는 아직 아무것도 모른다. 그 순간을 로그아웃으로 읽으면
     정상 세션이 튕긴다 */
  const redirect =
    session.state === "signedIn"
      ? accountRedirectFor(session.account, session.bankPromptSeen, allowed)
      : null;

  useEffect(() => {
    /* `replace`다 — 뒤로 가기로 막힌 화면에 다시 들어갈 수 있으면 가드가 아니다 */
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (session.state === "unknown") return { pass: false, blocked: "unknown" };
  if (session.state === "signedOut")
    return { pass: false, blocked: "signedOut" };
  if (redirect) return { pass: false, blocked: "moving" };

  return { pass: true, session };
}

/**
 * 막혔을 때 그 자리에 서는 것.
 *
 * **로그아웃**은 이유를 말하고 로그인으로 보내는 화면이 필요하다(`SessionRequired`).
 * **판정 전**과 **옮기는 중**은 곧 사라질 한 프레임이라 글자를 그리지 않는다 —
 * 그때마다 안내가 번쩍이면 그게 더 눈에 띈다. 대신 낭독기에는 남긴다:
 * 화면이 조용히 바뀌면 낭독기 사용자는 아무 일도 안 일어난 것으로 듣는다.
 *
 * ⚠️ 옮기는 중에 **본문을 그리지 않는 것이 이 컴포넌트의 일**이다. 한 프레임이라도
 *    그리면 `심사 중` 계정이 남의 거절 사유를 보고 지나간다(F11).
 */
export function AccountGateNotice({
  blocked,
  lead,
}: {
  blocked: Exclude<GateVerdict, { pass: true }>["blocked"];
  lead: (typeof SESSION_REQUIRED_LEAD)[keyof typeof SESSION_REQUIRED_LEAD];
}) {
  if (blocked === "signedOut") return <SessionRequired lead={lead} />;

  return (
    <p className="sr-only" role="status">
      {blocked === "moving" ? SESSION_MOVING_MESSAGE : SESSION_CHECKING_MESSAGE}
    </p>
  );
}
