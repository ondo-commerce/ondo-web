import { isApiError } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "./errorCodes";

/**
 * 폼 칸별 오류 + 칸에 못 붙이는 오류(`_form`).
 *
 * 각 feature의 `FieldErrors<K>`(`Partial<Record<K, string>>`)와 모양이 같아서
 * `setErrors`에 그대로 넣을 수 있다. `_form`만 하나 더 있다.
 *
 * 도매 `shared/api/fieldErrors.ts`와 **같은 이름·같은 계약**이다(앱 간 직접
 * import가 막혀 있어 복제). 다른 점은 에러 코드 상수뿐이다.
 */
export type FormErrors<K extends string> = Partial<Record<K | "_form", string>>;

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

  // 스냅샷 `FieldError`는 `{ field, code, message }` — `@ondo/api`가 이 모양으로 맞춰 준다
  for (const { field, message } of error.fieldErrors) {
    if (known.has(field)) {
      const key = field as K;
      if (result[key] === undefined) result[key] = message;
    } else {
      orphans.push(message);
    }
  }

  if (orphans.length > 0) {
    result._form = orphans.join(" ");
  } else if (error.fieldErrors.length === 0) {
    // 칸 정보 없이 검증 실패만 온 경우(예: 파일 파트가 비었을 때). 서버 문구라도 폼 위에 올린다
    result._form = error.message;
  }
  return result;
}
