import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  count,
  log,
  MESSAGES_GET,
  requests,
  waitCount,
} from "../loop-05a-retail-chat/helpers";
import { STUB_ORIGIN } from "../side-02/retail/stub-api";

export * from "../loop-05a-retail-chat/helpers";

/**
 * loop-05b-stock-reply 소매 쪽(#288 S8). `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`).
 * 05a 공통(`../loop-05a-retail-chat/helpers.ts`) 위에 장바구니 가짜 API 손잡이와 카드, 칩 locator를 더한다.
 *
 * 장바구니는 가짜 API(3199) 메모리라 **spec 파일끼리 공유된다**. 테스트마다 쿠키 `stub_cart`로 제 장바구니를
 * 따로 쓰고, `beforeEach`에서 그 장바구니를 비운 응답 200을 단언한다(05a S5-10과 같은 "목이 살아 있다" 단언).
 */

/** 이 테스트의 장바구니 키. 테스트 id라 재시도에도 겹치지 않는다 */
export function cartKey(): string {
  return test.info().testId;
}

export async function useOwnCart(page: Page): Promise<void> {
  const url = test.info().project.use.baseURL ?? "http://localhost:3101";
  await page
    .context()
    .addCookies([{ name: "stub_cart", value: cartKey(), url }]);
  const response = await page.request.post(
    `${STUB_ORIGIN}/__stub/reset?cart=${encodeURIComponent(cartKey())}`,
  );
  expect(response.status(), "가짜 API 장바구니 reset").toBe(200);
}

/** 다음 n번의 담기를 실패시킨다(400, 401, 403, 500) */
export async function failCart(
  page: Page,
  status: number,
  times = 1,
): Promise<void> {
  const response = await page.request.post(
    `${STUB_ORIGIN}/__stub/cart-fail?cart=${encodeURIComponent(cartKey())}`,
    { data: { status, times } },
  );
  expect(response.status()).toBe(200);
}

/** 다음 담기 1번의 응답을 늦춘다 — `담는 중`을 응답 전에 본다(고정 대기 대신 서버가 붙잡는다) */
export async function slowCart(page: Page, ms: number): Promise<void> {
  const response = await page.request.post(
    `${STUB_ORIGIN}/__stub/cart-slow?cart=${encodeURIComponent(cartKey())}`,
    { data: { ms } },
  );
  expect(response.status()).toBe(200);
}

export const CART_POST = {
  path: /\/api\/retail\/cart-items$/,
  method: "POST",
} as const;

/** 헤더 장바구니 링크. 이름이 숫자를 읽는다(`장바구니, 1개 담김`) */
export function cartLink(page: Page, n: number): Locator {
  return page.getByRole("link", { name: `장바구니, ${n}개 담김` });
}

export function askChip(page: Page): Locator {
  return page.getByRole("button", { name: "재고 문의", exact: true });
}

/** 되묻기 칩 줄. 여럿이면 화면 순서 */
export function choiceGroups(page: Page): Locator {
  return log(page).getByRole("group", { name: "색상, 사이즈 고르기" });
}

/** 칩 하나. 고른 칩은 이름 끝에 숨긴 "(고름)"이 붙는다 */
export function choice(group: Locator, label: string): Locator {
  return group.getByRole("button", { name: new RegExp(`^${label}`) });
}

/** 재고 카드(자동 답 말풍선 안 카드 칸). `data-variant-id`로 옵션을 고른다 */
export function cards(page: Page, variantId?: number): Locator {
  return log(page).locator(
    variantId === undefined
      ? "[data-variant-id]"
      : `[data-variant-id="${variantId}"]`,
  );
}

export function addButton(card: Locator): Locator {
  return card.getByRole("button", { name: /^(장바구니에 담기|담는 중)$/ });
}

export function qtyInput(card: Locator, option: string): Locator {
  return card.getByRole("textbox", { name: `${option} 수량`, exact: true });
}

/** 자동 답 말풍선(되묻기, 재고 답). `data-kind`로 가른다 */
export function autoBubbles(
  page: Page,
  kind: "CLARIFY" | "AUTO_REPLY",
): Locator {
  return log(page).locator(`[data-kind="${kind}"]`);
}

/** 가운데 넘김 줄 */
export function handoffLines(page: Page): Locator {
  return log(page).locator('[data-kind="HANDOFF"]');
}

/** live 영역(방에 하나) */
export function liveRegion(page: Page): Locator {
  return page.locator('[aria-live="polite"][data-ac="S6-11"]');
}

/** 보내기 요청의 키와 본문을 쌓는다 */
export function captureSends(page: Page) {
  const sent: { key: string | null; body: unknown }[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/chat\/rooms\/\d+\/messages$/.test(r.url()))
      sent.push({
        key: r.headers()["idempotency-key"] ?? null,
        body: r.postDataJSON(),
      });
  });
  return sent;
}

/** 담기 요청 본문을 쌓는다 */
export function captureCartPosts(page: Page) {
  const sent: unknown[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/retail\/cart-items$/.test(r.url()))
      sent.push(r.postDataJSON());
  });
  return sent;
}

async function pollsSettled(page: Page) {
  await expect
    .poll(async () =>
      (await requests(page, MESSAGES_GET)).every((r) => r.status !== null),
    )
    .toBe(true);
}

/**
 * polling 하나가 끝난 직후에 시계를 멈춘다. 다음 polling은 3초 뒤라, 멈춘 시계를 1초 안쪽으로만 밀면
 * 그 사이 messages GET은 0회다(S8-3 "보내기 응답만으로"). 목의 보내기 지연(300ms)은 `runFor`로 민다.
 */
export async function pauseAfterPoll(page: Page): Promise<void> {
  const before = await count(page, MESSAGES_GET);
  await waitCount(page, MESSAGES_GET, before + 1);
  await pollsSettled(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
}

/**
 * 멈춘 시계를 보내기 응답까지 민다. 요청이 worker를 거쳐 목 핸들러의 지연(300ms) 타이머를 걸기 전에 시계를
 * 밀면 그 타이머는 영영 안 돈다 — 그래서 100ms씩 밀며 보내는 중 말풍선이 사라질 때까지 본다. 2초 안에
 * 끝나므로 다음 polling(3초)은 안 나간다.
 */
export async function flushSend(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(100);
      return log(page).locator('[data-pending="sending"]').count();
    })
    .toBe(0);
  // TanStack Query는 캐시 변경 알림을 setTimeout(0)으로 모아 보낸다 — 멈춘 시계면 그 한 번을 더 밀어야
  // 응답으로 넣은 메시지가 그려진다
  await page.clock.runFor(100);
}

/** 시계를 polling n번만큼 민다. 매번 응답까지 기다린다 */
export async function runPolls(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(3_000);
    await waitCount(page, MESSAGES_GET, before + 1);
    await pollsSettled(page);
  }
}
