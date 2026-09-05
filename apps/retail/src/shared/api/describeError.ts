import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "./errorCodes";

/**
 * 화면이 실패를 **어떻게 그릴지**를 가르는 다섯 종류.
 *
 * 코드 하나하나에 문구를 붙이지 않고 종류로 묶는 이유: 화면이 다르게 반응해야
 * 하는 건 이 다섯뿐이다. `notFound`는 빈 상태로 그리고, `forbidden`은 다시
 * 시도해도 같아서 버튼을 빼고, 나머지는 재시도를 준다.
 *
 * 도매 `shared/api/describeError.ts`와 같은 이름·같은 계약이다. 코드 어휘만
 * 소매 것(`FORBIDDEN`·`ACCOUNT_NOT_APPROVED`)이다.
 */
export type ErrorKind =
  "network" | "notFound" | "forbidden" | "server" | "unknown";

export interface ErrorDescription {
  kind: ErrorKind;
  title: string;
  /** 서버 문구. 코드로 정한 `title` 아래 보조로만 쓴다 — 바뀔 수 있는 값이다 */
  detail: string | null;
  /** 서버 로그와 대조할 때. 서버까지 못 갔으면 null */
  traceId: string | null;
  /** 다시 시도 버튼을 줄지. 같은 답이 올 게 뻔하면 안 준다 */
  retryable: boolean;
}

/**
 * 종류별 사용자 문구. 서버 `message`를 제목으로 쓰지 않는다 —
 * 그건 개발자용 문장이고 사장에게 "요청하신 주소를 찾을 수 없습니다"는 뜻이 없다.
 */
const ERROR_TITLE: Record<ErrorKind, string> = {
  network: "지금 서버에 연결할 수 없어요",
  notFound: "찾는 내용이 없어요",
  forbidden: "볼 수 있는 권한이 없어요",
  server: "서버에서 문제가 생겼어요",
  unknown: "알 수 없는 문제가 생겼어요",
};

/**
 * 던져진 것이 무엇이든 그리기 좋은 모양으로 바꾼다. **`code`로만 가른다** —
 * `message` 문자열로 갈랐다간 서버가 문구를 손보는 순간 조용히 죽는다.
 */
export function describeError(error: unknown): ErrorDescription {
  if (!isApiError(error)) {
    return {
      kind: "unknown",
      title: ERROR_TITLE.unknown,
      detail: error instanceof Error ? error.message : null,
      traceId: null,
      retryable: true,
    };
  }

  const kind = kindOf(error.code, error.status);
  return {
    kind,
    title: ERROR_TITLE[kind],
    // 전송 실패 문구는 래퍼가 만든 것이라 제목과 같은 말이다. 두 번 쓰지 않는다
    detail: kind === "network" ? null : error.message,
    traceId: error.traceId,
    retryable: kind !== "forbidden" && kind !== "notFound",
  };
}

function kindOf(code: string, status: number): ErrorKind {
  switch (code) {
    case TRANSPORT_ERROR_CODE.NETWORK:
      return "network";
    case RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND:
      return "notFound";
    case RETAIL_ERROR_CODE.FORBIDDEN:
    case RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED:
      return "forbidden";
    case RETAIL_ERROR_CODE.INTERNAL_ERROR:
      return "server";
  }
  // 코드 목록에 없는 값 — 상태 코드로 한 번 더 가른다. 모르는 4xx는 서버가
  // "네 요청이 틀렸다"고 한 것이라 다시 보내도 같다
  if (status >= 500) return "server";
  return "unknown";
}
