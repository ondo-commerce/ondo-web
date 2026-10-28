import { expect, type Locator, type Page } from "@playwright/test";
import {
  requests,
  type WatchedRequest,
} from "../loop-03-upload-lifecycle/helpers";

export { login } from "../loop-01-upload/helpers";
export { watchRequests } from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-04-chat (#264 #265) 공통.
 *
 * 목은 **페이지 안**(MSW 브라우저 핸들러)에 상태를 둔다 — 전체 이동(`page.goto`)마다 시드로 돌아가고,
 * 손잡이(`/__mock/chat/*`)는 그 문서 안에서 `fetch`로 부른다. 방을 옮기는 건 클라이언트 이동이라 상태가 남는다.
 *
 * 시각: 시드는 2026-10-28 10:00(서울) 기준이다. 목록 시각 형식(오늘 `HH:mm`, 올해 `M/D`)이 실행 날짜에
 * 흔들리지 않게 `installClock`으로 시계를 고정해 시작한다. 시계는 흐른다 — 멈추는 건 간격을 재는 테스트만.
 */

/** 서울 2026-10-28(수) 10:30 */
export const SEED_NOW = new Date("2026-10-28T10:30:00+09:00");

export async function installClock(page: Page, time: Date = SEED_NOW) {
  await page.clock.install({ time });
}

/** `/__mock/chat/*` 손잡이. 페이지가 떠 있어야 한다(목이 그 안에 있다) */
export async function mock(
  page: Page,
  path: string,
  body: Record<string, unknown> = {},
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
  expect(status, `손잡이 ${path}`).toBeLessThan(300);
}

/** 소매 메시지 주입. `count`면 `본문 1`, `본문 2` … */
export function incoming(
  page: Page,
  roomId: number,
  body: string,
  count = 1,
): Promise<void> {
  return mock(page, `rooms/${roomId}/incoming`, { body, count });
}

/** `/chats` 진입. 목록 첫 행이 뜰 때까지 기다린다 */
export async function openChats(page: Page, roomId?: number): Promise<void> {
  await page.goto(roomId === undefined ? "/chats" : `/chats?room=${roomId}`);
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
}

export function roomList(page: Page): Locator {
  return page.getByRole("list", { name: "대화 목록", exact: true });
}

/** 목록 행. 행 이름은 "봄봄상회 09:30 미리보기 …"라 이름 + 공백으로 시작하는 것을 정확히 잡는다 */
export function row(page: Page, name: string): Locator {
  return roomList(page).getByRole("link", {
    name: new RegExp(`^${name} `),
  });
}

export function log(page: Page): Locator {
  return page.getByRole("log", { name: "대화", exact: true });
}

export function composer(page: Page): Locator {
  return page.getByRole("textbox", { name: "메시지", exact: true });
}

/** 방의 메시지 말풍선(구분선, 시스템 줄 제외). 순서는 화면 순서 */
export function bubbles(page: Page): Locator {
  return log(page).locator("[data-sequence]");
}

/** 화면에 그린 sequence 목록 */
export async function drawnSequences(page: Page): Promise<number[]> {
  return bubbles(page).evaluateAll((nodes) =>
    nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
  );
}

export const MESSAGES_GET = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+\/messages(\?|$)/,
  method: "GET",
} as const;
export const ROOMS_GET = {
  path: /\/api\/wholesale\/chat\/rooms(\?|$)/,
  method: "GET",
} as const;
export const READ_POST = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+\/read$/,
  method: "POST",
} as const;
export const SEND_POST = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+\/messages$/,
  method: "POST",
} as const;

export function messageGets(page: Page): Promise<WatchedRequest[]> {
  return requests(page, MESSAGES_GET);
}

export async function count(
  page: Page,
  filter: { path: RegExp; method?: string },
): Promise<number> {
  return (await requests(page, filter)).length;
}

/** 요청이 n건이 될 때까지(그 이상 아님) */
export async function waitCount(
  page: Page,
  filter: { path: RegExp; method?: string },
  n: number,
): Promise<void> {
  await expect.poll(() => count(page, filter)).toBe(n);
}

/** 마지막으로 나간 요청들이 응답까지 받았다 */
export async function settled(
  page: Page,
  filter: { path: RegExp; method?: string },
): Promise<void> {
  await expect
    .poll(async () =>
      (await requests(page, filter)).every((r) => r.status !== null),
    )
    .toBe(true);
}

/** 탭 숨김/보임. Playwright 엔 탭 전환이 없어 visibilityState 를 바꾸고 이벤트를 보낸다(TanStack focusManager 가 듣는다) */
export async function setVisibility(
  page: Page,
  state: "hidden" | "visible",
): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => s,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => s === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  }, state);
}

interface Hold {
  pattern: string | null;
  waiting: (() => void)[];
}

/**
 * 응답 보류(리뷰 F6). `page.goto` 전에 부른다. `holdNext`로 고른 GET 하나는 **서버 응답을 받은 뒤**
 * 화면에 넘기지 않고 붙잡아 둔다 — "읽기 전에 떠난 목록 요청이 읽음 뒤에 도착"하는 늦은 응답을 만든다.
 * 목은 페이지 안(MSW)이라 Playwright route 로는 못 잡아 fetch 를 감싼다.
 */
export async function installHold(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const hold: Hold = { pattern: null, waiting: [] };
    (window as unknown as { __hold: Hold }).__hold = hold;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const response = await original(input, init);
      if (
        hold.pattern !== null &&
        (init?.method ?? "GET").toUpperCase() === "GET" &&
        new RegExp(hold.pattern).test(url)
      ) {
        hold.pattern = null;
        await new Promise<void>((resolve) => hold.waiting.push(resolve));
      }
      return response;
    };
  });
}

export async function holdNext(page: Page, pattern: RegExp): Promise<void> {
  await page.evaluate((p) => {
    (window as unknown as { __hold: Hold }).__hold.pattern = p;
  }, pattern.source);
}

export function heldCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __hold: Hold }).__hold.waiting.length,
  );
}

export async function releaseHeld(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hold = (window as unknown as { __hold: Hold }).__hold;
    for (const resolve of hold.waiting.splice(0)) resolve();
  });
}

/** 전체 이동으로 `/login` 에 간 횟수. 0 이어야 쓰던 글이 산다(D28) */
export function countLoginNavigations(page: Page): () => number {
  let n = 0;
  page.on("framenavigated", (frame) => {
    if (
      frame === page.mainFrame() &&
      new URL(frame.url()).pathname === "/login"
    )
      n += 1;
  });
  return () => n;
}
