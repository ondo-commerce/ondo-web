"use client";

import { Button, cn, FormField, Input, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ACCOUNT_PATH,
  DOCUMENT_LABEL,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  INVALID_INPUT_CLASS,
  labelId,
  MASKING_HELP,
  MAX_LENGTH,
  maxLengthNote,
  separatorNote,
  SIGNUP_CLOSED_NOTICE,
  SIGNUP_CLOSED_NOTICE_ID,
  SIGNUP_FIELD_ORDER,
} from "../constants";
import {
  EMPTY_SIGNUP,
  firstInvalidField,
  normalizeBusinessNo,
  normalizePhone,
  validateSignup,
  visibleErrors,
  type SignupValues,
} from "../derive";
import type { AttachedFile, DocumentField, SignupField } from "../types";
import { AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import {
  FieldError,
  FieldHelp,
  RequiredLabel,
} from "@/shared/components/FieldError";
import { FileField } from "./FileField";
import { TermsCheck } from "./TermsCheck";
import { TwoCol } from "./TwoCol";

/** 구분자를 손본 사실을 알리는 칸. 오류가 아니라 통지라서 회색이다 */
type NoteField = "phone" | "storePhone" | "bizNo";
type Notes = Partial<Record<NoteField, string>>;

/** 빈 것은 빼야 존재하지 않는 id를 가리키지 않는다 */
function describedBy(
  ...ids: (string | false | undefined)[]
): string | undefined {
  const list = ids.filter((id): id is string => Boolean(id));
  return list.length > 0 ? list.join(" ") : undefined;
}

/**
 * 도매 회원가입. **입력 9칸 + 첨부 2종 = 11개.**
 *
 * 소매(7칸 + 첨부 1종)보다 넓은 560px 카드를 쓰는 이유: 440px에 11개를 넣으면 2열
 * 칸이 각 196px로 좁아져 `매장 대표 전화번호` 같은 긴 라벨이 두 줄로 접힌다.
 * 560px이면 2열이 각 252px로 라벨이 한 줄에 들어간다.
 */
export function SignupView() {
  const [values, setValues] = useState<SignupValues>(EMPTY_SIGNUP);
  /** 이미 한 번 걸린 칸. 여기 들어간 칸만 오류 문구를 띄운다 */
  const [revealed, setRevealed] = useState<SignupField[]>([]);
  const [notes, setNotes] = useState<Notes>({});

  const found = validateSignup(values);
  const errors = visibleErrors(found, revealed);

  const setField = (
    field: SignupField,
    next: string | boolean | AttachedFile | null,
  ) => {
    setValues((prev) => ({ ...prev, [field]: next }) as SignupValues);
    /* 손본 값을 다시 고치면 통지는 역할이 끝난다 */
    setNotes((prev) =>
      prev[field as NoteField]
        ? { ...prev, [field as NoteField]: undefined }
        : prev,
    );
  };

  /**
   * 칸을 떠날 때 구분자만 맞춘다. **타이핑 중에는 손대지 않는다** — 커서가 튄다.
   * 전화번호와 사업자 등록번호가 **다른 함수**를 쓰는 이유는 `derive.ts`에 있다.
   */
  const normalizeOnBlur = (field: NoteField) => {
    const raw = values[field];
    const normalized =
      field === "bizNo" ? normalizeBusinessNo(raw) : normalizePhone(raw);
    if (normalized === raw) return;

    setValues((prev) => ({ ...prev, [field]: normalized }));
    setNotes((prev) => ({ ...prev, [field]: separatorNote(normalized) }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const invalid = SIGNUP_FIELD_ORDER.filter(
      (field) => found[field] !== undefined,
    );
    /* 한 번 드러난 칸은 계속 드러난 채로 둔다 — 고쳤다가 다시 비우면 그 자리에서 말한다 */
    setRevealed((prev) => [...new Set([...prev, ...invalid])]);

    const first = firstInvalidField(found, SIGNUP_FIELD_ORDER);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    /* 여기서 멈춘다. 서류를 올릴 도매 업로드 API가 없어 신청을 보낼 곳이 없다 —
       예전에는 세션에만 "심사 중" 계정을 만들고 심사 화면으로 넘겼는데 서버엔
       아무것도 없었다(`side-02` N3). 버튼이 잠겨 있어 화면에서는 여기까지 오지
       않는다. 업로드 API가 생기면 서버 호출로 다시 연다(D32 Q1-C) */
  };

  /** 글자를 받는 칸 한 벌. 9개가 같은 모양이라 여기서 한 번만 그린다 */
  const textField = (
    field: SignupField,
    label: ReactNode,
    options: {
      type?: "text" | "email" | "password" | "tel";
      autoComplete?: string;
      placeholder: string;
      help?: string;
      maxLength?: number;
      required?: boolean;
      /** 2열 묶음 안이거나 섹션 마지막 칸이면 아래 여백을 지운다 */
      last?: boolean;
      onBlur?: () => void;
    },
  ) => {
    const error = errors[field];
    const value = String(values[field] ?? "");
    const note = notes[field as NoteField];
    const helpId = options.help ? `${fieldId(field)}-help` : undefined;
    const noteId = note ? `${fieldId(field)}-note` : undefined;
    /* 붙여넣기는 `maxLength`에서 조용히 잘려서 그 자리에 이유가 보여야 한다 */
    const capped =
      options.maxLength !== undefined && value.length >= options.maxLength;
    const cappedId = capped ? `${fieldId(field)}-cap` : undefined;

    return (
      <FormField
        className={cn(options.last ? "mb-0" : "mb-4", FIELD_LABEL_CLASS)}
        label={label}
        htmlFor={fieldId(field)}
      >
        <Input
          id={fieldId(field)}
          className={INVALID_INPUT_CLASS}
          name={field}
          type={options.type ?? "text"}
          required={options.required}
          maxLength={options.maxLength}
          autoComplete={options.autoComplete}
          placeholder={options.placeholder}
          value={value}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(
            error && errorId(field),
            noteId,
            cappedId,
            helpId,
          )}
          onChange={(e) => setField(field, e.target.value)}
          onBlur={options.onBlur}
        />
        {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
        {note ? <FieldHelp id={noteId}>{note}</FieldHelp> : null}
        {capped && options.maxLength !== undefined ? (
          <FieldHelp id={cappedId}>
            {maxLengthNote(options.maxLength)}
          </FieldHelp>
        ) : null}
        {options.help ? (
          <FieldHelp id={helpId}>{options.help}</FieldHelp>
        ) : null}
      </FormField>
    );
  };

  /** 첨부칸 한 벌. 등록증과 신분증이 같은 모양이다 */
  const fileField = (field: DocumentField) => (
    <FormField
      className={cn("mb-4 last:mb-0", FIELD_LABEL_CLASS)}
      /* `htmlFor`를 주지 않는다 — 이유는 `FileField` */
      label={
        <span id={labelId(field)}>
          <RequiredLabel>{DOCUMENT_LABEL[field]}</RequiredLabel>
        </span>
      }
    >
      <FileField
        id={fieldId(field)}
        emptyLabel="파일 첨부"
        file={values[field]}
        invalid={errors[field] !== undefined}
        required
        labelledBy={labelId(field)}
        describedBy={describedBy(
          errors[field] && errorId(field),
          `${fieldId(field)}-help`,
        )}
        onSelect={(file) => setField(field, file)}
      />
      {errors[field] ? (
        <FieldError id={errorId(field)}>{errors[field]}</FieldError>
      ) : null}
      {/* 미리 알려 준 이 항목이 실제 거절 사유가 된다 */}
      <FieldHelp id={`${fieldId(field)}-help`}>{MASKING_HELP}</FieldHelp>
    </FormField>
  );

  return (
    <>
      <AuthPanel
        title="도매 회원가입"
        lead="사업자 등록증과 대표자 신분증을 확인한 뒤 승인해 드려요."
      >
        {/* `*`가 빨강 하나로만 읽히지 않게 뜻을 글자로 한 번 적어 둔다 */}
        <p className="text-muted-foreground mt-1.5 text-xs leading-4.5">
          <span className="text-destructive-strong" aria-hidden>
            *
          </span>{" "}
          표시는 필수 항목이에요.
        </p>

        <form
          onSubmit={submit}
          noValidate
          aria-describedby={SIGNUP_CLOSED_NOTICE_ID}
        >
          {/* 버튼을 잠근 이유를 폼 **위**에서 먼저 말한다 — 다 채운 뒤에야 못 낸다는
              걸 알면 칸을 채운 시간이 그대로 버려진다 */}
          <AuthSection>
            <Notice id={SIGNUP_CLOSED_NOTICE_ID} data-ac="S1-2">
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{SIGNUP_CLOSED_NOTICE}</span>
              </span>
            </Notice>
          </AuthSection>

          <AuthSection>
            <TwoCol>
              {textField("storeName", <RequiredLabel>상호명</RequiredLabel>, {
                placeholder: "예: 온도의류",
                autoComplete: "organization",
                maxLength: MAX_LENGTH.storeName,
                required: true,
                last: true,
              })}
              {textField(
                "ownerName",
                <RequiredLabel>대표자 이름</RequiredLabel>,
                {
                  placeholder: "예: 김온도",
                  autoComplete: "name",
                  maxLength: MAX_LENGTH.ownerName,
                  required: true,
                  last: true,
                },
              )}
            </TwoCol>

            {textField(
              "email",
              <RequiredLabel>이메일 (로그인 ID)</RequiredLabel>,
              {
                type: "email",
                autoComplete: "email",
                placeholder: "wholesale@example.com",
                maxLength: MAX_LENGTH.email,
                required: true,
              },
            )}

            <TwoCol>
              {textField("password", <RequiredLabel>비밀번호</RequiredLabel>, {
                type: "password",
                autoComplete: "new-password",
                placeholder: "8자 이상",
                required: true,
                last: true,
              })}
              {textField(
                "passwordConfirm",
                <RequiredLabel>비밀번호 확인</RequiredLabel>,
                {
                  type: "password",
                  autoComplete: "new-password",
                  placeholder: "한 번 더 입력",
                  required: true,
                  last: true,
                },
              )}
            </TwoCol>

            <TwoCol>
              {textField("phone", <RequiredLabel>휴대전화번호</RequiredLabel>, {
                type: "tel",
                autoComplete: "tel",
                placeholder: "010-0000-0000",
                maxLength: MAX_LENGTH.phone,
                required: true,
                last: true,
                onBlur: () => normalizeOnBlur("phone"),
              })}
              {textField("storePhone", "매장 대표 전화번호", {
                type: "tel",
                autoComplete: "tel-national",
                placeholder: "02-0000-0000",
                help: "없으면 비워 두세요.",
                maxLength: MAX_LENGTH.phone,
                last: true,
                onBlur: () => normalizeOnBlur("storePhone"),
              })}
            </TwoCol>
          </AuthSection>

          <AuthSection title="사업자 확인">
            {textField(
              "bizNo",
              <RequiredLabel>사업자 등록번호</RequiredLabel>,
              {
                placeholder: "000-00-00000",
                help: "형식 검사 후 등록증과 대조해 운영자가 승인해요.",
                maxLength: MAX_LENGTH.bizNo,
                required: true,
                onBlur: () => normalizeOnBlur("bizNo"),
              },
            )}

            {textField("address", <RequiredLabel>사업장 주소</RequiredLabel>, {
              placeholder: "예: 청평화패션몰 2층 24호",
              autoComplete: "street-address",
              help: "소매 사장님이 사입하러 찾아올 자리예요.",
              maxLength: MAX_LENGTH.address,
              required: true,
            })}

            {fileField("license")}
            {fileField("idCard")}
          </AuthSection>

          <AuthSection>
            <Notice>
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  대표자 이름 · 연락처 · 사업자 등록번호 · 등록증 · 신분증은
                  암호화해 따로 보관해요.
                </span>
              </span>
            </Notice>
          </AuthSection>

          <AuthSection className="space-y-2.5">
            <TermsCheck
              kind="service"
              checked={values.agreeService}
              error={errors.agreeService}
              onChange={(next) => setField("agreeService", next)}
            />
            <TermsCheck
              kind="privacy"
              checked={values.agreePrivacy}
              error={errors.agreePrivacy}
              onChange={(next) => setField("agreePrivacy", next)}
            />
          </AuthSection>

          <AuthSection>
            {/* 잠근 이유를 버튼 **바로 위**에도 한 번 더 적는다. 폼이 길어 버튼까지
                내려오면 맨 위 안내가 화면 밖이라 회색 버튼만 남았다(04-qa F6).
                낭독기는 버튼 설명(`aria-describedby`)으로 위 안내를 이미 읽으므로
                이 줄은 눈으로 보는 사람 몫이다 — 두 번 읽히지 않게 `aria-hidden` */}
            <p
              aria-hidden
              data-ac="S1-2-near"
              className="text-muted-foreground mb-2 text-center text-xs leading-4.5"
            >
              {SIGNUP_CLOSED_NOTICE}
            </p>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled
              aria-describedby={SIGNUP_CLOSED_NOTICE_ID}
            >
              가입하기
            </Button>
          </AuthSection>
        </form>
      </AuthPanel>

      <AuthLinks>
        <span>이미 계정이 있나요?</span>
        <Link
          href={ACCOUNT_PATH.login}
          className="text-foreground underline-offset-4 hover:underline"
        >
          로그인
        </Link>
      </AuthLinks>
    </>
  );
}
