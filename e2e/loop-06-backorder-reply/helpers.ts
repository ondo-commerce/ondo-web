import { expect, type Locator, type Page } from "@playwright/test";
import {
  count,
  mock,
  requests,
  resetMock,
  signIn,
  waitCount,
  watchRequests,
} from "../loop-05a-retail-chat/helpers";

export * from "../loop-05b-stock-reply/helpers";
export { countLoginNavigations, setVisibility } from "../loop-04-chat/helpers";

/**
 * loop-06-backorder-reply 소매 쪽(#297 S2, #267 S3). `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`).
 * 05a, 05b 공통(`../loop-05b-stock-reply/helpers.ts`) 위에 헤더 채팅 링크, 목록, 읽음 손잡이를 더한다.
 *
 * 시각: 기준 T0 = 2026-10-29 14:20(서울). **reset 전에** `page.clock`을 T0에 고정한다 — 목 시드 날짜가 reset
 * 시각 기준 상대값이라(미송 입고일 T0+7일 = 11월 5일) 실행 날짜에 흔들리지 않는다. 시계는 흐른다. 간격을 재는
 * 테스트만 멈추고 `runFor`로 민다.
 *
 * 목은 페이지 안(MSW)이다 — `page.goto`마다 시드로 돌아간다. 손잡이를 건 뒤엔 클라이언트 이동만 한다.
 */

export const T0 = new Date("2026-10-29T14:20:00+09:00");

export const COUNT_GET = {
  path: /\/api\/retail\/notifications\/unread-count$/,
  method: "GET",
} as const;
export const ROOMS_GET = {
  path: /\/api\/retail\/chat\/rooms(\?|$)/,
  method: "GET",
} as const;
export const READ_POST = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/read$/,
  method: "POST",
} as const;

/** 헤더 채팅 링크. 이름이 숫자를 읽는다("채팅, 안 읽은 메시지 3개") */
export function chatNav(page: Page): Locator {
  return page.getByRole("banner").getByRole("link", { name: /^채팅/ });
}

/** 채팅 링크 이름에서 읽은 안 읽은 수. 배지가 없으면 0 */
export async function navUnread(page: Page): Promise<number> {
  const label = (await chatNav(page).getAttribute("aria-label")) ?? "";
  return Number(/안 읽은 메시지 (\d+)개/.exec(label)?.[1] ?? 0);
}

/** 채팅 링크 안 배지(`aria-hidden` 글자) */
export function navBadge(page: Page): Locator {
  return chatNav(page).locator('[aria-hidden="true"][data-ac~="S2-2"]');
}

/** `/chats` 목록 */
export function roomList(page: Page): Locator {
  return page.getByRole("list", { name: "대화 목록", exact: true });
}

export function roomRow(page: Page, roomId: number): Locator {
  return roomList(page).locator(`a[data-room-id="${roomId}"]`);
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
      if (
        /\/chat\/rooms\/\d+\/read$/.test(url) &&
        typeof init?.body === "string"
      )
        bodies.push(JSON.parse(init.body));
      return original(input, init);
    };
  });
}

export function readBodies(
  page: Page,
): Promise<{ lastReadSequence: number }[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __readBodies: { lastReadSequence: number }[] })
        .__readBodies,
  );
}

/**
 * 공통 시작: 요청 감시 + T0 시계 + 계정 → 그 화면 → 채팅 목 reset 200 단언 → 첫 count 응답까지.
 * 첫 count는 reset 전에 나갔을 수 있지만 시드가 같아 값이 같다.
 */
export async function start(page: Page, path = "/"): Promise<void> {
  await watchRequests(page);
  await recordReadBodies(page);
  await page.clock.install({ time: T0 });
  await signIn(page);
  await page.goto(path);
  await expect(chatNav(page)).toBeVisible();
  await resetMock(page);
  await expect.poll(() => count(page, COUNT_GET)).toBeGreaterThan(0);
  await settled(page, COUNT_GET);
}

/** 그 요청이 전부 응답을 받았나 */
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

/** 시계를 멈춘다. 흐르는 시계에서 "지금"을 읽은 뒤 멈추기까지 시간이 지나 500ms 앞에서 멈춘다 */
export async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 500));
}

/**
 * 멈춘 시계에서 count 한 번이 나가고 응답까지 받도록 민다. TanStack은 렌더 알림을 setTimeout(0)으로 모아서
 * 응답 뒤 조금 더 민다.
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

/** 소매 채팅 목 손잡이(`/__mock/chat/fail` `delay` `reset` …) */
export function chatMock(
  page: Page,
  path: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  return mock(page, path, body);
}
