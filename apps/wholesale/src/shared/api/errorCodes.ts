/**
 * 도매 서버가 내려주는 에러 코드.
 *
 * 스펙(OpenAPI)에는 안 담기는 값이라 손으로 옮긴다 — 서버는 이걸 `@Operation` 설명에만
 * 적어 둔다. 그래서 코드젠이 대신 만들어 줄 수 없고, 여기가 유일한 목록이다.
 *
 * **소매와 어휘가 다르다** — 미승인이 도매는 `NOT_APPROVED`, 소매는 `ACCOUNT_NOT_APPROVED`다.
 * 그래서 `@ondo/api`가 아니라 이 앱 안에 둔다.
 */
export const WHOLESALE_ERROR_CODE = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  NOT_APPROVED: "NOT_APPROVED",
  ACCESS_DENIED: "ACCESS_DENIED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // 가입 — 형식이 아니라 정책을 어겼을 때. 화면에서 각각 다르게 안내해야 해서 코드가 따로 있다
  EMAIL_DUPLICATED: "EMAIL_DUPLICATED",
  BIZ_REG_NO_DUPLICATED: "BIZ_REG_NO_DUPLICATED",
  PASSWORD_POLICY_VIOLATED: "PASSWORD_POLICY_VIOLATED",
  REQUIRED_CONSENT_MISSING: "REQUIRED_CONSENT_MISSING",
  REQUIRED_DOCUMENT_MISSING: "REQUIRED_DOCUMENT_MISSING",

  // 로그인 실패는 하나뿐이다 — 이메일 없음과 비밀번호 틀림을 서버가 구분해 주지 않는다(계정 열거 방지)
  LOGIN_FAILED: "LOGIN_FAILED",
} as const;

export type WholesaleErrorCode =
  (typeof WHOLESALE_ERROR_CODE)[keyof typeof WHOLESALE_ERROR_CODE];
