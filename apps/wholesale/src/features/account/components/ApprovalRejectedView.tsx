"use client";

import { Button, cn, FormField, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { announceArrival } from "../arrival";
import {
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  ARRIVAL_MESSAGE,
  DOCUMENT_LABEL,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  labelId,
  SESSION_REQUIRED_LEAD,
} from "../constants";
import { approvalSteps, validateReapply } from "../derive";
import { REJECTION } from "../fixtures";
import { applyReapply } from "../store";
import type { AttachedFile, DocumentField } from "../types";
import { AccountGateNotice, useAccountGate } from "./AccountGate";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { ApprovalSteps } from "./ApprovalSteps";
import { ComingSoonDialog } from "./ComingSoonDialog";
import { FieldError, FieldHelp } from "@/shared/components/FieldError";
import { FileField } from "./FileField";
import { WarnBadge, WarnNotice } from "./WarnNotice";

/** 두 칸을 한 상태로 든다 — 한쪽을 고를 때 다른 쪽 이름이 사라지면 안 된다 */
type Documents = Record<DocumentField, AttachedFile | null>;

const NO_DOCUMENTS: Documents = { license: null, idCard: null };

/**
 * 가입 거절 화면. **왜** 막혔는지 읽고 그 자리에서 서류를 다시 올린다.
 *
 * 거절 사유는 빨간 경고 배너, 아래쪽 `왜 거절되나요?`는 회색 안내다 — 하나는
 * **내 신청에 일어난 일**이고 하나는 **제도 설명**이라, 톤이 같으면 어느 쪽이 내
 * 얘기인지 구분되지 않는다. 재첨부 칸이 2개인 이유는 `derive.validateReapply`.
 *
 * ⚠️ **로그아웃 상태에서는 폼을 내주지 않는다.** 거절 안내 메일의 링크를 새 탭에서
 *    여는 것이 정확히 그 경로인데(`sessionStorage`는 탭 단위다), 예전에는 사유가
 *    읽히고 서류가 붙고 `재신청하기`까지 눌린 뒤 **아무것도 저장되지 않은 채**
 *    심사 중 화면으로 넘어갔다(`wholesale-account` F3). 거짓 성공은 실패보다 나쁘다.
 *
 * ⚠️ **거절된 계정만 이 화면에 선다**(`useAccountGate`). 로그인만 보고 열어 주면
 *    `심사 중` 계정이 주소로 들어와 **자기가 받은 적 없는 거절 사유 전문**을 읽고
 *    `재신청하기`까지 눌러 신청 일시를 지금으로 덮었다(`wholesale-account` F11).
 */
export function ApprovalRejectedView() {
  const router = useRouter();
  const gate = useAccountGate("REJECTED");
  const [documents, setDocuments] = useState<Documents>(NO_DOCUMENTS);
  /** 한 번 걸린 뒤에는 파일을 고르는 즉시 문구가 풀린다 */
  const [revealed, setRevealed] = useState(false);

  const found = validateReapply(documents);
  const error = revealed ? found.license : undefined;

  /* 훅을 전부 부른 **뒤에** 가른다 — 훅 호출 순서는 렌더마다 같아야 한다 */
  if (!gate.pass) {
    return (
      <AccountGateNotice
        blocked={gate.blocked}
        lead={SESSION_REQUIRED_LEAD.rejected}
      />
    );
  }

  const email = gate.session.account.email;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (found.license) {
      setRevealed(true);
      document.getElementById(fieldId("license"))?.focus();
      return;
    }

    /* **저장이 먼저다.** 이동만 하고 저장을 건너뛰면 화면은 성공을 말하는데 상태는
       그대로다(`wholesale-account` F3) */
    applyReapply(email);
    announceArrival(ACCOUNT_PATH.approval, ARRIVAL_MESSAGE.reapplied);
    router.replace(ACCOUNT_PATH.approval);
  };

  /** 재첨부칸 한 벌. 등록증과 신분증이 같은 모양이다 */
  const documentField = (field: DocumentField) => (
    <FormField
      className={cn("mb-4 last:mb-0", FIELD_LABEL_CLASS)}
      /* `htmlFor`를 주지 않는다 — 이유는 `FileField` */
      label={
        <span id={labelId(field)}>{DOCUMENT_LABEL[field]} 다시 올리기</span>
      }
    >
      <FileField
        id={fieldId(field)}
        emptyLabel="파일 다시 첨부"
        file={documents[field]}
        /* 오류 문구는 첫 칸에만 붙지만 "아무것도 안 올렸다"는 두 칸 모두의
           사정이라 테두리는 둘 다 빨개진다 */
        invalid={error !== undefined}
        labelledBy={labelId(field)}
        describedBy={
          field === "license" && error
            ? `${errorId(field)} ${fieldId(field)}-help`
            : `${fieldId(field)}-help`
        }
        onSelect={(file) =>
          setDocuments((prev) => ({ ...prev, [field]: file }))
        }
      />
      {field === "license" && error ? (
        <FieldError id={errorId(field)}>{error}</FieldError>
      ) : null}
      {/* 예고형이다. 아직 심사 중으로 바뀌지 않았다 */}
      <FieldHelp id={`${fieldId(field)}-help`}>
        다시 올리면 상태가 심사 중으로 바뀌고, 영업일 1~2일 안에 결과를
        알려드려요.
      </FieldHelp>
    </FormField>
  );

  return (
    <>
      <AuthPanel
        badge={<WarnBadge>{ACCOUNT_STATUS_LABEL.REJECTED}</WarnBadge>}
        title="가입이 거절됐어요"
        lead="아래 사유를 확인하고 서류를 다시 올리면 재심사를 받을 수 있어요."
      >
        <AuthSection>
          <ApprovalSteps steps={approvalSteps("REJECTED")} />
        </AuthSection>

        <AuthSection title="거절 사유">
          <WarnNotice>
            {REJECTION.reason}
            <br />
            <span className="text-muted-foreground">
              {REJECTION.decidedAt} · {REJECTION.decidedBy}
            </span>
          </WarnNotice>
        </AuthSection>

        <form onSubmit={submit} noValidate>
          <AuthSection>
            {documentField("license")}
            {documentField("idCard")}
          </AuthSection>

          <AuthSection>
            <Notice>
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <b className="font-medium">왜 거절되나요?</b>
                  <br />
                  도매 계정은 재고·정산 장부를 다뤄요. 사업자 확인이 안 되면
                  가입할 수 없어요.
                </span>
              </span>
            </Notice>
          </AuthSection>

          <AuthSection className="flex gap-2">
            {/* 잠그지 않는다. 파일이 없으면 눌러서 첨부칸으로 데려간다 */}
            <Button type="submit">재신청하기</Button>
            <ComingSoonDialog
              trigger={
                <Button type="button" variant="ghost">
                  문의하기
                </Button>
              }
              title="문의 창구는 준비 중이에요"
              description="아직 만들지 않은 화면이에요. 거절 사유를 다시 확인하고 싶으면 신청하신 이메일로 보내드린 안내를 확인해 주세요."
            />
          </AuthSection>

          {/* 넘어간 뒤 되돌아와 또 누르는 걸 막는다 */}
          <p className="text-muted-foreground mt-2 text-xs leading-4.5">
            재신청은 한 번만 누르면 돼요. 접수되면 심사 현황 화면으로 넘어가요.
          </p>
        </form>
      </AuthPanel>

      <AuthFoot>
        재신청하면 승인 이력에 새 줄이 쌓여요 · 거절 사유는 이력에만 저장돼요
      </AuthFoot>
    </>
  );
}
