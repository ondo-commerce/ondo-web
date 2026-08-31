"use client";

import { Button, cn, FormField, Input, Notice } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthFoot, AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import { ComingSoonDialog, LinkButton } from "./ComingSoonDialog";
import { FieldError } from "./FieldError";
import {
  ACCOUNT_PATH,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  INVALID_INPUT_CLASS,
  LOGIN_FAILED_MESSAGE,
  LOGIN_FIELD_ORDER,
} from "../constants";
import {
  demoAccountHint,
  findAccount,
  firstInvalidField,
  homePathFor,
  revalidateField,
  validateLogin,
  type LoginValues,
} from "../derive";
import type { FieldErrors, LoginField } from "../types";

const EMPTY: LoginValues = { email: "", password: "" };

export function LoginView() {
  const router = useRouter();
  const [values, setValues] = useState<LoginValues>(EMPTY);
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

    const account = findAccount(values.email);
    if (!account) {
      /* 실패해도 입력값을 지우지 않는다. 오타 하나 때문에 이메일을 다시 치게
         만들면 그게 곧 다음 실패다 */
      setBanner(LOGIN_FAILED_MESSAGE);
      return;
    }

    setBanner(null);
    router.push(homePathFor(account));
  };

  return (
    <>
      <AuthPanel
        title="소매 사장님 로그인"
        lead="사업자 승인을 받은 계정만 도매가를 볼 수 있어요."
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
                placeholder="store@example.com"
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
            {/* 잠그지 않는다. 못 채운 칸이 있어도 눌리고, 누르면 그 칸으로 간다 */}
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
          description="아직 만들지 않은 화면이에요. 지금은 운영자에게 연락하면 임시 비밀번호를 받을 수 있어요."
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

      {/* 백엔드가 없어 이 목록 밖의 이메일은 전부 실패한다. 어느 이메일이 어느
          화면으로 가는지 화면이 말해 주지 않으면 아무도 세 갈래를 볼 수 없다.

          **개발 환경에서만 그린다.** 확정 와이어프레임에 없는 줄이고, 더미 계정
          목록이 실서비스 화면에 실려 나가면 안 된다. `process.env.NODE_ENV`는
          빌드 때 문자열로 박히므로 프로덕션 번들에서는 이 가지가 통째로 사라진다 */}
      {process.env.NODE_ENV === "production" ? null : (
        <p className="text-muted-foreground mt-3 text-center text-xs leading-4.5">
          화면 확인용 계정 (아직 실제 인증이 없어요) — {demoAccountHint()}
        </p>
      )}
    </>
  );
}
