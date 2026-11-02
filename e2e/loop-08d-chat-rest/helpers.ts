import { expect, type Locator, type Page } from "@playwright/test";

export * from "../loop-08c-chat-history/helpers";

/**
 * loop-08d 채팅 나머지(#344 S2). 도매 spec은 기본 설정 wholesale 프로젝트(3100, MSW), 소매 spec은 `pnpm e2e:stub`.
 *
 * 다른 탭 = 같은 브라우저 문맥의 새 페이지. 쿠키는 하나라 탭 2의 로그인이 탭 1의 세션도 바꾼다(방송으로 전달).
 * 목(MSW)은 탭마다 따로라 손잡이와 응답 기록(`/__mock/chat/log`)은 **탭 1에서** 건다.
 */

/** 목이 돌려준 계획 실패 한 건(`packages/api` `PlannedFailureLog`). 시험이 앱 타입을 가져다 쓰지 않으려고 다시 적는다 */
export interface PlannedFailure {
  op: string;
  page: string | null;
  status: number;
  delayMs: number;
  sentAt: string;
}

/**
 * 목 쪽 응답 기록(S2-4 ②). 브라우저가 그 요청을 취소했어도 목은 지연을 다 기다리고 적는다 —
 * "옛 요청이 늦은 401로 끝났나"를 브라우저 쪽 결과 대신 이걸로 본다
 */
export async function plannedFailures(page: Page): Promise<PlannedFailure[]> {
  return page.evaluate(async () => {
    const r = await fetch("/__mock/chat/log");
    const body = (await r.json()) as { data: PlannedFailure[] };
    return body.data;
  });
}

/** 세션 끊김 줄(도매 `COMPOSER_TEXT.sessionLost`) */
export function lostAlert(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: "로그인이 끊겼어요" });
}

/** 같은 브라우저의 둘째 탭, 로그인 화면까지 */
export async function openSecondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  return tab;
}

/** 보류 말풍선 안 `다시 보내기`, `지우기` */
export function retrySend(pending: Locator): Locator {
  return pending.getByRole("button", { name: /다시 보내기/ });
}

export function removeSend(pending: Locator): Locator {
  return pending.getByRole("button", { name: /지우기/ });
}

/** 입력창이 읽기 전용이 아닌지(쓰기 가능) */
export async function expectWritable(composer: Locator): Promise<void> {
  await expect(composer).not.toHaveAttribute("readonly", "");
}
