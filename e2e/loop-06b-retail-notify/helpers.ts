import { expect, type Locator, type Page } from "@playwright/test";
import {
  count,
  requests,
  resetMock,
  signIn,
  waitCount,
  watchRequests,
} from "../loop-05a-retail-chat/helpers";
import {
  RETAILERS,
  STUB_ORIGIN,
  type RetailerKey,
} from "../side-02/retail/stub-api";

export * from "../loop-06-backorder-reply/helpers";

/**
 * loop-06b-retail-notify 소매 쪽(#305 S2). `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`, 이름에 `retail`).
 * 06a 도우미(`../loop-06-backorder-reply/helpers.ts`) 위에 종, 패널, 알림 손잡이, 로그인 왕복을 더한다.
 *
 * 시계(기획 §5-4 6): 기준일 R = 시작 때 서울 실제 날짜. Next 서버와 stub은 실제 시계라 브라우저를 거기 맞춘다 —
 * `page.clock`을 R 14:20(+09:00)에 고정하고 그 뒤 reset한다. MSW 시드(reset 시각 상대)와 stub 시드(실제 시계
 * 상대)가 같은 R 위에 선다. spec 끝에 서울 날짜가 R과 다르면(자정 넘김) 실패로 끝낸다(`assertSameDay`).
 *
 * 목은 페이지 안(MSW)이다 — `page.goto`마다 시드로 돌아간다. 손잡이를 건 뒤엔 클라이언트 이동만 한다.
 */

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 서울 날짜 R+n `YYYY-MM-DD`(실제 시계) */
export function seoulPlus(days: number): string {
  return new Date(Date.now() + SEOUL_OFFSET_MS + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 시작 때의 R */
export const R = seoulPlus(0);

/** R 14:20 서울. `page.clock` 기준 */
export const R_1420 = new Date(`${R}T14:20:00+09:00`);

/** 날짜 `YYYY-MM-DD` + n일 */
export function plus(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 알림 본문 날짜 표기 `M/D(요일)`, R과 해가 다르면 `YYYY/M/D(요일)`(목 `dateChangeBody`와 같은 규칙) */
export function fmtEta(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day =
    WEEKDAY[new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
  const md = `${m}/${d}(${day})`;
  return date.slice(0, 4) === R.slice(0, 4) ? md : `${y}/${md}`;
}

/** `/backorders` 표 날짜 표기 `YYYY.MM.DD` */
export const tableDate = (date: string) => date.replaceAll("-", ".");

export function assertSameDay(): void {
  expect(seoulPlus(0), "서울 자정을 넘겼다 — 다시 돌린다").toBe(R);
}

/* --- 요청 ------------------------------------------------------------- */

export const LIST_GET = {
  path: /\/api\/retail\/notifications(\?|$)/,
  method: "GET",
} as const;
export const NREAD_POST = {
  path: /\/api\/retail\/notifications\/read$/,
  method: "POST",
} as const;

/** 알림 read 본문을 쌓는다(`page.goto` 전에). `watchRequests`는 본문을 안 남긴다 */
export async function recordNotificationReads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const bodies: unknown[] = [];
    (window as unknown as { __nreads: unknown[] }).__nreads = bodies;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        /\/api\/retail\/notifications\/read$/.test(url) &&
        typeof init?.body === "string"
      )
        bodies.push(JSON.parse(init.body));
      return original(input, init);
    };
  });
}

export function notificationReads(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () => (window as unknown as { __nreads: unknown[] }).__nreads,
  );
}

/* --- 손잡이 ----------------------------------------------------------- */

async function knobStatus(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<number> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/__mock/notifications/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { path, body },
  );
}

/** 소매 알림 목 손잡이(`/__mock/notifications/*`) */
export async function notifyMock(
  page: Page,
  path: "incoming" | "fail" | "delay" | "reset",
  body: Record<string, unknown> = {},
): Promise<void> {
  expect(await knobStatus(page, path, body), `손잡이 ${path}`).toBe(200);
}

/** 3019(린넨 셋업 자켓 베이지/L) 입고일 변경 주입 */
export function injectEta(page: Page, date: string | null): Promise<void> {
  return notifyMock(page, "incoming", {
    type: "BACKORDER_DATE_CHANGED",
    variantId: 3019,
    expectedInboundDate: date,
  });
}

/** stub 미송 표 그 SKU 날짜(서버가 그리는 `/backorders`) */
export async function stubEta(
  page: Page,
  variantId: number,
  date: string | null,
): Promise<void> {
  const res = await page.request.post(`${STUB_ORIGIN}/__stub/backorders/eta`, {
    data: { variantId, expectedInboundDate: date },
  });
  expect(res.status()).toBe(200);
}

export async function resetStub(page: Page): Promise<void> {
  const res = await page.request.post(`${STUB_ORIGIN}/__stub/reset`);
  expect(res.status()).toBe(200);
}

/* --- 화면 ------------------------------------------------------------- */

/** 헤더 종. 이름이 숫자를 읽는다("알림, 안 읽음 2개") */
export function bell(page: Page): Locator {
  return page.getByRole("banner").getByRole("button", { name: /^알림/ });
}

export function bellBadge(page: Page): Locator {
  return bell(page).locator('[aria-hidden="true"][data-ac~="S2-2"]');
}

export function panel(page: Page): Locator {
  return page.getByRole("dialog", { name: "알림", exact: true });
}

/** 패널 행 전부(`<a>`, 모르는 type `<button>`) */
export function rows(page: Page): Locator {
  return panel(page)
    .getByRole("list", { name: "알림 목록", exact: true })
    .locator("[data-id]");
}

export function rowById(page: Page, id: number): Locator {
  return panel(page).locator(`[data-id="${id}"]`);
}

export async function rowIds(page: Page): Promise<number[]> {
  return rows(page).evaluateAll((nodes) =>
    nodes.map((n) => Number((n as HTMLElement).dataset.id)),
  );
}

/** 안 읽음 점이 있는 행 수 */
export function unreadRows(page: Page): Locator {
  return rows(page).and(page.locator('[data-unread="true"]'));
}

export function markAllButton(page: Page): Locator {
  return panel(page).getByRole("button", { name: /모두 읽음$|^처리 중$/ });
}

export function newerButton(page: Page): Locator {
  return panel(page).getByRole("button", { name: "새 알림 보기", exact: true });
}

export function moreButton(page: Page): Locator {
  return panel(page).getByRole("button", { name: "더 보기", exact: true });
}

/** 패널을 연다. 열자마자 목록 GET이 하나 나간다 */
export async function openPanel(page: Page): Promise<void> {
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
}

/**
 * 공통 시작: 요청 감시 + R 14:20 시계 + 계정 → 그 화면 → 채팅 목, 알림 목, stub reset 200 단언 → count 한 번.
 * `empty`면 알림 0개로. reset 뒤 count를 한 번 더 받아 배지가 그 상태를 말하게 한다.
 */
export async function startNotify(
  page: Page,
  path = "/",
  options: { empty?: boolean; retailer?: RetailerKey } = {},
): Promise<void> {
  await watchRequests(page);
  await recordNotificationReads(page);
  await page.clock.install({ time: R_1420 });
  await signIn(page, options.retailer);
  await page.goto(path);
  await expect(bell(page)).toBeVisible();
  await resetMock(page);
  await notifyMock(page, "reset", options.empty ? { empty: true } : {});
  await resetStub(page);
  await expect.poll(() => count(page, COUNT)).toBeGreaterThan(0);
  await nextCountShown(page);
}

const COUNT = {
  path: /\/api\/retail\/notifications\/unread-count$/,
  method: "GET",
} as const;

/** 흐르는 시계에서 다음 count를 받고 그릴 때까지 */
export async function nextCountShown(page: Page): Promise<void> {
  const before = await count(page, COUNT);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT, before + 1);
  await expect
    .poll(async () =>
      (await requests(page, COUNT)).every((r) => r.status !== null),
    )
    .toBe(true);
}

/* --- 로그인 왕복 ------------------------------------------------------ */

/**
 * 가짜 API엔 로그인, 로그아웃 op가 없다(읽기만). 브라우저 요청을 가로채 같은 모양으로 답한다 — 로그인은 계정 쿠키를
 * 바꾸고 `/me` 모양 응답, 로그아웃은 쿠키를 지우고 204. 화면 쪽 코드(`LoginView`, `AccountChip`)는 그대로 돈다.
 * MSW worker를 지나는 요청이라 page가 아니라 context에 건다(서비스 워커 요청은 context route가 받는다).
 */
export async function routeAuth(page: Page): Promise<void> {
  const context = page.context();
  await context.route("**/api/retail/auth/logout", async (route) => {
    await context.clearCookies({ name: "stub_retailer" });
    await route.fulfill({ status: 204 });
  });
  await context.route("**/api/retail/auth/login", async (route) => {
    const { email } = route.request().postDataJSON() as { email: string };
    const key =
      (Object.keys(RETAILERS) as RetailerKey[]).find(
        (k) => RETAILERS[k].email === email,
      ) ?? "bombom";
    await signIn(page, key);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ...RETAILERS[key],
          appliedAt: "2026-10-01T01:05:00Z",
          approvedAt: "2026-10-02T01:00:00Z",
          rejection: null,
        },
      }),
    });
  });
}

/** 계정 메뉴 → 로그아웃 → `/login` → 그 계정으로 로그인 → 홈. 전부 클라이언트 이동이다 */
export async function logoutThenLogin(
  page: Page,
  key: RetailerKey = "bombom",
): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("이메일").fill(RETAILERS[key].email);
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(bell(page)).toBeVisible();
}
