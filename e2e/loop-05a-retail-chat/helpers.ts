import { expect, test, type Locator, type Page } from "@playwright/test";
import { requests } from "../loop-03-upload-lifecycle/helpers";
import {
  RETAILERS,
  STUB_ORIGIN,
  type RetailerKey,
} from "../side-02/retail/stub-api";

export { watchRequests, requests } from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-05a-retail-chat (#284 #285) 공통. `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`).
 *
 * 두 겹이다.
 * - **서버 쪽**(`/me`, 상품 상세, 도매처 홈): 가짜 API(3199, `e2e/side-02/retail/stub-api.ts`).
 *   계정은 쿠키 `stub_retailer`로 고른다
 * - **채팅**: 브라우저 MSW(`packages/api/src/mocks/retail/chat.ts`). 상태가 **페이지 안**에 있어
 *   전체 이동(`page.goto`)마다 시드로 돌아간다. 그래서 방을 새로 만들거나 실패를 걸어 둔 뒤엔
 *   클라이언트 이동(링크, `문의하기`)으로만 옮긴다
 *
 * 목이 안 뜨면 skip이 아니라 **실패**한다(S5-10, side-02 F5) — `resetMock`이 200을 단언한다.
 */

export const ME: RetailerKey = "bombom";

/** 가짜 API와 그걸 보는 retail 서버가 떠 있나. 아니면 실패(skip 아님) */
export function assertStubServers() {
  test.beforeAll(async ({ request, baseURL }) => {
    const stub = await request.get(`${STUB_ORIGIN}/api/retail/auth/me`, {
      failOnStatusCode: false,
    });
    expect(
      stub.status(),
      `가짜 API(${STUB_ORIGIN})가 없다 — pnpm e2e:stub 으로 돌린다`,
    ).toBe(401);
    const page = await request.get(`${baseURL}/settings`, {
      headers: { cookie: "stub_retailer=bombom" },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      page.status() === 200 &&
        (await page.text()).includes(RETAILERS.bombom.shopName),
      `${baseURL} 서버가 API_ORIGIN=${STUB_ORIGIN} 로 떠 있지 않다`,
    ).toBe(true);
  });
}

/** 실서버 세션 쿠키 대신 가짜 API가 읽는 계정 쿠키 */
export async function signIn(page: Page, key: RetailerKey = ME) {
  const url = test.info().project.use.baseURL ?? "http://localhost:3101";
  await page.context().addCookies([{ name: "stub_retailer", value: key, url }]);
}

/** 손잡이 `/__mock/chat/*`. 페이지가 떠 있고 worker가 준비돼 있어야 한다 */
async function mockStatus(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<number> {
  return page.evaluate(
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
}

export async function mock(
  page: Page,
  path: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  expect(await mockStatus(page, path, body), `손잡이 ${path}`).toBeLessThan(
    300,
  );
}

/**
 * 목이 살아 있다는 단언(S5-10). worker가 뜨는 데 시간이 걸려 200이 될 때까지 다시 묻는다.
 * worker가 없으면 이 요청은 Next로 가서 404 — 시간 안에 200이 안 되면 실패한다(skip 아님).
 */
export async function resetMock(page: Page): Promise<void> {
  await expect
    .poll(() => mockStatus(page, "reset", {}), {
      message: "소매 채팅 목(MSW)이 안 떴다 — NEXT_PUBLIC_API_MOCK=1 인지",
    })
    .toBe(200);
}

/** 도매 쪽 메시지 주입(소매 앱에선 sender=WHOLESALER) */
export function incoming(
  page: Page,
  roomId: number,
  body: string,
  extra: { count?: number; kind?: string } = {},
): Promise<void> {
  return mock(page, `rooms/${roomId}/incoming`, { body, ...extra });
}

/** 상품 상세에 들어가 목을 깨운다(입구가 마운트될 때 worker를 시작한다) */
export async function openProduct(page: Page, listingId = 11): Promise<void> {
  await page.goto(`/products/${listingId}`);
  await expect(inquiryButton(page)).toBeVisible();
  await resetMock(page);
}

/** 방에 직접 들어간다(전체 이동 — 목은 시드). 메시지 영역이 뜰 때까지 */
export async function openRoom(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(log(page)).toBeVisible();
  await resetMock(page);
}

/** 화면의 알림 줄. Next 라우트 안내(`#__next-route-announcer__`)도 role=alert라 뺀다 */
export function appAlert(page: Page): Locator {
  return page
    .getByRole("alert")
    .and(page.locator(":not(#__next-route-announcer__)"));
}

export function inquiryButton(page: Page): Locator {
  return page.getByRole("button", { name: "문의하기", exact: true });
}

export function log(page: Page): Locator {
  return page.getByRole("log", { name: "대화", exact: true });
}

export function composer(page: Page): Locator {
  return page.getByRole("textbox", { name: "메시지", exact: true });
}

export function sendButton(page: Page): Locator {
  return page.getByRole("button", { name: "보내기", exact: true });
}

/** 방 메시지 말풍선(구분선, 시스템 줄 제외). 순서는 화면 순서 */
export function bubbles(page: Page): Locator {
  return log(page).locator("[data-sequence]");
}

export async function drawnSequences(page: Page): Promise<number[]> {
  return bubbles(page).evaluateAll((nodes) =>
    nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
  );
}

export const CREATE_POST = {
  path: /\/api\/retail\/chat\/rooms$/,
  method: "POST",
} as const;
export const MESSAGES_GET = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/messages(\?|$)/,
  method: "GET",
} as const;
export const ROOM_GET = {
  path: /\/api\/retail\/chat\/rooms\/\d+$/,
  method: "GET",
} as const;
export const SEND_POST = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/messages$/,
  method: "POST",
} as const;
/** 채팅 요청 전부(손잡이 `/__mock` 제외) */
export const ANY_CHAT = { path: /\/api\/retail\/chat\// } as const;

export async function count(
  page: Page,
  filter: { path: RegExp; method?: string },
): Promise<number> {
  return (await requests(page, filter)).length;
}

export async function waitCount(
  page: Page,
  filter: { path: RegExp; method?: string },
  n: number,
): Promise<void> {
  await expect.poll(() => count(page, filter)).toBe(n);
}

/** 가짜 API가 받은 요청 경로(`METHOD /path`). 채팅이 목에서 끝났는지 본다(S5-12) */
export async function stubRequests(page: Page): Promise<string[]> {
  const response = await page.request.get(`${STUB_ORIGIN}/__stub/requests`);
  const body = (await response.json()) as { data: string[] };
  return body.data;
}

/** 페이지 자체의 세로·가로 스크롤 여유(px). 0이면 스크롤이 없다 */
export function pageOverflow(page: Page): Promise<{ y: number; x: number }> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      y: root.scrollHeight - root.clientHeight,
      x: root.scrollWidth - root.clientWidth,
    };
  });
}

export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) throw new Error("요소가 화면에 없다");
  return b;
}
