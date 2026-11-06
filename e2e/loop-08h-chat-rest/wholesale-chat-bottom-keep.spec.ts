import { expect, test, type Page } from "@playwright/test";
import {
  anchorOf,
  composerBox,
  expectLastVisible,
  frames,
  growComposer,
  incoming,
  jumpButton,
  knob,
  log,
  logMetrics,
  nextPoll,
  note,
  openAtBottom,
  record,
  resizeTo,
  ROOM_LONG,
  topOf,
  waitSequence,
  wheelUp,
} from "./helpers";

/**
 * loop-08h S1(#386) — 도매 방 log 크기가 바뀔 때 바닥 지키기. 입력창은 log의 형제이고 `shrink-0`이라 늘어난 만큼
 * log가 준다(기획 §4-1). 규칙: ① 바꾸기 전 바닥이었으면 먼저 바닥에 붙이고 ② 그다음 다시 잰다. 위를 읽던 중이면
 * ①을 건너뛴다. ResizeObserver보다 먼저 온 scroll(사장 스크롤 아님)은 ResizeObserver가 마지막으로 본 높이로 잰다.
 *
 * 방 3 메시지 120개라 incoming 하나는 sequence 121이다. 단계마다 새 페이지(바닥, 빈 입력창)에서 시작한다.
 */

const SIX_LINES = "1\n2\n3\n4\n5\n6";
const FOUR_LINES = "1\n2\n3\n4";
const OVER_LIMIT = "가".repeat(1001);
const NEW_SEQ = 121;

/** 사장 스크롤 창(`USER_SCROLL_WINDOW_MS`). 손으로 적는다 — 앱 상수를 가져다 쓰면 같은 실수를 같이 한다 */
const USER_SCROLL_WINDOW_MS = 400;

/** 페이지 안 시계 기록(`window.__ac08h`). 앱과 같은 `performance.now()`로 잰다(리뷰 R2) */
interface InputClock {
  /** 마지막 wheel 또는 scroll 시각 */
  lastInput: number | null;
  /** log 높이가 처음 바뀐 걸 ResizeObserver가 본 시각과 그때의 `lastInput` */
  resizeAt: number | null;
  inputAtResize: number | null;
}

/**
 * log에 wheel·scroll 리스너와 ResizeObserver를 건다. 앱이 사장 스크롤 창을 여는 시각(마지막 wheel·scroll의
 * `performance.now()`)과 실제 높이가 바뀐 시각을 같은 시계로 남긴다. `setViewportSize`는 Node에서 가서 그 반환 시각은
 * 페이지의 창 변경 시각이 아니다 — 페이지 ResizeObserver 콜백 시각을 쓴다
 */
async function armInputClock(page: Page): Promise<void> {
  await log(page).evaluate((el) => {
    const clock: InputClock = {
      lastInput: null,
      resizeAt: null,
      inputAtResize: null,
    };
    Object.assign(window, { __ac08h: clock });
    const mark = () => {
      clock.lastInput = performance.now();
    };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("scroll", mark);
    const startHeight = el.clientHeight;
    /* observe 직후 첫 콜백(지금 크기)은 건너뛴다 — 높이가 바뀐 첫 콜백만 */
    const probe = new ResizeObserver(() => {
      if (el.clientHeight === startHeight) return;
      probe.disconnect();
      clock.resizeAt = performance.now();
      clock.inputAtResize = clock.lastInput;
    });
    probe.observe(el);
  });
}

async function readInputClock(page: Page): Promise<InputClock> {
  return page.evaluate(() => {
    const clock = (window as { __ac08h?: InputClock }).__ac08h;
    if (clock === undefined) throw new Error("armInputClock 안 함");
    return clock;
  });
}

/** 전제조건: 높이 변경이 마지막 wheel·scroll부터 사장 스크롤 창 안에 났다. 안 맞으면 실패(통과로 치지 않음) */
function expectInsideUserScrollWindow(clock: InputClock): void {
  note("input-clock", clock);
  if (clock.resizeAt === null || clock.inputAtResize === null)
    throw new Error(
      `전제조건: 입력 또는 높이 변경 기록 없음 ${JSON.stringify(clock)}`,
    );
  expect(
    clock.resizeAt - clock.inputAtResize,
    "전제조건: 마지막 wheel·scroll → 높이 변경 < 사장 스크롤 창",
  ).toBeLessThan(USER_SCROLL_WINDOW_MS);
}

/** 따라가기 0: 기준 말풍선 top 이동 ≤ 4px이고 scrollTop 변화 ≤ 4px */
async function expectNoFollow(
  page: Page,
  anchor: { sequence: number; top: number },
  scrollTop: number,
): Promise<void> {
  const top = await topOf(page, anchor.sequence);
  const now = (await logMetrics(page)).scrollTop;
  note("no-follow", { anchor, top, scrollTop, now });
  expect(Math.abs(top - anchor.top), "기준 말풍선 이동").toBeLessThanOrEqual(4);
  expect(Math.abs(now - scrollTop), "scrollTop 변화").toBeLessThanOrEqual(4);
}

test.describe("1280×800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("S1-1 바닥 → 6줄 → |d| ≤ 1, 마지막 말풍선 보임 → incoming → 따라감, 읽음 +1(그 sequence)", async ({
    page,
  }) => {
    /* 재현 시험(재산정 지점 1). 고치기 전 값(6줄 뒤 d, incoming 뒤 따라가기와 읽음)을 다 남기려고 단언은 soft로
       끝까지 간다. 읽음은 "그 말풍선 DOM 반영 + 그 뒤 polling 응답 1회" 다음에 센다(기획 §6 읽음 검사 시점) */
    const { reads, baseReads } = await openAtBottom(page);
    await growComposer(page, SIX_LINES, "six-lines");
    const grown = await record(page, "after-six-lines");
    expect.soft(Math.abs(grown.d), "6줄 뒤 바닥 밀착").toBeLessThanOrEqual(1);
    expect
      .soft(grown.lastBottom, "6줄 뒤 마지막 말풍선이 입력창 위")
      .toBeLessThanOrEqual(grown.boxTop);

    await incoming(page, ROOM_LONG, "6줄 쓰는 중 온 글");
    await waitSequence(page, NEW_SEQ);
    await nextPoll(page);
    const after = await record(page, "after-incoming");
    note("reads", reads.slice(baseReads));
    expect.soft(Math.abs(after.d), "새 글을 따라감").toBeLessThanOrEqual(1);
    expect
      .soft(after.lastBottom, "새 글이 입력창 위")
      .toBeLessThanOrEqual(after.boxTop);
    expect
      .soft(reads.slice(baseReads), "읽음 +1(그 sequence)")
      .toEqual([{ roomId: ROOM_LONG, seq: NEW_SEQ }]);
    await expect.soft(jumpButton(page)).toHaveCount(0);
  });

  test("S1-4 끊김 안내(401) → 상자 Δ > 0 → |d| ≤ 1, 마지막 말풍선 보임", async ({
    page,
  }) => {
    await openAtBottom(page);
    const before = await record(page, "before-session-lost");
    /* 손잡이 `fail {op: messages, page: after, status: 401}` — 다음 polling이 401을 받아 세션 끊김 안내가 뜬다(08b).
       끊긴 세션은 읽음을 안 보내서 incoming, 읽음은 단언하지 않는다 */
    await knob(page, "fail", { op: "messages", page: "after", status: 401 });
    await expect(page.locator('[data-ac="S4-7"]')).toBeVisible({
      timeout: 10_000,
    });
    await frames(page);
    const after = await record(page, "after-session-lost");
    const delta = after.boxHeight - before.boxHeight;
    note("session-lost-delta", {
      delta,
      logShrink: before.clientHeight - after.clientHeight,
    });
    expect(delta, "전제조건: 상자 Δ > 0").toBeGreaterThan(0);
    expect(
      Math.abs(before.clientHeight - after.clientHeight - delta),
      "전제조건: log가 Δ만큼 줄었다",
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(after.d)).toBeLessThanOrEqual(1);
    expectLastVisible(after);
  });

  test("S1-5 ① 위(d ≥ 200) → 6줄, 창 600 → 기준 말풍선 그대로 → incoming → 따라가기 0, 읽음 0, 버튼은 입력창 위", async ({
    page,
  }) => {
    const { reads, baseReads } = await openAtBottom(page);
    await wheelUp(page, 300);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeGreaterThanOrEqual(200);
    const anchor = await anchorOf(page);
    note("anchor", anchor);

    await growComposer(page, SIX_LINES, "six-lines");
    expect(
      Math.abs((await topOf(page, anchor.sequence)) - anchor.top),
      "6줄 뒤 기준 말풍선 이동",
    ).toBeLessThanOrEqual(4);
    await expect(jumpButton(page)).toHaveCount(0);

    await resizeTo(page, 1280, 600, "resize-600");
    expect(
      Math.abs((await topOf(page, anchor.sequence)) - anchor.top),
      "창 줄인 뒤 기준 말풍선 이동",
    ).toBeLessThanOrEqual(4);
    await expect(jumpButton(page)).toHaveCount(0);

    const beforeIncoming = await record(page, "before-incoming");
    expect(beforeIncoming.d, "incoming 직전 바닥 아님").toBeGreaterThan(48);
    await incoming(page, ROOM_LONG, "위에서 받은 글");
    await waitSequence(page, NEW_SEQ);
    await nextPoll(page);
    await record(page, "after-incoming");
    expect(reads.length - baseReads, "읽음 증가 0").toBe(0);
    await expectNoFollow(page, anchor, beforeIncoming.scrollTop);
    await expect(jumpButton(page)).toHaveText("새 메시지 1개");
    const jump = await jumpButton(page).boundingBox();
    const box = await composerBox(page).boundingBox();
    if (jump === null || box === null) throw new Error("버튼 또는 입력창 없음");
    expect(jump.y + jump.height, "버튼이 입력창 위").toBeLessThanOrEqual(box.y);
  });

  test("S1-5 ② 휠로 올린 직후(사장 스크롤 창 안) 창 600 → d > 48, 기준 말풍선 그대로 → incoming → 읽음 0", async ({
    page,
  }) => {
    const { reads, baseReads } = await openAtBottom(page);
    await armInputClock(page);
    await wheelUp(page, 300);
    const anchor = await anchorOf(page);
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect
      .poll(async () => (await logMetrics(page)).clientHeight)
      .toBeLessThan(500);
    await frames(page);
    note("anchor", anchor);
    /* 전제조건: 창 변경이 사장 스크롤 창 안이다. 시각은 둘 다 페이지 `performance.now()`(리뷰 R2 — 전에는 wheelUp의
       값 대기가 끝난 뒤 Node 시계로 찍어 실제 마지막 scroll과 달랐다) */
    expectInsideUserScrollWindow(await readInputClock(page));
    const shrunk = await record(page, "after-resize");
    expect(shrunk.d, "바닥 아님 유지").toBeGreaterThan(48);
    expect(
      Math.abs((await topOf(page, anchor.sequence)) - anchor.top),
      "기준 말풍선 이동",
    ).toBeLessThanOrEqual(4);

    await incoming(page, ROOM_LONG, "휠 직후 받은 글");
    await waitSequence(page, NEW_SEQ);
    await nextPoll(page);
    await record(page, "after-incoming");
    expect(reads.length - baseReads, "읽음 증가 0").toBe(0);
    await expectNoFollow(page, anchor, shrunk.scrollTop);
  });

  test("S1-7 순서 경합: 상자 줄임 + 같은 task에 scroll 먼저 → scroll → ResizeObserver 순서 → 두 프레임 뒤 |d| ≤ 1", async ({
    page,
  }) => {
    await openAtBottom(page);
    const result = await log(page).evaluate(async (el, shrink) => {
      const frame = () =>
        new Promise<void>((r) => requestAnimationFrame(() => r()));
      const box = el.parentElement;
      if (box === null) throw new Error("log 바깥 상자 없음");
      const order: string[] = [];
      let scrollHeightSeen: number | null = null;
      /* 이 둘은 앱 것보다 늦게 만들어져 같은 단계에서 앱 것 뒤에 돈다. 순서 기록만 한다 */
      el.addEventListener(
        "scroll",
        () => {
          order.push("scroll");
          scrollHeightSeen = el.clientHeight;
        },
        { once: true },
      );
      const probe = new ResizeObserver(() => {
        probe.disconnect();
        order.push("resize");
      });
      const before = el.clientHeight;
      /* 높이를 먼저 잰다 — flex를 먼저 풀면 상자가 내용 높이로 늘어난다 */
      const boxHeight = box.getBoundingClientRect().height;
      box.style.flex = "none";
      box.style.height = `${boxHeight - shrink}px`;
      const shrunkHeight = el.clientHeight;
      probe.observe(el);
      /* 사장 스크롤이 아닌 scroll이 ResizeObserver보다 먼저 온다(소매 #363 순서). 줄어든 높이로 재면 "바닥 아님" */
      el.dispatchEvent(new Event("scroll"));
      await frame();
      await frame();
      return {
        order,
        before,
        shrunkHeight,
        scrollHeightSeen,
        d: el.scrollHeight - el.clientHeight - el.scrollTop,
        scrollTop: el.scrollTop,
      };
    }, 200);
    note("race", result);
    expect(result.order, "전제조건: scroll → ResizeObserver").toEqual([
      "scroll",
      "resize",
    ]);
    expect(result.scrollHeightSeen, "scroll이 줄어든 높이를 봄").toBe(
      result.shrunkHeight,
    );
    expect(Math.abs(result.d)).toBeLessThanOrEqual(1);
  });
});

/* S1-2 단계 셋 × 해상도 둘. 단계마다 새로 시작(새 페이지, 바닥, 빈 입력창) */
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test.describe(`S1-2 입력창 단계 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    for (const [name, text] of [
      ["① 4줄", FOUR_LINES],
      ["② 6줄", SIX_LINES],
      ["③ 1,001자 오류", OVER_LIMIT],
    ] as const) {
      test(`${name} → |d| ≤ 1, 마지막 말풍선 보임`, async ({ page }) => {
        await openAtBottom(page);
        await growComposer(page, text, name);
        const after = await record(page, `after ${name}`);
        expect(Math.abs(after.d)).toBeLessThanOrEqual(1);
        expectLastVisible(after);
      });
    }
  });
}

/* S1-3 실제 창 높이. 줄인 상태에서 incoming → 따라감, 읽음 POST 1(그 sequence), 버튼 0 */
for (const [width, high, low] of [
  [1280, 800, 600],
  [1470, 900, 700],
] as const) {
  test.describe(`S1-3 창 ${width} ${high} → ${low} → ${high}`, () => {
    test.use({ viewport: { width, height: high } });

    test("각 뒤 |d| ≤ 1, 줄인 상태 incoming → 따라감, 읽음 1, 버튼 0", async ({
      page,
    }) => {
      const { reads, baseReads } = await openAtBottom(page);
      const shrunk = await resizeTo(page, width, low, `resize-${low}`);
      expect(Math.abs(shrunk.d), `${low} 뒤 밀착`).toBeLessThanOrEqual(1);
      expectLastVisible(shrunk);

      await incoming(page, ROOM_LONG, "창 줄인 뒤 온 글");
      await waitSequence(page, NEW_SEQ);
      await expect
        .poll(() => reads.filter((r) => r.seq === NEW_SEQ).length)
        .toBe(1);
      await frames(page);
      const followed = await record(page, "after-incoming");
      expect(Math.abs(followed.d), "새 글 따라감").toBeLessThanOrEqual(1);
      expect(reads.length - baseReads, "읽음 POST 1").toBe(1);
      await expect(jumpButton(page)).toHaveCount(0);

      const restored = await resizeTo(page, width, high, `resize-${high}`);
      expect(Math.abs(restored.d), `${high} 복원 뒤 밀착`).toBeLessThanOrEqual(
        1,
      );
      expectLastVisible(restored);
    });
  });
}
