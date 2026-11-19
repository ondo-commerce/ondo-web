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

/**
 * 오늘 stats GET(인자 없음)만. loop-08f S3부터 카드가 `?from&to` 7일 요청도 보내서, 오늘 요청 수를 세는
 * 08 시험이 7일 요청까지 세지 않게 쿼리 문자열 없는 것만 잡는다. 7일은 08f `WEEK_GET`
 */
export const STATS_GET = {
  path: /\/api\/wholesale\/chat\/inquiry-stats$/,
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

/**
 * 카드 글은 innerText로 읽는다 — 표 칸 사이가 공백으로 바뀌어 화면에 보이는 순서 그대로 비교된다
 * (`오늘 12건 63% 판정 8건 중 5건`). textContent면 칸 글자가 붙어 `오늘12건63%…`이 된다.
 * 정규식에는 공백 정리가 안 걸린다 — 칸 사이는 `\s+`로 쓴다
 */
export const SHOWN = { useInnerText: true } as const;

/** 표의 `오늘` 줄(숫자, 처리율, 판정 내역). 오류, 로딩 중엔 0개 */
export function todayRow(page: Page): Locator {
  return inquiryCard(page)
    .locator("tbody tr")
    .filter({
      has: page.getByRole("rowheader", { name: "오늘", exact: true }),
    });
}

/** `오늘` 줄의 소매 메시지 칸(`12건`) */
export function todayTotal(page: Page): Locator {
  return todayRow(page).locator('td[data-ac~="S2-3"]');
}

/** `오늘 문의 상세`를 펼친다. 결과, 판정 수, 기준 줄은 이 접힌 칸 안에만 있다. 이미 열렸으면 누르지 않는다(다시 누르면 접힌다) */
export async function openDetail(page: Page): Promise<void> {
  const details = inquiryCard(page).locator("details");
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open)))
    await details.locator("summary").click();
}

/** 상세 한 묶음의 칸(`자동 답 5건` …). 펼친 뒤 `SHOWN`으로 읽는다 — 접혀 있으면 innerText가 빈다 */
export function detailRows(
  page: Page,
  title: "처리 결과" | "판정된 문의 유형",
): Locator {
  return inquiryCard(page)
    .locator("details section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .locator("dl > div");
}

/** 기준 줄(`소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준`). 상세 안 맨 끝 */
export function basisLine(page: Page): Locator {
  return inquiryCard(page).locator("details > p");
}

export interface CardText {
  today: string;
  outcomes: string[];
  intents: string[];
  basis: string;
}

/** 카드 전체(오늘 줄, 상세 두 묶음, 기준 줄)를 손 계산 값과 맞춘다. 옛 다섯 줄 비교와 같은 범위다 */
export async function expectCard(page: Page, want: CardText): Promise<void> {
  await expect(todayRow(page)).toHaveText(want.today, SHOWN);
  await openDetail(page);
  await expect(detailRows(page, "처리 결과")).toHaveText(want.outcomes, SHOWN);
  await expect(detailRows(page, "판정된 문의 유형")).toHaveText(
    want.intents,
    SHOWN,
  );
  await expect(basisLine(page)).toHaveText(want.basis);
}

export interface CardNumbers {
  total: number;
  outcome: Record<string, number>;
  intent: Record<string, number>;
}

/** ["자동 답\n5건", …] → {자동 답: 5, …} */
function parsePairs(rows: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const m = /^(.+?)\s+(\d+)건$/.exec(row.trim());
    if (m?.[1] !== undefined && m[2] !== undefined) out[m[1]] = Number(m[2]);
  }
  return out;
}

/** 화면에 그려진 숫자를 읽는다(S2-4 "카드 숫자를 읽고"). op 응답이 아니라 화면 글자다 */
export async function readCard(page: Page): Promise<CardNumbers> {
  await openDetail(page);
  const total = /^(\d+)건$/.exec((await todayTotal(page).innerText()).trim());
  expect(total?.[1], "오늘 소매 메시지 수").toBeDefined();
  return {
    total: Number(total?.[1]),
    outcome: parsePairs(await detailRows(page, "처리 결과").allInnerTexts()),
    intent: parsePairs(
      await detailRows(page, "판정된 문의 유형").allInnerTexts(),
    ),
  };
}
