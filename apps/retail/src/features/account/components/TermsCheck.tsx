"use client";

import { Button, Checkbox, Dialog } from "@ondo/ui";
import { errorId, fieldId } from "../constants";
import { SIGNUP_TERMS } from "../fixtures";
import { FieldError } from "./FieldError";

/**
 * 약관 동의 한 줄 = 체크 + 이름 + `전문 보기`.
 *
 * 전문을 별도 화면이 아니라 모달로 띄우는 이유: 가입 도중에 주소가 바뀌면
 * 지금까지 채운 칸이 전부 날아간다. 읽고 닫으면 채우던 자리로 그대로 돌아온다.
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
  kind: "service" | "privacy";
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

        <Dialog>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="text-muted-foreground ml-auto cursor-pointer underline underline-offset-4"
            >
              전문 보기
            </button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>{terms.label}</Dialog.Title>
            <Dialog.Description>
              읽고 닫으면 채우던 자리로 그대로 돌아와요.
            </Dialog.Description>
            {/* 전문이 길어도 모달이 화면 밖으로 자라지 않게 여기서만 흐른다 */}
            <div className="scroll-slim mt-4 max-h-80 space-y-3 overflow-y-auto pr-1 text-body">
              {terms.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button variant="line">닫기</Button>
              </Dialog.Close>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </div>

      {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
    </div>
  );
}
