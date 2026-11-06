import { expect, test, type Page } from "@playwright/test";
import {
  composer,
  composerBox,
  expectLastVisible,
  frames,
  incoming,
  jumpButton,
  knob,
  log,
  logMetrics,
  nextPoll,
  note,
  openAtBottom,
  record,
  ROOM_LONG,
  snapshot,
  waitSequence,
} from "./helpers";

/**
 * QA loop-08h S1(#386). 개발 spec(`wholesale-chat-bottom-keep.spec.ts`)은 `fill`과 합성 이벤트로 단계를 건다.
 * 여기서는 사장이 실제로 하는 입력으로 같은 규칙을 다시 본다.
 * - 줄바꿈은 키보드 Shift+Enter(입력 이벤트가 글자마다 난다)
 * - 1,001자는 `keyboard.insertText`(붙여넣기와 같은 한 번의 input)
 * - 사장 휠은 `page.mouse.wheel`(진짜 wheel, scroll), 창 높이는 `setViewportSize`
 * 스크린샷은 `test.info().outputPath()`. 값은 annotations에 남긴다.
 */

const NEW_SEQ = 121;
const OVER = "1,000자까지 보낼 수 있어요";

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test.describe(`QA S1 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("S1-2 ③ 1,001자 붙여넣기 → 오류 줄 보임, 마지막 말풍선이 입력창 위, |d| ≤ 1", async ({
      page,
    }) => {
      await openAtBottom(page);
      const before = await snapshot(page);
      await composer(page).focus();
      await page.keyboard.insertText("가".repeat(1001));
      const error = composerBox(page).locator('[data-ac="S4-4"]');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(`${OVER} (1,001/1,000)`);
      /* 오류 줄 자체도 보이는 자리(뷰포트 안)인지 */
      const errorBottom = await error.evaluate(
        (el) => el.getBoundingClientRect().bottom,
      );
      note("error", { text: await error.textContent(), errorBottom });
      expect(errorBottom).toBeLessThanOrEqual(viewport.height);
      await frames(page);
      const after = await record(page, "after-1001");
      note("delta", {
        box: after.boxHeight - before.boxHeight,
        log: before.clientHeight - after.clientHeight,
      });
      expect(after.boxHeight, "전제조건: 상자가 늘었다").toBeGreaterThan(
        before.boxHeight,
      );
      expect(Math.abs(after.d)).toBeLessThanOrEqual(1);
      expectLastVisible(after);
      await shot(page, `S1-2-1001-${viewport.width}`);
    });

    test("S1-2 ② 키보드 Shift+Enter 6줄 → |d| ≤ 1 → incoming → 따라감, 읽음 그 sequence 1건", async ({
      page,
    }) => {
      const { reads, baseReads } = await openAtBottom(page);
      const before = await snapshot(page);
      await composer(page).focus();
      for (const [i, ch] of ["1", "2", "3", "4", "5", "6"].entries()) {
        if (i > 0) await page.keyboard.press("Shift+Enter");
        await page.keyboard.type(ch);
      }
      await expect(composer(page)).toHaveValue("1\n2\n3\n4\n5\n6");
      await frames(page);
      const grown = await record(page, "after-six-keyboard");
      expect(grown.boxHeight, "전제조건: 상자가 늘었다").toBeGreaterThan(
        before.boxHeight,
      );
      expect(Math.abs(grown.d)).toBeLessThanOrEqual(1);
      expectLastVisible(grown);

      await incoming(page, ROOM_LONG, "키보드로 쓰는 중 온 글");
      await waitSequence(page, NEW_SEQ);
      await nextPoll(page);
      const after = await record(page, "after-incoming");
      note("reads", reads.slice(baseReads));
      expect(Math.abs(after.d)).toBeLessThanOrEqual(1);
      expectLastVisible(after);
      expect(reads.slice(baseReads)).toEqual([
        { roomId: ROOM_LONG, seq: NEW_SEQ },
      ]);
      await expect(jumpButton(page)).toHaveCount(0);
      await shot(page, `S1-2-six-incoming-${viewport.width}`);
    });

    test("6줄 쓰고 Enter로 보냄 → 입력창이 다시 줄어도 바닥, 보낸 글이 입력창 위", async ({
      page,
    }) => {
      await openAtBottom(page);
      await composer(page).fill("1\n2\n3\n4\n5\n6");
      await frames(page);
      const grown = await record(page, "grown");
      expect(Math.abs(grown.d)).toBeLessThanOrEqual(1);
      await composer(page).press("Enter");
      await expect(composer(page)).toHaveValue("");
      await expect(log(page).locator("[data-sequence]").last()).toContainText(
        "6",
      );
      await expect
        .poll(async () => Math.abs((await logMetrics(page)).fromBottom))
        .toBeLessThanOrEqual(1);
      await frames(page);
      const sent = await record(page, "after-send");
      expectLastVisible(sent);
    });
  });
}

/* S1-3에 S1-2를 겹친다(개발 spec은 따로 건다). 창을 줄인 채 6줄 → 둘 다 log를 줄여도 바닥 */
test.describe("QA S1-3 1470×900", () => {
  test.use({ viewport: { width: 1470, height: 900 } });

  test("창 900 → 700 → 6줄 → incoming → 따라감, 읽음 1 → 900 복원 → |d| ≤ 1", async ({
    page,
  }) => {
    const { reads, baseReads } = await openAtBottom(page);
    await page.setViewportSize({ width: 1470, height: 700 });
    await expect
      .poll(async () => (await logMetrics(page)).clientHeight)
      .toBeLessThan(600);
    await frames(page);
    const shrunk = await record(page, "after-700");
    expect(Math.abs(shrunk.d)).toBeLessThanOrEqual(1);
    await composer(page).fill("1\n2\n3\n4\n5\n6");
    await expect
      .poll(async () => (await snapshot(page)).boxHeight)
      .toBeGreaterThan(shrunk.boxHeight);
    await frames(page);
    const grown = await record(page, "after-700-six");
    expect(Math.abs(grown.d)).toBeLessThanOrEqual(1);
    expectLastVisible(grown);
    await incoming(page, ROOM_LONG, "줄인 창, 6줄 중 온 글");
    await waitSequence(page, NEW_SEQ);
    await expect
      .poll(() => reads.filter((r) => r.seq === NEW_SEQ).length)
      .toBe(1);
    await frames(page);
    const followed = await record(page, "after-incoming");
    expect(Math.abs(followed.d)).toBeLessThanOrEqual(1);
    expectLastVisible(followed);
    expect(reads.length - baseReads).toBe(1);
    await page.setViewportSize({ width: 1470, height: 900 });
    await expect
      .poll(async () => (await logMetrics(page)).clientHeight)
      .toBeGreaterThan(followed.clientHeight);
    await frames(page);
    const restored = await record(page, "after-900");
    expect(Math.abs(restored.d)).toBeLessThanOrEqual(1);
    expectLastVisible(restored);
    await shot(page, "S1-3-1470-restored");
  });
});

test.describe("QA S1 1280×800 실제 휠과 창", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("S1-4 끊김 안내 → 마지막 말풍선이 안내 위에 보임(스크린샷)", async ({
    page,
  }) => {
    await openAtBottom(page);
    const before = await snapshot(page);
    await knob(page, "fail", { op: "messages", page: "after", status: 401 });
    const notice = page.locator('[data-ac="S4-7"]');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    note("notice", {
      tag: await notice.evaluate((el) => el.tagName),
      role: await notice.getAttribute("role"),
      text: await notice.textContent(),
    });
    await frames(page);
    const after = await record(page, "after-notice");
    note("delta", after.boxHeight - before.boxHeight);
    expect(after.boxHeight).toBeGreaterThan(before.boxHeight);
    expect(Math.abs(after.d)).toBeLessThanOrEqual(1);
    expectLastVisible(after);
    await shot(page, "S1-4-session-lost-1280");
  });

  /* 휠 40px(d ≈ 40 ≤ 48, 아직 "바닥") 뒤 창을 줄인다. 실제 브라우저는 wheel의 scroll이 리사이즈 전에 끝나 그때
     높이로 "바닥"이 남는다 → 규칙 ①대로 붙는다. 바닥 범위 안의 작은 휠은 바닥으로 본다는 08c 정의와 같은지 본다 */
  test("실제 휠 40px 뒤 창 800 → 600 → 바닥 범위 안이었으니 붙음(|d| ≤ 1), 버튼 0", async ({
    page,
  }) => {
    await openAtBottom(page);
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const start = (await logMetrics(page)).scrollTop;
    await page.mouse.wheel(0, -40);
    await expect
      .poll(async () => (await logMetrics(page)).scrollTop)
      .toBeLessThan(start);
    const wheeled = await record(page, "after-wheel-40");
    expect(wheeled.d, "전제조건: 바닥 범위 안").toBeLessThanOrEqual(48);
    expect(wheeled.d, "전제조건: 실제로 올라감").toBeGreaterThan(1);
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect
      .poll(async () => (await logMetrics(page)).clientHeight)
      .toBeLessThan(wheeled.clientHeight);
    await frames(page);
    const shrunk = await record(page, "after-resize");
    expect(Math.abs(shrunk.d)).toBeLessThanOrEqual(1);
    await expect(jumpButton(page)).toHaveCount(0);
  });

  /* 휠 120px(바닥 밖) 뒤 창을 줄임 → 위를 읽던 중이라 붙지 않는다(R2 보호). 실제 입력 경로 */
  test("실제 휠 120px 뒤 창 800 → 600 → 안 붙음, incoming → 읽음 0, 버튼", async ({
    page,
  }) => {
    const { reads, baseReads } = await openAtBottom(page);
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const start = (await logMetrics(page)).scrollTop;
    await page.mouse.wheel(0, -120);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeGreaterThan(48);
    const wheeled = await record(page, "after-wheel-120");
    note("start-scrollTop", start);
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect
      .poll(async () => (await logMetrics(page)).clientHeight)
      .toBeLessThan(wheeled.clientHeight);
    await frames(page);
    const shrunk = await record(page, "after-resize");
    expect(
      Math.abs(shrunk.scrollTop - wheeled.scrollTop),
      "scrollTop 그대로",
    ).toBeLessThanOrEqual(4);
    expect(shrunk.d).toBeGreaterThan(48);
    await incoming(page, ROOM_LONG, "위에서 받은 글");
    await waitSequence(page, NEW_SEQ);
    await nextPoll(page);
    expect(reads.length - baseReads, "읽음 증가 0").toBe(0);
    await expect(jumpButton(page)).toHaveText("새 메시지 1개", {
      useInnerText: true,
    });
    await shot(page, "S1-5-wheel-120-resize-1280");
  });
});
