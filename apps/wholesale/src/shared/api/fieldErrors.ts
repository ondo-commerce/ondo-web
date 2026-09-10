import { isApiError, type FieldError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "./errorCodes";

/**
 * 폼 칸별 오류 + 칸에 못 붙이는 오류(`_form`).
 *
 * 각 feature의 `FieldErrors<K>`(`Partial<Record<K, string>>`)와 모양이 같아서
 * `setErrors`에 그대로 넣을 수 있다. `_form`만 하나 더 있다.
 *
 * 소매 `shared/api/fieldErrors.ts`와 **같은 이름·같은 계약**이다(앱 간 직접
 * import가 막혀 있어 복제). 다른 점은 에러 코드 상수뿐이다.
 */
export type FormErrors<K extends string> = Partial<Record<K | "_form", string>>;

/**
 * 같은 칸에 오류가 여러 개 왔을 때 이기는 `code`. 앞이 이긴다.
 *
 * 빈 칸에 형식 오류가 붙으면 사장은 뭘 잘못 썼는지부터 찾는다 — "비어 있음"이 먼저다.
 * 도매 서버는 아직 칸 단위 `code`를 안 준다(2026-09-10 dev: `{ field, reason }`뿐) —
 * 그래서 지금은 전부 맨 뒤 순위라 서버 순서대로 첫 번째가 붙는다. 소매와 같은
 * 규칙을 두는 건 서버가 `code`를 주기 시작하면 바로 먹게, 그리고 두 파일을 같은
 * 모양으로 유지하려고다(`packages/api` 승격 후보).
 */
const FIELD_ERROR_CODE_PRIORITY: readonly string[] = [
  "NOT_BLANK",
  "NOT_NULL",
  "NOT_EMPTY",
];

/** 작을수록 먼저. 목록에 없거나 `code` 자체가 없으면 맨 뒤 */
function priorityOf(code: string | null): number {
  const index = code === null ? -1 : FIELD_ERROR_CODE_PRIORITY.indexOf(code);
  return index === -1 ? FIELD_ERROR_CODE_PRIORITY.length : index;
}

/** 같은 칸의 두 오류 가운데 칸 아래에 붙일 것. 우선순위가 같으면 먼저 온 쪽 */
function pickFieldError(current: FieldError, next: FieldError): FieldError {
  return priorityOf(next.code) < priorityOf(current.code) ? next : current;
}

/**
 * 칸에 못 붙인 검증 실패를 폼 위에 올릴 때 앞에 세우는 문장.
 *
 * 서버 `errors[].message`는 개발자 문장이다("variantId 또는 (colorId, size) 중 한쪽만
 * 지정한다"). 그것만 덜렁 두면 사장은 무슨 일인지도, 어디를 고칠지도 모른다(dev-verify F4).
 * 그렇다고 서버 문구를 버리면 **아무 단서도 없다** — `describeError`가 코드로 제목을 세우고
 * 서버 문구를 그 아래 보조로 두는 것과 같은 구도로, 사용자 문장이 앞서고 서버 문구가 뒤따른다.
 */
const UNMAPPED_FIELD_LEAD = "저장할 수 없는 값이 있어요.";

/**
 * 서버 필드명을 폼이 아는 칸으로 잇는다. 정확히 같은 이름이 먼저, 없으면 **가장 긴 접두어.**
 *
 * 실서버 이름은 폼 칸과 1:1이 아니다(dev-verify F4, #210):
 * - `listing.variantPrices[0].targetSpecified` — 목록 원소·중첩 속성은 `[i]`·`.`으로 이어진다
 * - `nameWellFormed` — Bean Validation `@AssertTrue isNameWellFormed()`는 속성명이 그대로
 *   필드명이 된다. 칸 이름 뒤에 **대문자로 시작하는 꼬리**가 붙는 꼴이다
 *
 * 그래서 나머지가 `.`·`[`·대문자로 시작할 때만 접두어로 본다. `names`처럼 소문자로 이어지면
 * 다른 속성이다 — `name` 칸에 붙이면 엉뚱한 칸이 빨개진다.
 */
function resolveField<K extends string>(
  field: string,
  fields: readonly K[],
): K | null {
  let best: K | null = null;
  for (const known of fields) {
    if (field === known) return known;
    if (!field.startsWith(known)) continue;
    const rest = field.charAt(known.length);
    const continues = rest === "." || rest === "[" || /[A-Z]/.test(rest);
    if (continues && (best === null || known.length > best.length)) {
      best = known;
    }
  }
  return best;
}

/**
 * 서버 `VALIDATION_FAILED`의 `errors[]`를 폼 오류로 옮긴다.
 *
 * 검증 실패가 **아니면 `null`** — 호출부가 그때는 배너·경계 등 다른 길로 보내야
 * 해서다. 빈 객체를 주면 "검증은 통과했다"로 읽힌다.
 *
 * 필드명은 `resolveField`로 칸에 잇는다 — 같은 이름이거나 칸 이름을 접두어로 갖는 것.
 * 그래도 못 이은 이름은 버리지 않고 `_form`에 모은다. 서버가 프론트가 모르는 칸
 * (예: 서버에서만 계산하는 값)을 지적했을 때 사장이 아무 말도 못 보는 것보다 폼 위
 * 한 줄이라도 보는 게 낫다. 같은 칸이 여러 번 오면 `FIELD_ERROR_CODE_PRIORITY`로
 * 하나만 고른다 — 칸 아래 한 줄에 둘을 이어 붙이면 읽히지 않는다. `_form`도 같은 문구는
 * 한 번만 — 가격표 행마다 같은 사유가 오면 한 문장이 행 수만큼 이어 붙었다(dev-verify F4).
 */
export function toFieldErrors<K extends string>(
  error: unknown,
  fields: readonly K[],
): FormErrors<K> | null {
  if (
    !isApiError(error) ||
    error.code !== WHOLESALE_ERROR_CODE.VALIDATION_FAILED
  ) {
    return null;
  }

  const picked = new Map<K, FieldError>();
  const orphans = new Set<string>();

  // 도매 서버는 `reason`으로 내리지만 `@ondo/api`가 `message`로 맞춰 준다 — 여기서는 `message`만 읽는다
  for (const item of error.fieldErrors) {
    const key = resolveField(item.field, fields);
    if (key === null) {
      orphans.add(item.message);
      continue;
    }
    const current = picked.get(key);
    picked.set(
      key,
      current === undefined ? item : pickFieldError(current, item),
    );
  }

  const result: FormErrors<K> = {};
  for (const [key, item] of picked) result[key] = item.message;

  if (orphans.size > 0) {
    result._form = `${UNMAPPED_FIELD_LEAD} ${[...orphans].join(" ")}`;
  } else if (error.fieldErrors.length === 0) {
    // 칸 정보 없이 검증 실패만 온 경우. 서버 문구라도 폼 위에 올린다
    result._form = `${UNMAPPED_FIELD_LEAD} ${error.message}`;
  }
  return result;
}
