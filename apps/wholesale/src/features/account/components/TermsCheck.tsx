"use client";

import { Checkbox } from "@ondo/ui";
import {
  errorId,
  fieldId,
  FOCUS_RING_CLASS,
  INVALID_INPUT_CLASS,
} from "../constants";
import { SIGNUP_TERMS } from "../fixtures";
import { FieldError } from "@/shared/components/FieldError";
import { TermsDialog } from "./TermsDialog";

/**
 * 약관 동의 한 줄 = 체크 + 이름 + `내용 보기`.
 *
 * 확정 와이어프레임 `.check .box`의 반경 5px는 이 시스템의 반경 4단계에 없어
 * 흉내 내지 않는다 — 소매도 같은 판단으로 부채로 남겼고 `packages/ui`는 읽기
 * 전용이다.
 *
 * ⚠️ **오류 테두리는 호출부에서 얹는다.** 빈 폼을 제출하면 12칸 중 이 체크 상자
 *    2개만 정상 칸과 똑같은 회색으로 남아 통과한 칸으로 읽혔다
 *    (`wholesale-account` F4). 글자 칸·선택·첨부와 **같은 상수**를 쓴다.
 */
export function TermsCheck({
  kind,
  checked,
  error,
  onChange,
}: {
  kind: "service" | "privacy";
  checked: boolean;
  error?: string;
  onChange: (next: boolean) => void;
}) {
  const field = kind === "service" ? "agreeService" : "agreePrivacy";
  const terms = SIGNUP_TERMS[kind];

  return (
    <div>
      <div className="text-body flex items-center gap-2">
        <Checkbox
          id={fieldId(field)}
          className={INVALID_INPUT_CLASS}
          checked={checked}
          aria-invalid={error !== undefined}
          aria-describedby={error ? errorId(field) : undefined}
          onCheckedChange={(next) => onChange(next === true)}
        />
        <label htmlFor={fieldId(field)} className="cursor-pointer">
          {terms.label} <span className="text-muted-foreground">(필수)</span>
        </label>

        <TermsDialog
          kind={kind}
          trigger={
            <button
              type="button"
              className={`text-muted-foreground ml-auto cursor-pointer underline underline-offset-4 ${FOCUS_RING_CLASS}`}
            >
              내용 보기
            </button>
          }
        />
      </div>

      {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
    </div>
  );
}
