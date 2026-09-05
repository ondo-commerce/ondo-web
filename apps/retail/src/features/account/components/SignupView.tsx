"use client";

import { Button, cn, FormField, Input, Notice } from "@ondo/ui";
import { CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { describeError } from "@/shared/api/describeError";
import { toFieldErrors } from "@/shared/api/fieldErrors";
import { AuthFoot, AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import { FieldError, FieldHelp, RequiredLabel } from "./FieldError";
import { FileField } from "./FileField";
import { TermsCheck } from "./TermsCheck";
import { TwoCol } from "./TwoCol";
import { useLoginMutation } from "../api/session";
import {
  isDuplicateEmail,
  isLicenseRejected,
  useEmailAvailabilityMutation,
  useSignUpMutation,
} from "../api/signup";
import {
  ACCOUNT_PATH,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  INVALID_INPUT_CLASS,
  labelId,
  separatorNote,
  SIGNUP_FIELD_ORDER,
  SIGNUP_REQUEST_FIELDS,
} from "../constants";
import {
  EMPTY_SIGNUP,
  firstInvalidField,
  normalizePhone,
  normalizeSeparators,
  signupErrorsFromServer,
  takenEmailError,
  toSignUpRequest,
  validateSignup,
  visibleErrors,
  withServerErrors,
  type SignupValues,
} from "../derive";
import type { AttachedFile, FieldErrors, SignupField } from "../types";

/** 값을 손봤을 때 그 사실을 알리는 줄. 오류가 아니라 통지라서 회색이다 */
type Notes = Partial<Record<"phone" | "bizNo", string>>;

/** 여러 설명을 한 입력에 묶는다. 빈 것은 빼야 존재하지 않는 id를 가리키지 않는다 */
function describedBy(
  ...ids: (string | false | undefined)[]
): string | undefined {
  const list = ids.filter((id): id is string => Boolean(id));
  return list.length > 0 ? list.join(" ") : undefined;
}

/**
 * 회원가입 화면. **소매 서버에 실제로 신청한다** — `POST /auth/sign-up`(multipart).
 *
 * 가입 응답에는 세션이 없다(스펙: 가입 직후는 늘 PENDING이라 그 세션으로 할 게
 * 없다). 그런데 다음 화면(승인 대기)은 `/me`로 그린다. 그래서 신청이 접수되면
 * **방금 친 이메일·비밀번호로 바로 로그인**해 세션을 만들고 `/approval`로 간다.
 * 사장이 비밀번호를 한 번 더 치게 만들지 않으면서 화면 순서(가입 → 승인 대기)를
 * 지키는 유일한 길이다. 그 로그인마저 실패하면 로그인 화면으로 보낸다.
 */
export function SignupView() {
  const router = useRouter();
  const signUpMutation = useSignUpMutation();
  const loginMutation = useLoginMutation();
  const emailMutation = useEmailAvailabilityMutation();
  const [values, setValues] = useState<SignupValues>(EMPTY_SIGNUP);
  /** 이미 한 번 걸린 칸. 여기 들어간 칸만 오류 문구를 띄운다 */
  const [revealed, setRevealed] = useState<SignupField[]>([]);
  const [notes, setNotes] = useState<Notes>({});
  /** 서버가 지적한 칸(`VALIDATION_FAILED`·파일 거절). 그 칸을 고치면 지운다 */
  const [serverErrors, setServerErrors] = useState<FieldErrors<SignupField>>(
    {},
  );
  /** 서버가 "이미 있다"고 한 이메일. 칸 값이 이것과 같을 때만 오류다 */
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  /* 폼 **위** 한 줄. 어느 칸의 문제도 아닌 실패(서버 다운·모르는 칸)는 칸에 못 붙인다 */
  const [banner, setBanner] = useState<string | null>(null);

  const found = validateSignup(values);
  const errors = withServerErrors(visibleErrors(found, revealed), {
    ...serverErrors,
    ...takenEmailError(values.email, takenEmail),
  });
  /* 신청과 뒤따르는 로그인이 한 동작이다. 둘 중 하나라도 도는 동안은 잠근다 */
  const submitting = signUpMutation.isPending || loginMutation.isPending;

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
    /* 서버 오류는 보낸 값에 대한 말이다. 고치기 시작하면 옛말이 된다 */
    setServerErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /**
   * 이메일 칸을 떠날 때 중복을 미리 본다(`GET /auth/email-availability`).
   *
   * 형식부터 틀리면 서버에 물을 게 없다. 확인 자체가 실패하면(서버 다운) 조용히
   * 넘어간다 — 제출 때 409로 한 번 더 걸리고, 그때는 칸에 붙는다. 응답이 돌아올
   * 즈음 사장이 값을 고쳤어도 괜찮다: 판정은 값에 붙어서(`takenEmailError`)
   * 옛 값에 대한 답은 저절로 무시된다.
   */
  const checkEmail = async () => {
    const email = values.email.trim();
    if (!email || found.email !== undefined) return;

    let result;
    try {
      result = await emailMutation.mutateAsync(email);
    } catch {
      return;
    }
    if (!result.isAvailable) setTakenEmail(email);
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

  const focusField = (field: SignupField) => {
    document.getElementById(fieldId(field))?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const invalid = SIGNUP_FIELD_ORDER.filter(
      (field) => found[field] !== undefined,
    );
    /* 한 번 드러난 칸은 계속 드러난 채로 둔다 — 고쳤다가 다시 비우면 그 자리에서 말한다 */
    setRevealed((prev) => [...new Set([...prev, ...invalid])]);

    const first = firstInvalidField(found, SIGNUP_FIELD_ORDER);
    if (first) {
      focusField(first);
      return;
    }
    /* 이미 남의 이메일이라고 확인된 값이면 보내 봐야 409다 */
    if (takenEmailError(values.email, takenEmail).email !== undefined) {
      focusField("email");
      return;
    }
    /* 검증을 통과했으면 첨부가 있다. 타입은 그걸 모르니 한 번 더 좁힌다 */
    const license = values.license;
    if (license === null) {
      focusField("license");
      return;
    }

    setBanner(null);

    try {
      await signUpMutation.mutateAsync({
        payload: toSignUpRequest(values),
        bizLicense: license.file,
      });
    } catch (error) {
      /* 실패해도 입력값을 지우지 않는다. 7칸을 다시 치게 만들면 그게 곧 다음 실패다 */
      if (isDuplicateEmail(error)) {
        setTakenEmail(values.email.trim());
        focusField("email");
        return;
      }
      if (isLicenseRejected(error)) {
        setServerErrors((prev) => ({ ...prev, license: error.message }));
        focusField("license");
        return;
      }
      const fromServer = toFieldErrors(error, SIGNUP_REQUEST_FIELDS);
      if (fromServer) {
        const { _form, ...fields } = signupErrorsFromServer(fromServer);
        setServerErrors(fields);
        if (_form !== undefined) setBanner(_form);
        const firstServer = firstInvalidField(fields, SIGNUP_FIELD_ORDER);
        if (firstServer) focusField(firstServer);
        return;
      }
      setBanner(describeError(error).title);
      return;
    }

    /* 접수됐다. 세션을 만들어야 승인 대기 화면이 `/me`를 읽는다(파일 머리 주석) */
    try {
      await loginMutation.mutateAsync({
        email: values.email.trim(),
        password: values.password,
      });
    } catch {
      router.replace(ACCOUNT_PATH.login);
      return;
    }
    /* `replace`다 — 뒤로 가기로 가입 폼에 돌아오면 이미 접수된 신청을 또 낸다.
       `refresh`는 서버 컴포넌트가 새 쿠키로 `/me`를 읽게 한다 */
    router.replace(ACCOUNT_PATH.approval);
    router.refresh();
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
          {banner ? (
            <AuthSection>
              <Notice role="alert">
                <span className="flex items-start gap-2">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>{banner}</span>
                </span>
              </Notice>
            </AuthSection>
          ) : null}

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
                onBlur: () => void checkEmail(),
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
            {/* 미동의여도 잠그지 않는다. 누르면 못 채운 자리로 데려간다.
                중복 제출은 핸들러가 막고(`submitting`), 기다리는 동안은 글자로 말한다 */}
            <Button type="submit" size="lg" className="w-full">
              {submitting ? "가입 신청 중…" : "가입하기"}
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
