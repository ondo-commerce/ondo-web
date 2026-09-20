import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerApi, isApiError, type ServerApi } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "./errorCodes";
import type { RetailerResponse } from "./types";

/** `features/account/constants`의 `ACCOUNT_PATH.login`과 같은 값. shared는 feature를 못 읽는다 */
const LOGIN_PATH = "/login";
/** 같은 이유로 `ACCOUNT_PATH.approval`의 사본. 승인 전 계정이 403을 받으면 여기로 */
export const APPROVAL_PATH = "/approval";
const ME_PATH = "/api/retail/auth/me";

/**
 * 로그인은 됐지만 아직 승인 전인 계정의 요청인가(403 `ACCOUNT_NOT_APPROVED`).
 * `/me`는 미승인 계정에도 200이라 `requireSession`은 통과하고, 그 다음 장바구니 같은
 * 승인 필요 API에서 처음 걸린다 — 각 화면이 이걸로 갈라 승인 대기 화면으로 보낸다.
 */
export function isNotApproved(error: unknown): boolean {
  return (
    isApiError(error) && error.code === RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED
  );
}

/**
 * 없는 자원을 부른 요청인가(404 `RESOURCE_NOT_FOUND`). 상품 상세처럼 주소에 id가
 * 실리는 화면이 이걸로 갈라 `notFound()`로 보낸다 — 빈 상세를 그리지 않는다.
 * dev 실측(2026-09-05): `GET /listings/1` → 404 `{"code":"RESOURCE_NOT_FOUND"}`.
 */
export function isNotFound(error: unknown): boolean {
  return (
    isApiError(error) && error.code === RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND
  );
}

/**
 * 서버 컴포넌트가 API를 부르는 유일한 창구.
 *
 * 요청마다 만든다 — 들어온 요청의 쿠키를 그대로 API로 넘겨야 세션이 이어진다.
 * 모듈 단위로 두면 사장 A의 세션으로 사장 B의 화면을 그린다.
 *
 * `API_ORIGIN`이 없으면 명시적으로 죽는다. 프록시(`next.config.ts`)는 없으면
 * 조용히 안 걸리지만, 서버 fetch가 조용히 실패하면 화면이 빈 채로 나간다.
 */
export async function serverApi(): Promise<ServerApi> {
  // cookies()를 먼저 읽는다. 빌드 때 prerender가 이 함수를 만나면 cookies()가
  // "동적 렌더"로 빠져나가야 하는데, 그 전에 환경변수 검사로 던지면 Next는
  // 그걸 prerender 실패로 보고 빌드를 죽인다(CI에는 API_ORIGIN이 없다).
  const cookie = (await cookies()).toString();
  const origin = process.env.API_ORIGIN;
  if (!origin) {
    throw new Error(
      "API_ORIGIN이 없다. apps/retail/.env.example을 .env.development로 복사한다.",
    );
  }
  return createServerApi({ origin, cookie: cookie === "" ? null : cookie });
}

/**
 * 로그인한 사장만 볼 수 있는 화면의 첫 줄에서 부른다. 세션이 없으면 `/login`으로.
 *
 * `(shop)` 레이아웃이 부르므로 그 아래 화면은 따로 안 불러도 된다 — 대신
 * 레이아웃이 `cookies()`를 읽는 순간 그 그룹 전체가 동적 렌더가 된다.
 *
 * 401만 `/login`으로 보낸다. 나머지(5xx·연결 실패)는 그대로 던져 `error.tsx`가
 * 받는다 — 서버가 아픈데 로그인 화면으로 보내면 사장은 비밀번호를 의심한다.
 */
export async function requireSession(): Promise<RetailerResponse> {
  const api = await serverApi();
  try {
    return await api.fetch<RetailerResponse>(ME_PATH);
  } catch (error) {
    if (isApiError(error) && error.code === RETAIL_ERROR_CODE.UNAUTHORIZED) {
      redirect(LOGIN_PATH);
    }
    throw error;
  }
}
