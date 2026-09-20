"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import type { RetailerResponse } from "@/shared/api/types";

/**
 * 소매 서버의 세션 인증을 부르는 곳. **여기가 유일한 창구다.**
 *
 * 토큰이 없다 — 서버가 `SESSION_RETAIL` 쿠키(HttpOnly)를 심고, 이후 요청에는
 * 브라우저가 알아서 붙인다. 서버 컴포넌트 쪽은 `shared/api/server.ts`가
 * 같은 쿠키를 `/me`에 넘겨 세션을 확인한다.
 */
const AUTH_PATH = {
  login: "/api/retail/auth/login",
  logout: "/api/retail/auth/logout",
} as const;

/** 성공하면 세션 쿠키가 붙고 계정 정보가 온다. **미승인 계정도 성공(200)이다.** */
function login(input: {
  email: string;
  password: string;
}): Promise<RetailerResponse> {
  return apiFetch<RetailerResponse>(AUTH_PATH.login, {
    method: "POST",
    body: input,
  });
}

/** 세션이 없거나 만료됐어도 204다 — 실패를 따로 다룰 게 없다. */
async function logout(): Promise<void> {
  await apiFetch<void>(AUTH_PATH.logout, { method: "POST" });
}

export function useLoginMutation() {
  return useMutation({ mutationFn: login });
}

export function useLogoutMutation() {
  return useMutation({ mutationFn: logout });
}

/**
 * 자격증명이 틀린 실패인가.
 *
 * 서버는 이메일이 없는 것과 비밀번호가 틀린 것을 구분하지 않는다(계정 열거 방지).
 * 그래서 이 하나로 갈리고, 나머지는 전부 "서버에 닿지 못했다"쪽이다.
 */
export function isCredentialFailure(error: unknown): boolean {
  return (
    isApiError(error) && error.code === RETAIL_ERROR_CODE.INVALID_CREDENTIALS
  );
}
