import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * mutation `meta.sessionLoss`에 이 값이 있으면 401을 받아도 `/login`으로 보내지 않는다.
 * 그 mutation을 부른 화면이 401을 직접 받아 폼을 지킨다(#252 S4-3, 게시글 이미지 업로드).
 *
 * 문자열을 `features/product/api/mutations.ts`가 따로 적는다 — feature는 `app/`을 import할 수
 * 없다(import 방향). 값을 바꾸면 거기도 같이 바꾼다.
 */
export const SESSION_LOSS_INLINE = "inline";

/** 세션이 끊긴 401인가. 403(`NOT_APPROVED`)은 세션은 살아 있어서 아니다 */
export function isSessionLoss(error: unknown): boolean {
  return (
    isApiError(error) && error.code === WHOLESALE_ERROR_CODE.UNAUTHENTICATED
  );
}

/**
 * MutationCache 전용 판정(S4-4). 전역 `onError`는 `mutateAsync`가 reject되기 **전에** 돈다
 * (query-core `Mutation.execute`) — 화면이 401을 받기 전에 전체 이동이 먼저 터져 폼이 날아갔다.
 * 그래서 화면이 직접 받겠다고 표시한 mutation만 여기서 뺀다. QueryCache는 이 판정을 안 거친다.
 */
export function shouldRedirectOnSessionLoss(
  error: unknown,
  meta: Record<string, unknown> | undefined,
): boolean {
  if (!isSessionLoss(error)) return false;
  return meta?.sessionLoss !== SESSION_LOSS_INLINE;
}
