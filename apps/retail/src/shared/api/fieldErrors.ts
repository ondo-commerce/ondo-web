import { isApiError, type ApiError } from "@ondo/api";
import type { RetailSchema } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "./errorCodes";

/**
 * 폼 칸별 오류 + 칸에 못 붙이는 오류(`_form`).
 *
 * 각 feature의 `FieldErrors<K>`(`Partial<Record<K, string>>`)와 모양이 같아서
 * `setErrors`에 그대로 넣을 수 있다. `_form`만 하나 더 있다.
 *
 * 도매 `shared/api/fieldErrors.ts`와 **같은 이름·같은 계약**이다(앱 간 직접
 * import가 막혀 있어 복제). 다른 점은 아래 `RetailFieldError` 하나다.
 */
export type FormErrors<K extends string> = Partial<Record<K | "_form", string>>;

/**
 * 소매 스냅샷의 `FieldError` — `{ field, code, message }`.
 *
 * `@ondo/api`의 `ApiError.fieldErrors`는 `{ field, reason }`으로 선언돼 있는데
 * 소매 서버가 실제로 내리는 키는 `message`다(스냅샷 `components.schemas.FieldError`).
 * 타입만 믿고 `reason`을 읽으면 전부 `undefined`가 된다. 그래서 여기서는 항목을
 * 스냅샷 모양으로 다시 확인해 읽는다 — 단언(`as`)이 아니라 검사다.
 */
type RetailFieldError = RetailSchema<"FieldError">;

function isRetailFieldError(value: unknown): value is RetailFieldError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.field === "string" && typeof candidate.message === "string"
  );
}

function retailFieldErrors(error: ApiError): RetailFieldError[] {
  // `unknown`으로 넓힌 뒤 스냅샷 모양으로 좁힌다 — 선언된 `{ field, reason }`을 거치지 않는다
  const items: readonly unknown[] = error.fieldErrors;
  return items.filter(isRetailFieldError);
}

/**
 * 서버 `VALIDATION_FAILED`의 `errors[]`를 폼 오류로 옮긴다.
 *
 * 검증 실패가 **아니면 `null`** — 호출부가 그때는 배너·경계 등 다른 길로 보내야
 * 해서다. 빈 객체를 주면 "검증은 통과했다"로 읽힌다.
 *
 * `fields`에 없는 이름은 버리지 않고 `_form`에 모은다. 서버가 프론트가 모르는
 * 칸을 지적했을 때 사장이 아무 말도 못 보는 것보다 폼 위 한 줄이라도 보는 게
 * 낫다. 같은 칸이 두 번 오면 첫 번째만 쓴다 — 칸 아래 한 줄에 둘을 이어 붙이면
 * 읽히지 않는다.
 */
export function toFieldErrors<K extends string>(
  error: unknown,
  fields: readonly K[],
): FormErrors<K> | null {
  if (
    !isApiError(error) ||
    error.code !== RETAIL_ERROR_CODE.VALIDATION_FAILED
  ) {
    return null;
  }

  const known = new Set<string>(fields);
  const result: FormErrors<K> = {};
  const orphans: string[] = [];
  const items = retailFieldErrors(error);

  for (const { field, message } of items) {
    if (known.has(field)) {
      const key = field as K;
      if (result[key] === undefined) result[key] = message;
    } else {
      orphans.push(message);
    }
  }

  if (orphans.length > 0) {
    result._form = orphans.join(" ");
  } else if (items.length === 0) {
    // 칸 정보 없이 검증 실패만 온 경우(예: 파일 파트가 비었을 때). 서버 문구라도 폼 위에 올린다
    result._form = error.message;
  }
  return result;
}
