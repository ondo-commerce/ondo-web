import { Badge, Button, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { ApprovalSteps } from "./ApprovalSteps";
import { ComingSoonDialog } from "./ComingSoonDialog";
import { SummaryList } from "./SummaryList";
import { ACCOUNT_PATH, ACCOUNT_STATUS_LABEL } from "../constants";
import { approvalSteps } from "../derive";
import { APPLICATION } from "../fixtures";

/**
 * 가입 심사 중 화면.
 *
 * 이 화면이 하는 일은 "지금 어디쯤이고 언제 끝나는가"를 말하는 것 하나다.
 * 승인 전에는 도매가를 못 본다는 전제(RT-09)를 화면이 처음으로 말하는 자리이기도
 * 해서, 왜 심사하는지를 안내로 같이 둔다.
 */
export function ApprovalStatusView() {
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
              { label: "상호명", value: APPLICATION.storeName },
              { label: "사업자등록번호", value: APPLICATION.bizNo },
              { label: "신청 일시", value: APPLICATION.appliedAt },
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
                도매 가격은 사업자에게만 공개돼요. 일반 소비자에게 노출되지
                않도록 사업자등록번호를 확인해요.
              </span>
            </span>
          </Notice>
        </AuthSection>

        {/* 좌측 정렬. 이 화면에는 "지금 해야 할 일"이 없어서 오른쪽 끝으로
            밀어 두면 확정 액션처럼 읽힌다 */}
        <AuthSection className="flex gap-2">
          <Button asChild variant="line">
            <Link href={ACCOUNT_PATH.login}>로그인 화면으로</Link>
          </Button>
          <ComingSoonDialog
            trigger={<Button variant="ghost">문의하기</Button>}
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
