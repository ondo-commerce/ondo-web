import type { Locator, Page } from "@playwright/test";

/**
 * loop-11-other-tab-notice (#410) 공통 — 로그인 화면 "다른 탭 때문" 안내.
 *
 * 두 탭 도구(`listenSessionBroadcast`, `waitSessionBroadcast`)는 loop-10 helpers에서 import해 쓴다.
 * 여기엔 이번 회차에 새로 생긴 것만 둔다. `addInitScript` 도구는 그 탭의 첫 `goto` 전에 설치한다.
 */

/** 앱 `LOGIN_NOTICE_OTHER_TAB`. 손으로 적는다 — 앱 상수를 가져다 쓰면 문구가 틀려도 같이 틀린다 */
export const OTHER_TAB_NOTICE =
  "다른 탭에서 로그아웃했거나 다른 계정으로 로그인해서 이 탭도 로그아웃했어요. 저장하지 않은 입력은 남지 않아요.";
/** 앱 `LOGIN_FAILED_MESSAGE` */
export const LOGIN_FAILED = "이메일 또는 비밀번호를 다시 확인해 주세요.";
/** `installLoginFailure`가 거절하는 비밀번호. 이 값만 401이다 */
export const WRONG_PASSWORD = "wrong-pw-10";

export function otherTabNotice(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: OTHER_TAB_NOTICE });
}

/** Next 경로 낭독기도 `role="alert"`라 문구로 거른다 */
export function loginFailedBanner(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: LOGIN_FAILED });
}

export function loginHeading(page: Page): Locator {
  return page.getByRole("heading", { name: "도매 사장님 로그인" });
}

/**
 * 로그인 실패(loop-10 기획 §5-4). 공용 목은 비밀번호를 안 보고 늘 성공을 주므로 페이지 `fetch`를 감싼다.
 * `POST …/auth/login` 본문 비밀번호가 `WRONG_PASSWORD`일 때만 목 `fail()`과 같은 모양의 401 `LOGIN_FAILED`
 * 봉투를 돌려주고, 아니면 원래 `fetch`를 부른다. 공용 목은 안 고친다 — 이 감싸기는 이 회차 폴더 안에서 끝난다.
 */
export async function installLoginFailure(page: Page): Promise<void> {
  await page.addInitScript((wrong) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (
        method === "POST" &&
        /\/auth\/login$/.test(new URL(url, window.location.href).pathname) &&
        typeof init?.body === "string"
      ) {
        let password: unknown = null;
        try {
          password = (JSON.parse(init.body) as { password?: unknown }).password;
        } catch {
          /* JSON이 아니면 손대지 않는다 */
        }
        if (password === wrong)
          return new Response(
            JSON.stringify({
              code: "LOGIN_FAILED",
              message: "이메일 또는 비밀번호가 올바르지 않습니다.",
              errors: [],
              traceId: "mock",
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
      }
      return original(input, init);
    };
  }, WRONG_PASSWORD);
}

/** 지금 탭 세션 저장소의 이메일. 저장소가 비었으면 null */
export function sessionEmail(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("ondo.wholesale.session");
    if (raw === null) return null;
    return (JSON.parse(raw) as { email: string | null }).email;
  });
}
