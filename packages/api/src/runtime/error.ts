/** 서버가 필드 단위로 알려주는 상세. 폼의 `setError`에 그대로 넘길 수 있게 이름을 맞췄다. */
export interface FieldError {
  field: string;
  reason: string;
}

/**
 * 서버까지 못 갔거나, 갔지만 약속한 모양이 아닐 때 쓰는 코드.
 *
 * 서버가 내려주는 코드와 섞이지 않게 여기서만 정의한다.
 */
export const TRANSPORT_ERROR_CODE = {
  NETWORK: "NETWORK_ERROR",
  PARSE: "PARSE_ERROR",
} as const;

/**
 * 모든 API 실패를 하나로 정규화한 에러.
 *
 * **화면 분기는 `code`로만 한다.** `message`는 서버 문구라 바뀔 수 있고, 문자열로
 * 분기한 코드는 그때 조용히 죽는다.
 *
 * 코드 **값**의 목록은 여기 두지 않는다 — 서버마다 어휘가 다르다(미승인이 도매는
 * `NOT_APPROVED`, 소매는 `ACCOUNT_NOT_APPROVED`). 목록은 앱별 상수 파일이 갖는다.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: readonly FieldError[];
  /** 서버 로그와 대조할 때 쓴다. 서버까지 못 간 실패면 null이다. */
  readonly traceId: string | null;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    fieldErrors?: readonly FieldError[];
    traceId?: string | null;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.fieldErrors = params.fieldErrors ?? [];
    this.traceId = params.traceId ?? null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
