"use client";

import { Button, cn, FormField, Input, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { AuthFoot, AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import { FieldError, FieldHelp, RequiredLabel } from "./FieldError";
import { FileField } from "./FileField";
import { TermsCheck } from "./TermsCheck";
import { TwoCol } from "./TwoCol";
import {
  ACCOUNT_PATH,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  INVALID_INPUT_CLASS,
  labelId,
  separatorNote,
  SIGNUP_FIELD_ORDER,
  withStoreName,
} from "../constants";
import {
  EMPTY_SIGNUP,
  firstInvalidField,
  normalizePhone,
  normalizeSeparators,
  normalizeStoreName,
  validateSignup,
  visibleErrors,
  type SignupValues,
} from "../derive";
import type { AttachedFile, SignupField } from "../types";

/** 값을 손봤을 때 그 사실을 알리는 줄. 오류가 아니라 통지라서 회색이다 */
type Notes = Partial<Record<"phone" | "bizNo", string>>;

/** 여러 설명을 한 입력에 묶는다. 빈 것은 빼야 존재하지 않는 id를 가리키지 않는다 */
function describedBy(
  ...ids: (string | false | undefined)[]
): string | undefined {
  const list = ids.filter((id): id is string => Boolean(id));
  return list.length > 0 ? list.join(" ") : undefined;
}

export function SignupView() {
  const router = useRouter();
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
    if (field === "phone" || field === "bizNo") {
      setNotes((prev) =>
        prev[field] ? { ...prev, [field]: undefined } : prev,
      );
    }
  };

  /**
   * 칸을 떠날 때 구분자만 하이픈으로 맞춘다.
   *
   * 타이핑 도중에 고치면 커서가 튀고, 아예 안 고치면 `010.1234.5678`이 형식
   * 오류로만 남는다. 바꿨으면 **바뀐 값이 칸에 보이고** 왜 바꿨는지 아래 줄이
   * 말한다 — 조용히 글자를 지우지 않는다.
   *
   * 연락처만 `normalizePhone`이다. 하이픈이 아예 없는 `01012345678`은 자리수로
   * 국번을 갈라 넣어 줘야 통과한다(retail-settings F4). 사업자등록번호는 같은
   * 숫자 10자리라도 3-2-5라 이 처리를 공유할 수 없다.
   */
  const normalizeOnBlur = (field: "phone" | "bizNo") => {
    const raw = values[field];
    const normalized =
      field === "phone" ? normalizePhone(raw) : normalizeSeparators(raw);
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
    /* 보낼 서버가 없다. 신청이 접수된 다음 화면으로 넘기는 데까지가 이번 범위다.
       방금 적은 상호명을 같이 넘긴다 — 안 넘기면 승인 화면이 남의 상호를 말한다 */
    router.push(
      withStoreName(
        ACCOUNT_PATH.approval,
        normalizeStoreName(values.storeName),
      ),
    );
  };

  /** 글자를 받는 칸 한 벌. 7개가 같은 모양이라 여기서 한 번만 그린다 */
  const textField = (
    field: SignupField,
    label: ReactNode,
    options: {
      type?: "text" | "email" | "password" | "tel";
      autoComplete?: string;
      placeholder: string;
      help?: string;
      /** 필수 칸. `*`와 sr-only `(필수)`만이 아니라 속성으로도 전달한다 */
      required?: boolean;
      last?: boolean;
      onBlur?: () => void;
    },
  ) => {
    const error = errors[field];
    const note =
      field === "phone" || field === "bizNo" ? notes[field] : undefined;
    const helpId = options.help ? `${fieldId(field)}-help` : undefined;
    const noteId = note ? `${fieldId(field)}-note` : undefined;

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
          autoComplete={options.autoComplete}
          placeholder={options.placeholder}
          value={String(values[field] ?? "")}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(
            error && errorId(field),
            noteId,
            helpId,
          )}
          onChange={(e) => setField(field, e.target.value)}
          onBlur={options.onBlur}
        />
        {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
        {note ? <FieldHelp id={noteId}>{note}</FieldHelp> : null}
        {options.help ? (
          <FieldHelp id={helpId}>{options.help}</FieldHelp>
        ) : null}
      </FormField>
    );
  };

  return (
    <>
      <AuthPanel
        title="소매 회원가입"
        lead="도매는 서류 3종, 소매는 사업자등록증 1종이면 돼요."
      >
        {/* `*`가 빨강 하나로만 읽히지 않게 뜻을 글자로 한 번 적어 둔다 */}
        <p className="text-muted-foreground mt-1.5 text-xs leading-4.5">
          <span className="text-destructive" aria-hidden>
            *
          </span>{" "}
          표시는 필수 항목이에요.
        </p>

        <form onSubmit={submit} noValidate>
          <AuthSection>
            <TwoCol>
              {textField("storeName", <RequiredLabel>상호명</RequiredLabel>, {
                placeholder: "예: 우리옷가게",
                autoComplete: "organization",
                required: true,
                last: true,
              })}
              {textField("ownerName", <RequiredLabel>대표자명</RequiredLabel>, {
                placeholder: "예: 김봄",
                autoComplete: "name",
                required: true,
                last: true,
              })}
            </TwoCol>

            {textField(
              "email",
              <RequiredLabel>이메일 (로그인 ID)</RequiredLabel>,
              {
                type: "email",
                autoComplete: "email",
                placeholder: "store@example.com",
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

            {textField("phone", <RequiredLabel>연락처</RequiredLabel>, {
              type: "tel",
              autoComplete: "tel",
              placeholder: "010-0000-0000",
              required: true,
              last: true,
              onBlur: () => normalizeOnBlur("phone"),
            })}
          </AuthSection>

          <AuthSection title="사업자 확인">
            {textField("bizNo", "사업자등록번호", {
              placeholder: "000-00-00000",
              help: "형식 검사 후 등록증과 대조해 운영자가 승인해요.",
              onBlur: () => normalizeOnBlur("bizNo"),
            })}

            {/* `htmlFor`를 주지 않는다 — 점선 상자가 이미 이 입력의 `<label for>`라서
                여기까지 라벨이면 칸 이름이 두 글의 이어붙임이 된다. 이름은 이
                `<span>` 하나로 고정하고 입력이 `aria-labelledby`로 가리킨다 */}
            <FormField
              className={cn("mb-0", FIELD_LABEL_CLASS)}
              label={
                <span id={labelId("license")}>
                  <RequiredLabel>사업자등록증</RequiredLabel>
                </span>
              }
            >
              <FileField
                id={fieldId("license")}
                emptyLabel="파일 첨부"
                file={values.license}
                invalid={errors.license !== undefined}
                required
                labelledBy={labelId("license")}
                describedBy={describedBy(
                  errors.license && errorId("license"),
                  `${fieldId("license")}-help`,
                )}
                onSelect={(file) => setField("license", file)}
              />
              {errors.license ? (
                <FieldError id={errorId("license")}>
                  {errors.license}
                </FieldError>
              ) : null}
              {/* RT-05 — 가리지 않고 올리면 실제로 거절 사유가 된다 */}
              <FieldHelp id={`${fieldId("license")}-help`}>
                주민등록번호 뒷자리 등 민감정보는 가려서 올려주세요 — 가리지
                않으면 승인이 거절될 수 있어요.
              </FieldHelp>
            </FormField>
          </AuthSection>

          <AuthSection>
            <Notice>
              <span className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  대표자명 · 연락처 · 사업자등록번호 · 등록증은 암호화해 따로
                  보관해요.
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
            {/* 미동의여도 잠그지 않는다. 누르면 못 채운 자리로 데려간다 */}
            <Button type="submit" size="lg" className="w-full">
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

      <AuthFoot>
        가입하기를 누르면 승인 대기 화면으로 넘어가고, 승인되면 이메일로
        알려드려요 (ST-303 운영자 승인제)
      </AuthFoot>
    </>
  );
}
