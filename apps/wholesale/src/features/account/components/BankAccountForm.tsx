"use client";

import { cn, FormField, Input, Select } from "@ondo/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ACCOUNT_NO_MAX,
  BANK_FIELD_ORDER,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  HOLDER_MAX,
  INVALID_INPUT_CLASS,
  maxLengthNote,
} from "../constants";
import {
  EMPTY_BANK_ACCOUNT,
  firstInvalidField,
  revalidateField,
  toBankAccount,
  validateBankAccount,
  type BankAccountValues,
} from "../derive";
import { BANKS } from "../fixtures";
import type { BankAccount, BankField, FieldErrors } from "../types";
import { FieldError, FieldHelp, RequiredLabel } from "./FieldError";

/**
 * 정산 계좌 3칸 폼. **온보딩과 (앞으로 생길) 계좌 수정 다이얼로그가 같이 쓴다.**
 *
 * 칸을 두 번 적지 않으려고 폼만 떼어 둔다 — 정산 탭의 「내 정산 계좌」 변경
 * 다이얼로그가 별건 이슈로 열릴 때 이걸 그대로 다시 쓴다.
 *
 * **2열이 아니라 1열이다.** Figma 원본(`2334:3485`)은 512px 패널 안 2열이지만
 * 이 카드는 440px이고 칸이 3개뿐이다. 바깥 배치는 화면 사정을 따른다.
 *
 * `메모`와 `주 계좌로 설정`이 없다 — Figma 등록 폼에는 있으나 계좌가 하나뿐인
 * 최초 등록에서는 구분할 대상이 없다. 첫 계좌는 코드에서 자동으로 주 계좌다.
 *
 * ⚠️ **두 번째 칸의 라벨은 `계좌번호`다.** Figma `2334:3485`는 이 자리를
 *    `은행 선택`으로 중복 표기했는데 오타다 — `2334:2721`(계좌 수정)의 같은
 *    자리가 `계좌번호`이고 값도 `110-482-948102`다. 첫 칸과 둘째 칸이 같은
 *    이름이면 무엇을 넣는 칸인지 화면에서 읽을 수 없다.
 */
export function BankAccountForm({
  actions,
  onSubmit,
}: {
  /** 칸 아래 버튼들. 부르는 화면마다 다르다 — 제출 버튼은 `type="submit"`이다 */
  actions: ReactNode;
  onSubmit: (account: BankAccount) => void;
}) {
  const [values, setValues] = useState<BankAccountValues>(EMPTY_BANK_ACCOUNT);
  const [errors, setErrors] = useState<FieldErrors<BankField>>({});

  const setField = (field: BankField, next: string) => {
    const nextValues = { ...values, [field]: next };
    setValues(nextValues);
    setErrors((prev) =>
      revalidateField(prev, validateBankAccount(nextValues), field),
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    /* 다이얼로그 안에서 쓰일 때 부모 폼까지 제출되지 않게 여기서 끊는다 —
       Radix Portal은 body 직속이지만 React 합성 이벤트는 부모 트리로 버블한다
       (`retail-settings` F2). 받는 쪽도 막지만 내는 쪽이 먼저다 */
    event.stopPropagation();

    const found = validateBankAccount(values);
    setErrors(found);

    const first = firstInvalidField(found, BANK_FIELD_ORDER);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    onSubmit(toBankAccount(values));
  };

  return (
    /* noValidate: 브라우저 기본 말풍선이 뜨면 우리 문구가 가려지고 포커스도
       우리가 옮기지 못한다. required 자체는 남겨 화면 낭독기에 전달한다 */
    <form onSubmit={submit} noValidate>
      <FormField
        className={cn("mb-4", FIELD_LABEL_CLASS)}
        label={<RequiredLabel>은행 선택</RequiredLabel>}
        htmlFor={fieldId("bankName")}
      >
        {/* `name`·`required`를 Root에 준다 — Radix가 폼 안에서 숨은 네이티브
            `<select required>`를 같이 그려서, 트리거가 `<button>`이라 달 수 없는
            필수 표시가 실제 HTML에 남는다 */}
        <Select
          name="bankName"
          required
          value={values.bankName || undefined}
          onValueChange={(next) => setField("bankName", next)}
        >
          <Select.Trigger
            id={fieldId("bankName")}
            variant="field"
            className={INVALID_INPUT_CLASS}
            aria-invalid={errors.bankName !== undefined}
            aria-describedby={errors.bankName ? errorId("bankName") : undefined}
          >
            <Select.Value placeholder="은행 선택" />
          </Select.Trigger>
          <Select.Content>
            {BANKS.map((bank) => (
              <Select.Item key={bank} value={bank}>
                {bank}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        {errors.bankName ? (
          <FieldError id={errorId("bankName")}>{errors.bankName}</FieldError>
        ) : null}
      </FormField>

      <FormField
        className={cn("mb-4", FIELD_LABEL_CLASS)}
        label={<RequiredLabel>계좌번호</RequiredLabel>}
        htmlFor={fieldId("accountNo")}
      >
        <Input
          id={fieldId("accountNo")}
          className={INVALID_INPUT_CLASS}
          name="accountNo"
          /* `type="number"`를 쓰지 않는다 — 이유는 `derive.ts`의 형식 상수 주석에
             적어 뒀다. 숫자 키패드만 띄우고 판정은 우리가 한다 */
          type="text"
          inputMode="numeric"
          required
          maxLength={ACCOUNT_NO_MAX}
          autoComplete="off"
          placeholder="- 없이 입력"
          value={values.accountNo}
          aria-invalid={errors.accountNo !== undefined}
          aria-describedby={errors.accountNo ? errorId("accountNo") : undefined}
          onChange={(e) => setField("accountNo", e.target.value)}
        />
        {errors.accountNo ? (
          <FieldError id={errorId("accountNo")}>{errors.accountNo}</FieldError>
        ) : null}
        {values.accountNo.length >= ACCOUNT_NO_MAX ? (
          <FieldHelp>{maxLengthNote(ACCOUNT_NO_MAX)}</FieldHelp>
        ) : null}
      </FormField>

      <FormField
        className={cn("mb-0", FIELD_LABEL_CLASS)}
        label={<RequiredLabel>예금주</RequiredLabel>}
        htmlFor={fieldId("holder")}
      >
        <Input
          id={fieldId("holder")}
          className={INVALID_INPUT_CLASS}
          name="holder"
          type="text"
          required
          maxLength={HOLDER_MAX}
          autoComplete="off"
          placeholder="예금주명 입력"
          value={values.holder}
          aria-invalid={errors.holder !== undefined}
          aria-describedby={errors.holder ? errorId("holder") : undefined}
          onChange={(e) => setField("holder", e.target.value)}
        />
        {errors.holder ? (
          <FieldError id={errorId("holder")}>{errors.holder}</FieldError>
        ) : null}
        {values.holder.length >= HOLDER_MAX ? (
          <FieldHelp>{maxLengthNote(HOLDER_MAX)}</FieldHelp>
        ) : null}
        {/* 상호명으로 미리 채우지 않는 이유를 화면이 대신 말한다 */}
        <FieldHelp>
          사업자 통장이면 상호명, 개인 통장이면 대표자 이름이에요.
        </FieldHelp>
      </FormField>

      {actions}
    </form>
  );
}
