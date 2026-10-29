import { expect, type Locator, type Page } from "@playwright/test";
import { requests } from "../loop-03-upload-lifecycle/helpers";
import {
  count,
  installClock,
  login,
  settled,
  waitCount,
  watchRequests,
} from "../loop-04-chat/helpers";

export {
  count,
  countLoginNavigations,
  composer,
  installClock,
  login,
  mock as chatMock,
  setVisibility,
  settled,
  waitCount,
  watchRequests,
} from "../loop-04-chat/helpers";
export { requests };

/**
 * loop-05b2-notify-read (#295 S11, #296 S13) 공통.
 *
 * 목은 페이지 안(MSW)이다 — `page.goto`마다 시드로 돌아간다. 손잡이(`/__mock/notifications/*`)는 그 문서 안에서
 * `fetch`로 부른다. 시드 25개(안 읽음 3: 1, 2, 22번째), 첫 incoming 주문은 7006, 알림 id 1026.
 * 시드 시각은 reset 시점 기준 24시간 전부터라 행 시각은 전부 "M/D HH:mm"이다. "방금"은 incoming 것뿐.
 */

export const COUNT_GET = {
  path: /\/api\/wholesale\/notifications\/unread-count$/,
  method: "GET",
} as const;
export const LIST_GET = {
  path: /\/api\/wholesale\/notifications(\?|$)/,
  method: "GET",
} as const;
export const READ_POST = {
  path: /\/api\/wholesale\/notifications\/read$/,
  method: "POST",
} as const;

/** `/__mock/notifications/*` 손잡이. 응답 status 를 단언하고 본문을 돌려준다 */
export async function notify(
  page: Page,
  path: "incoming" | "fail" | "delay" | "reset",
  body: Record<string, unknown> = {},
  expected = path === "incoming" ? 201 : 200,
): Promise<unknown> {
  const { status, json } = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/__mock/notifications/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: await response.json() };
    },
    { path, body },
  );
  expect(status, `알림 손잡이 ${path}`).toBe(expected);
  return json;
}

/** read POST 본문을 쌓는다(`page.goto` 전에). `watchRequests`는 본문을 안 남긴다 */
export async function recordReadBodies(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const bodies: unknown[] = [];
    (window as unknown as { __readBodies: unknown[] }).__readBodies = bodies;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (/\/notifications\/read$/.test(url) && typeof init?.body === "string")
        bodies.push(JSON.parse(init.body));
      return original(input, init);
    };
  });
}

export function readBodies(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () => (window as unknown as { __readBodies: unknown[] }).__readBodies,
  );
}

/**
 * 공통 시작: 요청 감시 + 시계 + 로그인 → 그 화면 → 알림 목 reset 200 단언 → 첫 count 응답까지.
 * 첫 count는 reset 전에 나갔을 수 있지만 시드가 같아 값이 같다.
 */
export async function start(page: Page, path = "/products"): Promise<void> {
  await watchRequests(page);
  await recordReadBodies(page);
  await installClock(page);
  await login(page);
  await page.goto(path);
  /* 셸은 MSW worker 가 뜬 뒤에 그려진다(MockGate). 그 전에 손잡이를 부르면 Next 가 HTML 404 로 받는다 */
  await expect(bell(page)).toBeVisible();
  await notify(page, "reset");
  await waitCount(page, COUNT_GET, 1);
  await settled(page, COUNT_GET);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
}

/** 종. 이름이 숫자를 읽는다("알림, 안 읽음 3개") */
export function bell(page: Page): Locator {
  return page.getByRole("button", { name: /^알림/ });
}

export function chatLink(page: Page): Locator {
  return page.getByRole("banner").getByRole("link", { name: /^채팅/ });
}

export function panel(page: Page): Locator {
  return page.getByRole("dialog", { name: "알림", exact: true });
}

/** 패널 행(`<a>` 또는 모르는 type `<button>`). 화면 순서 */
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

/** 점 있는 행 수 */
export function unreadRows(page: Page): Locator {
  return rows(page).and(panel(page).locator('[data-unread="true"]'));
}

export function markAllButton(page: Page): Locator {
  return panel(page).getByRole("button", {
    name: /^(안 읽은 알림 \d+개 모두 읽음|처리 중)$/,
  });
}

export function moreButton(page: Page): Locator {
  return panel(page).getByRole("button", { name: "더 보기", exact: true });
}

/** 종을 눌러 패널을 열고 첫 장이 그려질 때까지 */
export async function openPanel(page: Page): Promise<void> {
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

/** 시계를 멈춘다. 흐르는 시계에서 "지금"을 읽은 뒤 멈추기까지 시간이 지나 500ms 앞에서 멈춘다 */
export async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 500));
}

/**
 * 멈춘 시계에서 count 한 번이 나가고 응답까지 받도록 민다. TanStack 은 렌더 알림을 setTimeout(0)으로 모아서
 * 응답 뒤 몇 ms 더 민다.
 */
export async function runToNextCount(page: Page, ms: number): Promise<void> {
  const before = await count(page, COUNT_GET);
  await page.clock.runFor(ms);
  await waitCount(page, COUNT_GET, before + 1);
  await settled(page, COUNT_GET);
  await page.clock.runFor(50);
}

/** 멈춘 시계에서 화면이 바뀔 때까지 조금씩 민다 */
export async function flushUntil(
  page: Page,
  check: () => Promise<boolean>,
): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(20);
      return check();
    })
    .toBe(true);
}

/** 우측 주문 카드(첫 패널) */
export function orderCard(page: Page): Locator {
  return page.getByRole("main").locator('[data-ac="S11-5 S11-17"]');
}

/** 펼친 행의 상세. 주문 번호는 소매처마다 따로라 겹쳐서 id 로 본다 */
export function expandedOrder(page: Page, orderId: number): Locator {
  return page.locator(`#order-detail-${orderId}`);
}

/** 히스토리 길이. 행 누름이 push 1번(+ replace)인지 본다 */
export function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}
