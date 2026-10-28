import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  count,
  drawnSequences,
  incoming,
  installClock,
  log,
  login,
  messageGets,
  MESSAGES_GET,
  mock,
  openChats,
  setVisibility,
  settled,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #264 S3-3~6 — 열린 방 polling. 실제로 3초를 기다리지 않는다(01-plan §0 3) — `page.clock`으로 시간을 민다.
 *
 * 간격을 정확히 재는 테스트는 시계를 **멈춘 뒤** `runFor`로만 민다. 멈춘 동안엔 TanStack의 알림
 * (`setTimeout 0`)도 멈춰 있어서, 응답이 반영됐는지는 방 log의 `data-poll-failures`가 바뀔 때까지 1ms씩
 * 밀며 확인한다(`flushUntil`). 그 몇 ms 때문에 경계 확인은 ±50ms 여유를 둔다.
 */

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
});

async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1));
}

/** 멈춘 시계를 1ms씩 밀어 화면이 `data-poll-failures = n`을 그릴 때까지 */
async function flushUntilFailures(page: Page, n: number): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return log(page).getAttribute("data-poll-failures");
    })
    .toBe(String(n));
}

/** 다음 요청이 [min, max] ms 사이에 시작한다 */
async function expectNextPollWithin(
  page: Page,
  minMs: number,
  maxMs: number,
): Promise<void> {
  const before = await count(page, MESSAGES_GET);
  await page.clock.runFor(minMs - 50);
  expect(await count(page, MESSAGES_GET), `${minMs}ms 전엔 요청 없음`).toBe(
    before,
  );
  await page.clock.runFor(maxMs - minMs + 100);
  await waitCount(page, MESSAGES_GET, before + 1);
  await settled(page, MESSAGES_GET);
}

test("S3-3 주입 뒤 3초 → afterSequence 요청, 응답 뒤 말풍선이 생기고 바닥으로", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await pauseClock(page);
  const before = await count(page, MESSAGES_GET);
  await incoming(page, 1, "아 그리고 차콜 L도 10장요");

  await page.clock.runFor(3_000);
  await waitCount(page, MESSAGES_GET, before + 1);
  const last = (await messageGets(page)).at(-1);
  expect(last?.url).toContain("afterSequence=7");
  await settled(page, MESSAGES_GET);
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return bubbles(page).count();
    })
    .toBe(8);
  await expect(bubbles(page).last()).toContainText("아 그리고 차콜 L도 10장요");
  // 바닥까지 내려가 있다
  const gap = await log(page).evaluate(
    (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
  );
  expect(gap).toBeLessThanOrEqual(1);
});

test("S3-4 60개 주입 → hasMore 면 기다리지 않고 두 번째 요청, 누락 중복 0", async ({
  page,
}) => {
  await openChats(page, 3); // 120개 방, 71~120을 그린다
  await expect(bubbles(page)).toHaveCount(50);
  await pauseClock(page);
  const before = await count(page, MESSAGES_GET);
  await incoming(page, 3, "새 문의", 60);

  await page.clock.runFor(3_000);
  // 시계가 멈춰 있는데도 두 번째 요청이 나간다 = 간격을 기다리지 않았다
  await waitCount(page, MESSAGES_GET, before + 2);
  const urls = (await messageGets(page)).slice(-2).map((r) => r.url);
  expect(urls[0]).toContain("afterSequence=120");
  expect(urls[1]).toContain("afterSequence=170");
  await settled(page, MESSAGES_GET);
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return bubbles(page).count();
    })
    .toBe(110);
  const seqs = await drawnSequences(page);
  expect(seqs).toEqual(Array.from({ length: 110 }, (_, i) => 71 + i));
});

test.describe("S3-5 숨김, 오프라인, 401 동안 요청 0", () => {
  test("탭 숨김 동안 0, 다시 보이면 즉시 1회", async ({ page }) => {
    await openChats(page, 1);
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    await setVisibility(page, "hidden");
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(30_000);
    expect(await count(page, MESSAGES_GET)).toBe(before);

    await setVisibility(page, "visible");
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page, MESSAGES_GET);
    expect(await count(page, MESSAGES_GET)).toBe(before + 1);
  });

  test("오프라인 동안 0, 온라인 복귀 즉시 1회", async ({ page, context }) => {
    await openChats(page, 1);
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    await context.setOffline(true);
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(30_000);
    expect(await count(page, MESSAGES_GET)).toBe(before);

    await context.setOffline(false);
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page, MESSAGES_GET);
    expect(await count(page, MESSAGES_GET)).toBe(before + 1);
  });

  test("401 뒤 0, 로그인 화면으로 튕기지 않는다", async ({ page }) => {
    await openChats(page, 1);
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    await mock(page, "fail", { op: "messages", status: 401, times: 1 });
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(3_000);
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page, MESSAGES_GET);
    expect((await messageGets(page)).at(-1)?.status).toBe(401);

    await page.clock.runFor(60_000);
    // 다시 보여도(창 복귀) 묻지 않는다
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.clock.runFor(10);
    expect(await count(page, MESSAGES_GET)).toBe(before + 1);
    expect(page.url()).toContain("/chats?room=1");
    await expect(bubbles(page)).toHaveCount(7);
  });
});

test("S3-6 메시지 500 세 번 → 3, 6, 12초(±20%), 성공 뒤 3초", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await pauseClock(page);
  await mock(page, "fail", { op: "messages", times: 3 });
  const before = await count(page, MESSAGES_GET);

  // 1번째 실패
  await page.clock.runFor(3_000);
  await waitCount(page, MESSAGES_GET, before + 1);
  await settled(page, MESSAGES_GET);
  await flushUntilFailures(page, 1);
  // 2번째 실패까지 3초 ±20%
  await expectNextPollWithin(page, 2_400, 3_600);
  await flushUntilFailures(page, 2);
  // 3번째 실패까지 6초 ±20%
  await expectNextPollWithin(page, 4_800, 7_200);
  await flushUntilFailures(page, 3);
  // 성공까지 12초 ±20%
  await expectNextPollWithin(page, 9_600, 14_400);
  await flushUntilFailures(page, 0);
  // 성공 뒤 3초로 복귀
  await expectNextPollWithin(page, 3_000, 3_000);

  const statuses = (await messageGets(page)).slice(-5).map((r) => r.status);
  expect(statuses).toEqual([500, 500, 500, 200, 200]);
  // polling 실패는 화면에 띄우지 않는다
  await expect(page.getByText("서버에서 문제가 생겼어요")).toHaveCount(0);
  await expect(bubbles(page)).toHaveCount(7);
});
