"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch, isApiError, type ApiError } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import type {
  EmailAvailabilityResponse,
  SignUpRequest,
  SignUpResponse,
} from "../types";

/**
 * 가입 신청 두 호출. 로그인·로그아웃은 `session.ts`에 — 세션이 붙는 것과
 * 붙지 않는 것을 파일로 가른다. **가입은 세션을 주지 않는다**(스펙 설명).
 */
const SIGNUP_PATH = {
  signUp: "/api/retail/auth/sign-up",
  emailAvailability: "/api/retail/auth/email-availability",
} as const;

/** 스펙의 파트 이름. 서버 `@RequestPart`와 글자 하나까지 같아야 한다 */
const PART = { payload: "payload", bizLicense: "bizLicense" } as const;

/**
 * multipart로 보낸다 — `payload`(JSON)와 `bizLicense`(파일) 두 파트.
 *
 * JSON 파트를 문자열이 아니라 `application/json` Blob으로 싣는 이유: 문자열로
 * 넣으면 파트에 `Content-Type`이 없어 스프링이 `text/plain`으로 보고 JSON으로
 * 안 읽는다(415). `Content-Type` 헤더는 우리가 안 정한다 — boundary를 브라우저가
 * 붙여야 해서 `apiFetch`가 `FormData`를 그대로 넘긴다.
 */
function signUp(input: {
  payload: SignUpRequest;
  bizLicense: File;
}): Promise<SignUpResponse> {
  const body = new FormData();
  body.append(
    PART.payload,
    new Blob([JSON.stringify(input.payload)], { type: "application/json" }),
  );
  body.append(PART.bizLicense, input.bizLicense, input.bizLicense.name);
  return apiFetch<SignUpResponse>(SIGNUP_PATH.signUp, { method: "POST", body });
}

/** `isAvailable: true`면 아무도 안 쓰는 이메일 */
function emailAvailability(email: string): Promise<EmailAvailabilityResponse> {
  return apiFetch<EmailAvailabilityResponse>(SIGNUP_PATH.emailAvailability, {
    searchParams: { email },
  });
}

export function useSignUpMutation() {
  return useMutation({ mutationFn: signUp });
}

/**
 * 이메일 칸을 떠날 때 부른다. 쿼리가 아니라 뮤테이션인 이유: 캐시할 값이 아니다 —
 * 같은 이메일이 1초 뒤엔 남의 것일 수 있고, 결과는 그 칸의 오류 한 줄로만 쓴다.
 */
export function useEmailAvailabilityMutation() {
  return useMutation({ mutationFn: emailAvailability });
}

/** 제출 시점에 누가 먼저 가입한 경우(409). blur 확인을 통과했어도 올 수 있다 */
export function isDuplicateEmail(error: unknown): boolean {
  return isApiError(error) && error.code === RETAIL_ERROR_CODE.DUPLICATE_EMAIL;
}

/**
 * 파일 자체가 거절된 경우(용량·형식). 서버 문구가 곧 사장에게 할 말이라
 * (`파일은 10MB까지 올릴 수 있어요`) 첨부칸 아래에 그대로 붙인다.
 */
export function isLicenseRejected(error: unknown): error is ApiError {
  return (
    isApiError(error) &&
    (error.code === RETAIL_ERROR_CODE.FILE_TOO_LARGE ||
      error.code === RETAIL_ERROR_CODE.UNSUPPORTED_FILE_TYPE)
  );
}
