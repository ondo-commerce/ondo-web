"use client";

import { Checkbox } from "@ondo/ui";
import {
  errorId,
  fieldId,
  FOCUS_RING_CLASS,
  INVALID_INPUT_CLASS,
} from "../constants";
import { SIGNUP_TERMS } from "../fixtures";
import { FieldError } from "./FieldError";
import { TermsDialog } from "./TermsDialog";

/**
 * 약관 동의 한 줄 = 체크 + 이름 + `내용 보기`.
 *
 * 체크 상자는 `packages/ui`의 `Checkbox`를 쓴다. 확정 와이어프레임의
 * `.check .box`는 18px·반경 5px인데, 반경 5px는 이 시스템의 반경 4단계에 없는
 * 값이라 호출부에서 흉내 내면 18px 상자가 동그라미로 읽힌다. 소매도 같은 판단으로
 * 부채로 남겼고 도매도 그 판단을 따른다 — `packages/ui`는 읽기 전용이다.
 *
 * **오류 테두리만은 호출부에서 얹는다.** `aria-invalid`는 붙는데 색이 안 붙어서,
 * 빈 폼을 제출하면 12칸 중 이 체크 상자 2개만 정상 칸과 똑같은 회색으로 남았다 —
 * 10칸은 빨갛고 2칸은 회색이면 그 2칸은 통과한 칸으로 읽힌다
 * (`wholesale-account` F4). 글자 칸·선택·첨부와 **같은 상수**를 쓴다.
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
