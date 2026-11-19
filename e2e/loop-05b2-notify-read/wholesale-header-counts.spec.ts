import { expect, test } from "@playwright/test";
import {
  bell,
  chatLink,
  composer,
  COUNT_GET,
  count,
  countLoginNavigations,
  flushUntil,
  notify,
  openPanel,
  pauseClock,
  READ_POST,
  rows,
  runToNextCount,
  setVisibility,
  settled,
  start,
  waitCount,
  yieldToPage,
} from "./helpers";

/**
 * #295 S11 헤더 count — 주기(S11-1), 배지(S11-2, S11-3), 응답 역전(S11-12), 401(S11-13), backoff(S11-14),
 * 답 보내기 뒤 채팅 배지(S11-15). 와이어프레임 `19_wholesale-notifications` `#state-badges` `#state-header-fail`.
 *
 * 간격을 재는 테스트는 시계를 멈추고 `runFor`로만 민다. 고정 대기는 없다.
 */

test("S11-1 셸 진입 1회, 30초마다 1회, 숨김 60초 0회, 다시 보이면 즉시 1회", async ({
  page,
}) => {
  await start(page);
  expect(await count(page, COUNT_GET)).toBe(1);
  await pauseClock(page);

  await page.clock.runFor(29_000);
  expect(await count(page, COUNT_GET), "30초 전에는 0회").toBe(1);
  await runToNextCount(page, 2_000);
  expect(await count(page, COUNT_GET)).toBe(2);

  await setVisibility(page, "hidden");
  await page.clock.runFor(60_000);
  expect(await count(page, COUNT_GET), "숨김 60초 동안 0회").toBe(2);

  await setVisibility(page, "visible");
  await waitCount(page, COUNT_GET, 3);

  /* 다른 (erp) 화면으로 옮겨도(클라이언트 이동) 셸이 그대로라 다시 세지 않는다 */
  await page.getByRole("link", { name: "재고" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await page.clock.runFor(1_000);
  expect(await count(page, COUNT_GET)).toBe(3);
});

test("S11-2 배지와 접근 이름 — 3, 0, 99+, 채팅 답 필요", async ({ page }) => {
  await start(page);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
  await expect(
    bell(page).locator('[aria-hidden="true"]', { hasText: /^3$/ }),
  ).toBeVisible();
  /* 채팅 목 시드의 답 필요 방 수. 0 이면 이 단언이 뜻이 없어 먼저 1 이상인지 본다 */
  await expect(chatLink(page)).toHaveAccessibleName(
    /^채팅, 답 필요 [1-9]\d*건$/,
  );

  /* 97건 더 → 100 → 알약 99+, 이름은 실제 수 */
  await page.evaluate(async () => {
    for (let i = 0; i < 97; i++)
      await fetch("/__mock/notifications/incoming", {
        method: "POST",
        body: JSON.stringify({ type: "NEW_ORDER" }),
      });
  });
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 100개");
  await expect(bell(page)).toContainText("99+");

  await notify(page, "reset", { empty: true });
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(bell(page)).toHaveText("");
});

test("S11-3 /products 에서 새 주문 → 30초 안 배지 3 → 4", async ({ page }) => {
  await start(page, "/products");
  await pauseClock(page);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await runToNextCount(page, 30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await expect(page).toHaveURL(/\/products$/);
});

test("S11-12 늦게 온 count 가 read 뒤 배지를 되살리지 않는다", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await notify(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);

  /* 30초 count 시작(값 3 을 들고 5초 뒤 도착 예정) */
  const before = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, before + 1);

  /* 그 응답 전에 안 읽은 첫 행을 누른다 → read 응답 2 → 다시 받은 count 2 */
  const first = rows(page).first();
  await first.click();
  await waitCount(page, READ_POST, 1);
  await waitCount(page, COUNT_GET, before + 2);
  await flushUntil(
    page,
    async () =>
      (await bell(page).getAttribute("aria-label")) === "알림, 안 읽음 2개",
  );

  /* 늦은 count(3) 도착 구간. 한 번에 5초를 밀고 바로 보면 늦은 응답이 그려지기 전에 통과한다(QA F4,
     변이 a 에서 실측). 100ms 씩 밀고 React 가 그릴 틈(yieldToPage)을 준 뒤 매번 본다 */
  for (let elapsed = 0; elapsed < 6_000; elapsed += 100) {
    await page.clock.runFor(100);
    await yieldToPage(page);
    expect(await bell(page).getAttribute("aria-label")).toBe(
      "알림, 안 읽음 2개",
    );
  }
  await settled(page, COUNT_GET);
  await yieldToPage(page);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 2개");

  /* 다음 count 도 2 */
  await runToNextCount(page, 30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 2개");
});

test("S11-13 count 401 → /login 이동 0, 아이콘만, 멈춤, 쓰던 답 그대로", async ({
  page,
}) => {
  await start(page, "/chats?room=1");
  /* 로그인 helper 의 /login 이동은 빼고 센다 */
  const loginNavs = countLoginNavigations(page);
  await composer(page).fill("가나다");
  await notify(page, "fail", { op: "count", status: 401 });
  await pauseClock(page);

  await runToNextCount(page, 30_000);
  await flushUntil(
    page,
    async () => (await bell(page).getAttribute("aria-label")) === "알림",
  );
  await expect(chatLink(page)).toHaveAccessibleName("채팅");

  const after401 = await count(page, COUNT_GET);
  await page.clock.runFor(60_000);
  expect(await count(page, COUNT_GET), "401 뒤 60초 요청 0회").toBe(after401);
  /* 탭 복귀도 다시 부르지 않는다 */
  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  await page.clock.runFor(100);
  expect(await count(page, COUNT_GET)).toBe(after401);

  expect(loginNavs()).toBe(0);
  await expect(page).toHaveURL(/\/chats\?room=1$/);
  await expect(composer(page)).toHaveValue("가나다");
  /* 종은 계속 눌린다 */
  await page.clock.resume();
  await bell(page).click();
  await expect(rows(page).first()).toBeVisible();
});

test("S11-14 500 연속 → 문구 0, 다음 간격 60, 120, 300초, 성공 뒤 30초", async ({
  page,
}) => {
  await start(page);
  await notify(page, "fail", { op: "count", status: 500, times: 3 });
  await pauseClock(page);

  await runToNextCount(page, 30_000); // 1번째 실패
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(chatLink(page)).toHaveAccessibleName("채팅");

  for (const gap of [60_000, 120_000, 300_000]) {
    const n = await count(page, COUNT_GET);
    await page.clock.runFor(gap - 1_000);
    expect(await count(page, COUNT_GET), `${gap / 1000}초 전에는 0회`).toBe(n);
    await runToNextCount(page, 2_000);
  }
  /* 300초 뒤 것은 성공 */
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");

  const n = await count(page, COUNT_GET);
  await page.clock.runFor(29_000);
  expect(await count(page, COUNT_GET)).toBe(n);
  await runToNextCount(page, 2_000);

  /* 헤더에 실패 문구가 없다 */
  await expect(page.getByRole("banner").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("banner")).not.toContainText(/못했어요|문제/);
});

test("S11-15 답 보내기 성공 → 30초 전 count 1회, 채팅 배지 −1", async ({
  page,
}) => {
  await start(page, "/chats?room=1");
  const label = await chatLink(page).getAttribute("aria-label");
  const before = Number(/답 필요 (\d+)건/.exec(label ?? "")?.[1]);
  expect(before, "방 1 이 답 필요여야 시험이 된다").toBeGreaterThan(0);
  /* 시계는 흐른다(보내기 목이 300ms 지연을 쓴다). 첫 count 뒤 30초가 지나기 전에 끝나는지 시각으로 확인한다 */
  const startedAt = await page.evaluate(() => Date.now());
  const counts = await count(page, COUNT_GET);
  await composer(page).fill("네 있어요");
  await composer(page).press("Enter");
  await waitCount(page, COUNT_GET, counts + 1);
  await expect(chatLink(page)).toHaveAccessibleName(
    before - 1 > 0 ? `채팅, 답 필요 ${before - 1}건` : "채팅",
  );
  const elapsed = (await page.evaluate(() => Date.now())) - startedAt;
  expect(elapsed, "30초 polling 이 아니라 보내기 뒤 다시 받기").toBeLessThan(
    30_000,
  );
});
