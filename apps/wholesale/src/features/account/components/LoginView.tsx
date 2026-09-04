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
  DEV_SEED_ACCOUNT,
  LOGIN_FIELD_ORDER,
  SERVER_UNREACHABLE_MESSAGE,
} from "../constants";
import {
  EMPTY_LOGIN,
  firstInvalidField,
  homePathForStatus,
  revalidateField,
  validateLogin,
  type LoginValues,
} from "../derive";
import { isCredentialFailure, useLoginMutation } from "../api/session";
import { signInWithStatus } from "../store";
import type { FieldErrors, LoginField } from "../types";
import { AuthFoot, AuthLinks, AuthPanel, AuthSection } from "./AuthPanel";
import { ComingSoonDialog, LinkButton } from "./ComingSoonDialog";
import { FieldError } from "./FieldError";

/**
 * 로그인 화면. **도매 서버에 실제로 로그인한다** — 성공하면 서버가 `SESSION_WHOLESALE`
 * 쿠키를 심고, 승인 상태에 맞는 화면으로 옮긴다. 미승인 계정도 로그인은 성공하고
 * (서버가 200을 준다) 심사 화면으로 간다.
 *
 * 개발 환경에서만 시드 계정을 아래에 보여 준다.
 */
export function LoginView() {
  const router = useRouter();
  const loginMutation = useLoginMutation();
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginMutation.isPending) return;

    const found = validateLogin(values);
    setErrors(found);

    const first = firstInvalidField(found, LOGIN_FIELD_ORDER);
    if (first) {
      setBanner(null);
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBanner(null);

    let status;
    try {
      status = await loginMutation.mutateAsync(values);
    } catch (error) {
      /* 실패해도 입력값을 지우지 않는다. 오타 하나 때문에 이메일을 다시 치게
         만들면 그게 곧 다음 실패다 */
      setBanner(
        isCredentialFailure(error)
          ? LOGIN_FAILED_MESSAGE
          : SERVER_UNREACHABLE_MESSAGE,
      );
      document.getElementById(fieldId("email"))?.focus();
      return;
    }

    /* 서버가 알려준 상태를 세션에 적어 둔다 — `GET /me`가 없어서 새로고침하면
       다시 물어볼 곳이 없다. 화면들(`ErpGuard`·계정 메뉴)은 이 값을 본다 */
    signInWithStatus(values.email, status);

    /* 도착지가 상태마다 갈리므로 방금 정한 주소를 그대로 넘긴다(`arrival.ts`) */
    const home = homePathForStatus(status);
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
                잠긴 버튼은 왜 못 누르는지 말하지 않는다. 중복 제출은 버튼이
                아니라 핸들러가 막는다(`isPending`). 서버를 실제로 기다리게 된
                뒤로는 글자로 그 사실을 말한다 — 아무 반응이 없으면 또 누른다 */}
            <Button type="submit" size="lg" className="w-full">
              {loginMutation.isPending ? "로그인 중…" : "로그인"}
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
          {process.env.NEXT_PUBLIC_API_MOCK === "1"
            ? "목 모드 (NEXT_PUBLIC_API_MOCK=1) — 아무 값이나 승인 완료로 통과해요"
            : `개발용 시드 계정 (도매 API 서버가 떠 있어야 통해요) — ${DEV_SEED_ACCOUNT}`}
        </p>
      )}
    </>
  );
}
