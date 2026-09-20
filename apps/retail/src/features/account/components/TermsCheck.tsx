"use client";

import { Checkbox } from "@ondo/ui";
import { errorId, fieldId, SIGNUP_TERMS } from "../constants";
import { FieldError } from "./FieldError";
import { TermsDialog } from "./TermsDialog";
import type { TermsKind } from "../types";

/**
 * 약관 동의 한 줄 = 체크 + 이름 + `전문 보기`.
 *
 * 전문 모달은 `TermsDialog`가 그린다 — 설정 화면의 동의 내역도 같은 것을 띄운다.
 *
 * 체크 상자는 `packages/ui`의 `Checkbox`를 그대로 쓴다. 확정 와이어프레임의
 * `.check .box`는 18px·반경 5px·짙은 채움인데, 반경 5px는 이 시스템의 반경
 * 5단계에 없는 값이라 호출부에서 흉내 내면 18px 상자가 동그라미로 읽힌다.
 * 크기 차이는 `02-fe.md`에 부채로 남기고 컴포넌트는 고치지 않는다(읽기 전용).
 */
export function TermsCheck({
  kind,
  checked,
  error,
  onChange,
}: {
  kind: TermsKind;
  checked: boolean;
  error?: string;
  onChange: (next: boolean) => void;
}) {
  const field = kind === "service" ? "agreeService" : "agreePrivacy";
  const terms = SIGNUP_TERMS[kind];

  return (
    <div>
      <div className="flex items-center gap-2 text-body">
        <Checkbox
          id={fieldId(field)}
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
              className="text-muted-foreground ml-auto cursor-pointer underline underline-offset-4"
            >
              전문 보기
            </button>
          }
        />
      </div>

      {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
    </div>
  );
}
