"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import type { AccountStatus } from "../types";

/**
 * 도매 서버의 세션 인증을 부르는 곳. **여기가 유일한 창구다.**
 *
 * 토큰이 없다 — 서버가 `SESSION_WHOLESALE` 쿠키(HttpOnly)를 심고, 이후 요청에는
 * 브라우저가 알아서 붙인다. 코드가 할 일은 `credentials: "include"` 하나뿐이고
 * 그건 `apiFetch`가 이미 한다.
 *
 * ⚠️ 서버가 `GET /me` 를 아직 구현하지 않았다. 그래서 새로고침하면 승인 상태를
 * 서버에 다시 물을 방법이 없고, 로그인 응답을 세션 보관소에 적어 두는 것으로
 * 버틴다(`store.signInWithStatus`). `/me` 가 생기면 이 파일 한 곳만 바꾼다.
 */
const AUTH_PATH = {
  login: "/api/wholesale/auth/login",
  logout: "/api/wholesale/auth/logout",
} as const;

/**
 * 로그인 응답.
 *
 * ⚠️ 손으로 적은 응답 타입이다. 원래는 스펙에서 생성한 것을 써야 하지만
 * (ADR-0002), 서버를 띄우지 못해 코드젠 입력(`/v3/api-docs`)이 아직 없다.
 * 스냅샷이 들어오는 즉시 `components["schemas"]["LoginResponse"]` 별칭으로 바꾼다.
 */
interface LoginResponse {
  approvalStatus: AccountStatus;
}

/** 성공하면 세션 쿠키가 붙고 승인 상태가 온다. **미승인 계정도 성공(200)이다.** */
async function login(input: {
  email: string;
  password: string;
}): Promise<AccountStatus> {
  const response = await apiFetch<LoginResponse>(AUTH_PATH.login, {
    method: "POST",
    body: input,
  });
  return response.approvalStatus;
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
  return isApiError(error) && error.code === WHOLESALE_ERROR_CODE.LOGIN_FAILED;
}
