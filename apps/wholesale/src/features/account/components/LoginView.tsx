"use client";

import { Button, cn, FormField, Input, Notice } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { announceArrival } from "../arrival";
import {
  ACCOUNT_PATH,
  ARRIVAL_MESSAGE,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  INVALID_INPUT_CLASS,
  LOGIN_FAILED_MESSAGE,
  LOGIN_FIELD_ORDER,
} from "../constants";
import {
  demoAccountHint,
  EMPTY_LOGIN,
  firstInvalidField,
  homePathFor,
  revalidateField,
  validateLogin,
  type LoginValues,
} from "../derive";
import { lookupAccount, signIn } from "../store";
import type { FieldErrors, LoginField } from "../types";
import { AuthFoot, AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import { ComingSoonDialog, LinkButton } from "./ComingSoonDialog";
import { FieldError } from "./FieldError";

/**
 * 로그인 화면. 실제 인증이 아니다 — **이메일 문자열 대조뿐이고 비밀번호는 검증하지
 * 않는다.** 그 사실을 감추지 않으려고 개발 환경에서만 더미 계정 목록을 아래에
 * 보여 준다.
 */
export function LoginView() {
  const router = useRouter();
  const [values, setValues] = useState<LoginValues>(EMPTY_LOGIN);
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  /* 폼 **위** 한 줄. 어느 칸이 틀렸는지 말하지 않는 실패는 칸에 붙일 수 없다 */
  const [banner, setBanner] = useState<string | null>(null);

  const setField = (field: LoginField, next: string) => {
    const nextValues = { ...values, [field]: next };
    setValues(nextValues);
    setErrors((prev) =>
      revalidateField(prev, validateLogin(nextValues), field),
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const found = validateLogin(values);
    setErrors(found);

    const first = firstInvalidField(found, LOGIN_FIELD_ORDER);
    if (first) {
      setBanner(null);
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    /* `derive.findAccount`가 아니라 세션까지 보는 쪽을 부른다 — 더미 4건만 보면
     **방금 가입 신청을 마친 이메일로 다시 못 들어온다**(`wholesale-account` F7) */
    const account = lookupAccount(values.email);
    if (!account) {
      /* 실패해도 입력값을 지우지 않는다. 오타 하나 때문에 이메일을 다시 치게
         만들면 그게 곧 다음 실패다 */
      setBanner(LOGIN_FAILED_MESSAGE);
      document.getElementById(fieldId("email"))?.focus();
      return;
    }

    setBanner(null);
    /* 도착지를 세션이 돌려준 값으로 정한다 — 훅으로 읽으면 다음 렌더에나 온다 */
    const signedIn = signIn(account.email);
    const home =
      signedIn.state === "signedIn"
        ? homePathFor(signedIn.account, signedIn.bankPromptSeen)
        : ACCOUNT_PATH.login;

    /* 도착지가 상태마다 갈리므로 방금 정한 주소를 그대로 넘긴다(`arrival.ts`) */
    announceArrival(home, ARRIVAL_MESSAGE.signedIn);
    router.replace(home);
  };

  return (
    <>
      <AuthPanel
        title="도매 사장님 로그인"
        lead="승인을 받은 사업자 계정만 온도 ERP에 들어올 수 있어요."
      >
        {/* noValidate: 브라우저 기본 말풍선이 뜨면 우리 문구가 가려지고 포커스도
            우리가 옮기지 못한다. required 자체는 남겨 화면 낭독기에 전달한다 */}
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
            <FormField
              className={cn("mb-4", FIELD_LABEL_CLASS)}
              label="이메일"
              htmlFor={fieldId("email")}
            >
              <Input
                id={fieldId("email")}
                className={INVALID_INPUT_CLASS}
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="wholesale@example.com"
                value={values.email}
                aria-invalid={errors.email !== undefined}
                aria-describedby={errors.email ? errorId("email") : undefined}
                onChange={(e) => setField("email", e.target.value)}
              />
              {errors.email ? (
                <FieldError id={errorId("email")}>{errors.email}</FieldError>
              ) : null}
            </FormField>

            <FormField
              className={cn("mb-0", FIELD_LABEL_CLASS)}
              label="비밀번호"
              htmlFor={fieldId("password")}
            >
              <Input
                id={fieldId("password")}
                className={INVALID_INPUT_CLASS}
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={values.password}
                aria-invalid={errors.password !== undefined}
                aria-describedby={
                  errors.password ? errorId("password") : undefined
                }
                onChange={(e) => setField("password", e.target.value)}
              />
              {errors.password ? (
                <FieldError id={errorId("password")}>
                  {errors.password}
                </FieldError>
              ) : null}
            </FormField>
          </AuthSection>

          <AuthSection>
            {/* 잠그지 않는다. 못 채운 칸이 있어도 눌리고, 누르면 그 칸으로 간다 —
                잠긴 버튼은 왜 못 누르는지 말하지 않는다 */}
            <Button type="submit" size="lg" className="w-full">
              로그인
            </Button>
          </AuthSection>
        </form>
      </AuthPanel>

      <AuthLinks>
        <ComingSoonDialog
          trigger={<LinkButton>비밀번호 찾기</LinkButton>}
          title="비밀번호 찾기는 준비 중이에요"
          description="아직 만들지 않은 화면이에요. 메일을 보낼 경로가 없어서, 지금은 운영자에게 연락하면 임시 비밀번호를 받을 수 있어요."
        />
        <span aria-hidden>·</span>
        <Link
          href={ACCOUNT_PATH.signup}
          className="text-foreground underline-offset-4 hover:underline"
        >
          회원가입
        </Link>
      </AuthLinks>

      <AuthFoot>
        승인 대기 중인 계정으로 로그인하면 심사 현황 화면이 열려요
      </AuthFoot>

      {/* 어느 이메일이 어느 화면으로 가는지 말해 주지 않으면 네 갈래를 볼 수 없다.

          ⚠️ **개발 환경에서만 그린다.** 더미 계정 목록이 실서비스 화면에 실려
             나가면 안 된다(`retail-account` F6이 정확히 이 줄을 프로덕션 빌드로
             내보냈다). `process.env.NODE_ENV`는 빌드 때 문자열로 박혀서 프로덕션
             번들에서는 이 가지가 통째로 사라진다 */}
      {process.env.NODE_ENV === "production" ? null : (
        <p className="text-muted-foreground mt-3 text-center text-xs leading-4.5">
          화면 확인용 계정 (아직 실제 인증이 없어요 · 비밀번호는 아무 값이나
          통과해요) — {demoAccountHint()}
        </p>
      )}
    </>
  );
}
