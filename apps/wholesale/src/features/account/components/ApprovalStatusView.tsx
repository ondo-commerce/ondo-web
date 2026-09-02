"use client";

import { Badge, Button, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import {
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  DOCUMENT_LABEL,
  SESSION_REQUIRED_LEAD,
} from "../constants";
import { applicationFor, approvalSteps } from "../derive";
import { signOut, useSession } from "../store";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { ApprovalSteps } from "./ApprovalSteps";
import { ComingSoonDialog } from "./ComingSoonDialog";
import { SessionRequired } from "./SessionRequired";
import { SummaryList } from "./SummaryList";

/**
 * 가입 심사 중 화면.
 *
 * 이 화면이 하는 일은 "지금 어디쯤이고 언제 끝나는가"를 말하는 것 하나다.
 *
 * 상호명·사업자 등록번호를 **세션에서 읽는다.** 더미 상수를 읽으면 누가
 * 로그인했든, 방금 무엇으로 신청했든 늘 같은 상호를 말한다(`retail-account` F1).
 * 소매는 세션이 없어 `/approval?store=…`로 주소에 실어 날랐는데, 그러면 주소를
 * 고쳐 **남의 상호명을 이 화면에 띄울 수 있다.** 도매는 그 통로를 만들지 않는다.
 *
 * ⚠️ **로그아웃 상태에서는 신청서를 그리지 않는다.** 쿼리스트링을 없애 놓고도
 *    무세션 접근이라는 같은 통로가 남아 있었다 — 주소만 알면 더미 신청서
 *    (`상호명 온도의류 · 사업자 등록번호 000-00-00000`)가 그대로 보였다
 *    (`wholesale-account` F6). 지금은 값이 전부 자리표시자라 실피해가 없지만,
 *    진짜 인증이 붙는 이슈에서 이 폴백이 남으면 그때는 남의 신청서가 된다.
 */
export function ApprovalStatusView() {
  const session = useSession();

  if (session.state !== "signedIn") {
    return (
      <SessionRequired
        state={session.state}
        lead={SESSION_REQUIRED_LEAD.approval}
      />
    );
  }

  const application = applicationFor(session.account, session.appliedAt);

  return (
    <>
      <AuthPanel
        badge={<Badge>{ACCOUNT_STATUS_LABEL.PENDING}</Badge>}
        title="가입 심사 중이에요"
        lead="제출하신 사업자 정보를 확인하고 있어요. 영업일 기준 1~2일 안에 승인 결과를 이메일로 보내드려요."
      >
        <AuthSection>
          <ApprovalSteps steps={approvalSteps("PENDING")} />
        </AuthSection>

        <AuthSection>
          <SummaryList
            items={[
              { label: "상호명", value: application.storeName },
              { label: "사업자 등록번호", value: application.bizNo },
              { label: "신청 일시", value: application.appliedAt },
              /* 도매는 서류가 2종이다. 무엇을 냈는지가 화면에 남아야 거절됐을 때
                 무엇을 다시 내는지 안다 */
              {
                label: "제출 서류",
                value: `${DOCUMENT_LABEL.license} · ${DOCUMENT_LABEL.idCard}`,
              },
            ]}
          />
        </AuthSection>

        <AuthSection>
          <Notice>
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <b className="font-medium">왜 심사하나요?</b>
                <br />
                도매 계정은 재고·정산 같은 매장 장부를 다뤄요. 사업자 등록번호를
                확인한 뒤 열어드려요.
              </span>
            </span>
          </Notice>
        </AuthSection>

        {/* 왼쪽 정렬. 이 화면에는 "지금 해야 할 일"이 없어서 오른쪽 끝으로
            밀어 두면 확정 액션처럼 읽힌다 */}
        <AuthSection className="flex gap-2">
          {/* `<a>`로 남긴다 — onClick + router.push로 만들면 새 탭 열기가 죽는다.
              누르면 세션을 푼다: 이 화면에서 로그인 화면으로 돌아간다는 건
              "다른 계정으로 들어가겠다"는 뜻이고, 세션이 남아 있으면 주소창에
              `/products`를 쳤을 때 다시 이 화면으로 튕겨 온다 */}
          <Button asChild variant="line">
            <Link href={ACCOUNT_PATH.login} onClick={() => signOut()}>
              로그인 화면으로
            </Link>
          </Button>
          <ComingSoonDialog
            trigger={
              <Button type="button" variant="ghost">
                문의하기
              </Button>
            }
            title="문의 창구는 준비 중이에요"
            description="아직 만들지 않은 화면이에요. 심사가 3영업일을 넘기면 신청하신 이메일로 진행 상황을 먼저 보내드려요."
          />
        </AuthSection>
      </AuthPanel>

      <AuthFoot>
        거절되면 사유와 함께 재신청 안내를 이메일로 보내드려요 · 신청 이력은
        계정에 남아요
      </AuthFoot>
    </>
  );
}
