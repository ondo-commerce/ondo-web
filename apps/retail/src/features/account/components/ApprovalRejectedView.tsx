"use client";

import { Button, FormField, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { ApprovalSteps } from "./ApprovalSteps";
import { ComingSoonDialog } from "./ComingSoonDialog";
import { FieldError, FieldHelp } from "./FieldError";
import { FileField } from "./FileField";
import { WarnBadge, WarnNotice } from "./WarnNotice";
import {
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  errorId,
  fieldId,
} from "../constants";
import { approvalSteps, validateReapply } from "../derive";
import { REJECTION } from "../fixtures";
import type { AttachedFile } from "../types";

/**
 * 가입 거절 화면. 왜 거절됐는지 읽고 서류를 다시 올리는 데까지가 이 화면이다.
 *
 * 거절 사유는 빨간 경고 배너, 아래쪽 `왜 거절되나요?`는 회색 안내다 — 둘 다
 * 읽을 글이지만 하나는 **내 신청에 일어난 일**이고 하나는 **제도 설명**이다.
 * 톤이 같으면 어느 쪽이 내 얘기인지 구분되지 않는다.
 */
export function ApprovalRejectedView() {
  const router = useRouter();
  const [license, setLicense] = useState<AttachedFile | null>(null);
  /** 한 번 걸린 뒤에는 파일을 고르는 즉시 문구가 풀린다 */
  const [revealed, setRevealed] = useState(false);

  const found = validateReapply(license);
  const error = revealed ? found.license : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (found.license) {
      setRevealed(true);
      document.getElementById(fieldId("license"))?.focus();
      return;
    }
    /* 접수까지가 이번 범위다. 상태가 REJECTED → PENDING으로 돌아가는 화면으로 보낸다 */
    router.push(ACCOUNT_PATH.approval);
  };

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

        <form onSubmit={submit}>
          <AuthSection>
            <FormField
              className="mb-0"
              label="사업자등록증 다시 올리기"
              htmlFor={fieldId("license")}
            >
              <FileField
                id={fieldId("license")}
                emptyLabel="파일 다시 첨부"
                file={license}
                invalid={error !== undefined}
                describedBy={
                  error
                    ? `${errorId("license")} ${fieldId("license")}-help`
                    : `${fieldId("license")}-help`
                }
                onSelect={setLicense}
              />
              {error ? (
                <FieldError id={errorId("license")}>{error}</FieldError>
              ) : null}
              {/* 예고형이다. 아직 심사 중으로 바뀌지 않았다 */}
              <FieldHelp id={`${fieldId("license")}-help`}>
                다시 올리면 상태가 심사 중으로 바뀌고, 영업일 1~2일 안에 결과를
                알려드려요.
              </FieldHelp>
            </FormField>
          </AuthSection>

          <AuthSection>
            <Notice>
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <b className="font-medium">왜 거절되나요?</b>
                  <br />
                  도매 가격은 사업자에게만 공개돼요. 사업자 확인이 안 되면
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

          {/* 몇 번 눌러야 하는지 화면이 말해 준다 — 넘어간 뒤 되돌아와 또 누르는 걸 막는다 */}
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
