/* 08e QA 재현 spec, 08f에서 회귀 시험으로 커밋(08f-Q3) */
import { expect, test, type Page } from "@playwright/test";
import {
  AFTER_GET,
  alignTop,
  assertStubServers,
  composer,
  count,
  incoming,
  log,
  logMetrics,
  openHistoryRoom,
  settled,
  topOf,
} from "../loop-08d-chat-rest/retail-history-helpers";

/**
 * loop-08e QA — #363 화면 확인(입력창 세 줄 뒤 창 줄이기, 390 1280)과 리뷰 R13 재현(위에서 새 메시지를 받은 뒤
 * 리사이즈해도 읽음 POST 0, 바닥에 가면 1). 스크린샷: .claude/harness/runs/loop-08e-chat-rest/qa/s3-*.png.
 * `pnpm e2e:stub`. 고정 지연 없음.
 */

assertStubServers();

const SHOTS = ".claude/harness/runs/loop-08e-chat-rest/qa";
const THREE_LINES = "레드 L\n두 장\n내일 가요";
const SHRINK_PX = 244;
const ROOM1_READ = {
  path: /\/api\/retail\/chat\/rooms\/1\/read$/,
  method: "POST",
} as const;

function jumpButton(page: Page) {
  return page.locator('button[data-ac~="08d:S4-2"]');
}

async function lastBubbleBottom(page: Page): Promise<number> {
  return log(page).evaluate((el) => {
    const nodes = el.querySelectorAll("[data-sequence]");
    return nodes[nodes.length - 1]!.getBoundingClientRect().bottom;
  });
}

async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, AFTER_GET);
  await expect
    .poll(() => count(page, AFTER_GET), { timeout: 8000 })
    .toBeGreaterThan(before);
  await settled(page, AFTER_GET);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`QA #363 화면 ${viewport.width}`, () => {
    test.use({ viewport });

    test("바닥에서 세 줄 쓰고 바로 창을 244px 줄임 → 마지막 말풍선이 입력창 위, 가로 넘침 0", async ({
      page,
    }) => {
      await openHistoryRoom(page);
      await composer(page).fill(THREE_LINES);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height - SHRINK_PX,
      });
      await expect
        .poll(async () => (await logMetrics(page)).fromBottom, {
          timeout: 3000,
        })
        .toBeLessThanOrEqual(1);
      const input = await composer(page).boundingBox();
      if (input === null) throw new Error("입력창 없음");
      const last = await lastBubbleBottom(page);
      await page.screenshot({
        path: `${SHOTS}/s3-three-lines-shrunk-${viewport.width}.png`,
      });
      expect(last).toBeLessThanOrEqual(input.y);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(jumpButton(page)).toHaveCount(0);
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({
          lastBottom: last,
          inputTop: input.y,
          inputH: input.height,
          metrics: await logMetrics(page),
        }),
      });
    });
  });
}

test.describe("QA 리뷰 R13 재현 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("위에서 새 메시지 1개를 받은 채 세 줄 + 창 줄임 → 읽음 POST 0, 자리 그대로 → 바닥으로 가면 POST 1", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await expect.poll(() => count(page, ROOM1_READ)).toBeGreaterThan(0);
    await settled(page, ROOM1_READ);
    await alignTop(page, 100);
    await incoming(page, 1, "QA 위에서 받은 답");
    await expect(jumpButton(page)).toHaveText("새 메시지 1개", {
      timeout: 8000,
    });
    const reads = await count(page, ROOM1_READ);
    const top = await topOf(page, 100);
    await composer(page).fill(THREE_LINES);
    await page.setViewportSize({ width: 390, height: 844 - SHRINK_PX });
    await nextPoll(page);
    expect(Math.abs((await topOf(page, 100)) - top)).toBeLessThanOrEqual(4);
    expect(await count(page, ROOM1_READ)).toBe(reads);
    await expect(jumpButton(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/s3-r13-above-390.png` });
    await jumpButton(page).click();
    await expect
      .poll(() => count(page, ROOM1_READ), { timeout: 8000 })
      .toBe(reads + 1);
  });
});
