import { expect, type Locator, type Page } from "@playwright/test";
import { installClock, watchRequests } from "../loop-04-chat/helpers";

export * from "../loop-04-chat/helpers";
export { requests } from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-08-chat-polish 도매 쪽(#312 S2 문의 카드, #269 S3 읽음). 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 목은 페이지 안(MSW)이라 `page.goto`마다 시드로 돌아간다. 그래서 **로그인 화면에서** reset, 손잡이를 걸고
 * 로그인한다 — 로그인 → `/dashboard`는 클라이언트 이동이라 목 상태가 남고, 대시보드 첫 요청부터 그 상태를 본다.
 * 문의 카드는 진입 때 첫 요청 하나뿐이고 다음은 30초 뒤라, 들어간 뒤에 시드를 바꾸면 시계를 30초 넘겨야 한다
 * (S2-1은 11:59:30이라 넘기면 영업일이 바뀐다).
 */

/** `/__mock/chat/*` 손잡이. 응답 상태를 정확히 단언한다(brief 4 "reset 200 단언"). 주입(`incoming`)만 201 */
export async function knob(
  page: Page,
  path: string,
  body: Record<string, unknown> = {},
  expected = path.endsWith("/incoming") ? 201 : 200,
): Promise<void> {
  const status = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/__mock/chat/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { path, body },
  );
  expect(status, `손잡이 ${path}`).toBe(expected);
}

/**
 * 요청 감시 + 시계 고정 → 로그인 화면 → reset(200) → `before`(손잡이) → 로그인 → `/dashboard`.
 * 시계는 흐른다(`install`). 30초 polling은 `page.clock.fastForward`로 당긴다.
 */
export async function startAt(
  page: Page,
  time: Date,
  options: {
    seed?: string;
    before?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
  await watchRequests(page);
  await installClock(page, time);
  await page.goto("/login");
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
  await knob(
    page,
    "reset",
    options.seed === undefined ? {} : { seed: options.seed },
  );
  await options.before?.(page);
  await page.getByLabel("이메일").fill("e2e@ondo.test");
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/dashboard/);
}

/* --- 문의 카드 ------------------------------------------------------- */

export const STATS_GET = {
  path: /\/api\/wholesale\/chat\/inquiry-stats(\?|$)/,
  method: "GET",
} as const;
export const SUMMARY_GET = {
  path: /\/api\/wholesale\/dashboard\/summary(\?|$)/,
  method: "GET",
} as const;
export const ORDERS_GET = {
  path: /\/api\/wholesale\/orders(\?|$)/,
  method: "GET",
} as const;

export function inquiryCard(page: Page): Locator {
  return page.getByRole("region", { name: "문의", exact: true });
}

/** 카드 글 줄(1줄 숫자, 결과, 비율, 의도, 기준). 오류, 로딩 중엔 0개 */
export function cardLines(page: Page): Locator {
  return inquiryCard(page).locator("p[data-ac]");
}

export interface CardNumbers {
  total: number;
  outcome: Record<string, number>;
  intent: Record<string, number>;
}

/** "자동 답 5, 답+확인 1" → {자동 답: 5, 답+확인: 1}. 앞말("판정한 것 중")은 뗀다 */
function parsePairs(line: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of line.replace(/^판정한 것 중\s*/, "").split(", ")) {
    const m = /^(.+) (\d+)$/.exec(part.trim());
    if (m?.[1] !== undefined && m[2] !== undefined) out[m[1]] = Number(m[2]);
  }
  return out;
}

/** 화면에 그려진 숫자를 읽는다(S2-4 "카드 숫자를 읽고"). op 응답이 아니라 화면 글자다 */
export async function readCard(page: Page): Promise<CardNumbers> {
  const lines = await cardLines(page).allTextContents();
  const total = /오늘 소매 메시지 (\d+)건/.exec(lines[0] ?? "")?.[1];
  expect(total, "1줄 숫자").toBeDefined();
  return {
    total: Number(total),
    outcome: parsePairs(lines[1] ?? ""),
    intent: parsePairs(lines[3] ?? ""),
  };
}
