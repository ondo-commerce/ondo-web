"use client";

import { Button, cn, Dialog, FormField, Input } from "@ondo/ui";
import { useState, type FormEvent } from "react";
import { FieldError, RequiredLabel } from "./FieldError";
import {
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  FOCUS_RING_CLASS,
  INVALID_INPUT_CLASS,
  PASSWORD_FIELD_ORDER,
} from "../constants";
import {
  EMPTY_PASSWORD,
  firstInvalidField,
  validatePasswordChange,
  visibleErrors,
  type PasswordValues,
} from "../derive";
import type { PasswordField } from "../types";
import { useReturnFocus } from "../useReturnFocus";

/**
 * 비밀번호 변경 — 현재 / 새 / 새 확인 3칸.
 *
 * 확정 와이어프레임은 `변경`이라는 **조작만** 그리고 목적지를 그리지 않았다
 * (`01-pm.md` 가정 A3). 새 라우트를 파지 않고 다이얼로그로 끝내는 이유:
 * 설정 화면에서 상호명·연락처를 고치던 중에 주소가 바뀌면 친 값이 전부
 * 날아간다. 나중에 별도 화면으로 옮겨도 이 화면에서 바뀌는 건 버튼 하나뿐이다.
 *
 * `ComingSoonDialog`("준비 중")로 내지 않았다 — 사양 RT-69가 비밀번호 변경을
 * 이 화면의 기능으로 못박았고, 규칙(8자·확인 일치)은 회원가입에 이미 있어서
 * 지어낼 값이 없다. **다만 저장은 더미**이고 그 사실을 다이얼로그가 말한다.
 *
 * 닫을 때 포커스를 `변경` 버튼으로 되돌리는 일은 `useReturnFocus`가 한다.
 * Radix가 대신 해 줄 자리인데 실측으로는 안 왔다 — 사정은 그 훅에 적었다.
 * 안 되돌리면 닫는 순간 포커스가 `<body>`로 떨어져 키보드 사용자가 화면 맨
 * 위로 튄다(`retail-cart` F3).
 */
export function PasswordChangeDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const focus = useReturnFocus();
  const [values, setValues] = useState<PasswordValues>(EMPTY_PASSWORD);
  /** 이미 한 번 걸린 칸. 여기 들어간 칸만 오류 문구를 띄운다 */
  const [revealed, setRevealed] = useState<PasswordField[]>([]);

  const found = validatePasswordChange(values);
  const errors = visibleErrors(found, revealed);

  /* 열 때마다 빈 칸에서 시작한다. 닫았다 다시 열었는데 아까 친 비밀번호가 남아
     있으면, 공용 단말에서 자리를 뜬 사이 다음 사람이 그대로 본다 */
  const change = (next: boolean) => {
    setOpen(next);
    if (next) focus.remember();
    if (!next) {
      setValues(EMPTY_PASSWORD);
      setRevealed([]);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    /* 이 폼은 Radix Portal을 타고 `<body>` 직속으로 그려지지만, React 합성
       이벤트는 **포털을 넘어 부모 트리로 버블한다.** 그 부모가 설정 화면 계정
       패널의 `<form onSubmit>`이라, 막지 않으면 `변경하기` 한 번에 누른 적 없는
       계정 저장까지 실행됐다 — 저장하지 않은 대표자명·연락처가 세션 보관소에
       커밋되고 다른 화면을 갔다 와도 남았다(retail-settings F2).
       받는 쪽(`SettingsView.submitPanel`)에서도 한 번 더 막지만, 이 다이얼로그가
       어느 폼 안에 놓이든 자기 제출을 밖으로 흘리지 않는 것이 먼저다. */
    event.stopPropagation();

    const invalid = PASSWORD_FIELD_ORDER.filter(
      (field) => found[field] !== undefined,
    );
    setRevealed((prev) => [...new Set([...prev, ...invalid])]);

    const first = firstInvalidField(found, PASSWORD_FIELD_ORDER);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    /* 보낼 서버가 없다. 닫고, 무슨 일이 있었는지는 부모가 설정 화면에 남긴다 —
       다이얼로그가 사라지면서 결과까지 같이 사라지면 눌렀는지 알 수 없다 */
    change(false);
    onChanged();
  };

  const field = (
    name: PasswordField,
    label: string,
    options: { autoComplete: string; placeholder: string; last?: boolean },
  ) => {
    const error = errors[name];

    return (
      <FormField
        className={cn(options.last ? "mb-0" : "mb-4", FIELD_LABEL_CLASS)}
        label={<RequiredLabel>{label}</RequiredLabel>}
        htmlFor={fieldId(name)}
      >
        <Input
          id={fieldId(name)}
          className={cn(INVALID_INPUT_CLASS, FOCUS_RING_CLASS)}
          name={name}
          type="password"
          required
          autoComplete={options.autoComplete}
          placeholder={options.placeholder}
          value={values[name]}
          aria-invalid={error !== undefined}
          aria-describedby={error ? errorId(name) : undefined}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [name]: e.target.value }))
          }
        />
        {error ? <FieldError id={errorId(name)}>{error}</FieldError> : null}
      </FormField>
    );
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          /* `ghost`의 `text-muted-foreground`(gray-500)를 덮는다. 이 버튼은 잠긴
             칸의 **회색 면(gray-100) 위**에 앉아서 4.39:1로 AA에 못 미쳤다 —
             확정 와이어프레임 `_base.css` 472행이 `.f.lock .muted`를 gray-600으로
             이미 보정해 둔 자리다(retail-settings F1). 같은 상자 안 값 글자와
             같은 색이 된다 */
          className={cn(
            "-mr-2 text-body text-secondary-foreground",
            FOCUS_RING_CLASS,
          )}
          aria-label="비밀번호 변경"
        >
          변경
        </Button>
      </Dialog.Trigger>

      <Dialog.Content onCloseAutoFocus={focus.restore}>
        <Dialog.Title>비밀번호 변경</Dialog.Title>
        {/* 더미 경계를 화면이 직접 말한다 — 눌러 놓고 안 바뀐 걸 나중에 알면
            그게 더 나쁜 사고다 */}
        <Dialog.Description>
          아직 서버가 없어 실제로 바뀌지는 않아요. 입력 규칙만 회원가입과 같게
          확인해요.
        </Dialog.Description>

        <form onSubmit={submit} noValidate className="mt-4">
          {field("currentPassword", "현재 비밀번호", {
            autoComplete: "current-password",
            placeholder: "지금 쓰는 비밀번호",
          })}
          {field("newPassword", "새 비밀번호", {
            autoComplete: "new-password",
            placeholder: "8자 이상",
          })}
          {field("newPasswordConfirm", "새 비밀번호 확인", {
            autoComplete: "new-password",
            placeholder: "한 번 더 입력",
            last: true,
          })}

          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="line" className={FOCUS_RING_CLASS}>
                취소
              </Button>
            </Dialog.Close>
            {/* 잠그지 않는다. 안 채우고 눌러도 눌리고, 그때 못 채운 자리로 데려간다 */}
            <Button type="submit" className={FOCUS_RING_CLASS}>
              변경하기
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog>
  );
}
