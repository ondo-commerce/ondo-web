import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  AFTER_GET,
  beforeSequences,
  captureReads,
  composer,
  count,
  historyButton,
  historyEnd,
  historyFail,
  incoming,
  jumpButton,
  knob,
  log,
  logMetrics,
  openLongRoom,
  ROOM_LONG,
  roomTitle,
  setScrollTop,
  settled,
  topOf,
  waitBubbles,
  wheel,
  wheelUpTo,
} from "./helpers";

/**
 * loop-08c QA — 도매 이전 메시지(#339 S2). 개발 e2e가 안 본 것만.
 *
 * 1. 리뷰 R1, R2 브라우저 재현. QA 때는 `test.fail`로 결함을 확인했고, review-fix에서 고친 뒤 표시를 뗐다(회귀 시험).
 *    잡은 요소를 `evidence`로 남긴다(QA 규칙 8).
 * 2. S2-19 끝 "터치, 스크롤바 드래그"(개발이 수동으로 넘긴 갈래). 터치는 CDP `synthesizeScrollGesture`(touch),
 *    스크롤바는 log 오른쪽 끝을 마우스로 눌러 끈다.
 * 3. 왕복 소실(반복 패턴 3): 위에서 `새 메시지 N개`가 뜬 뒤 이전 장이 붙어도 N과 버튼이 그대로인가.
 * 4. 디자인 토큰 실측(1470, 1280). `QA_SHOT_DIR`이 있으면 스크린샷과 실측 JSON을 남긴다.
 */

const SHOT = process.env.QA_SHOT_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOT) await page.screenshot({ path: `${SHOT}/${name}.png` });
}

/** 지금 포커스가 있는 요소(태그, 이름, data-ac) — locator가 무엇을 잡았는지 증거 */
function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName ?? null,
      text: el?.textContent?.trim() ?? null,
      ac: el?.getAttribute("data-ac") ?? null,
      ariaLabel: el?.getAttribute("aria-label") ?? null,
      url: location.pathname + location.search,
    };
  });
}

test.describe("리뷰 재현", () => {
  test("R1 휠로 조금 올림(scrollTop > 200) → 입력창 → Shift+Tab 포커스 스크롤 → before 0 이어야 한다", async ({
    page,
  }) => {
    await openLongRoom(page);
    /* 위로 한 번만(200px 밖에 멈춤). 자동이 걸리지 않을 만큼 */
    await wheel(page, -300);
    const m = await logMetrics(page);
    expect(m.scrollTop).toBeGreaterThan(200);
    await page.waitForTimeout(500);
    expect(await beforeSequences(page)).toEqual([]);

    await composer(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(historyButton(page)).toBeFocused();
    const evidence = {
      focused: await focused(page),
      scrollTop: (await logMetrics(page)).scrollTop,
    };
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify(evidence),
    });
    await page.waitForTimeout(1500);
    expect(
      await beforeSequences(page),
      "Tab 포커스 스크롤은 자동이 아님",
    ).toEqual([]);
  });

  /* R2를 둘로 나눴다(loop-08h S1-6, #386). 원래 시험은 "바닥에서 창을 줄이면 바닥 거리 > 48"을 단언했는데, 그건 결함
     (log가 준 만큼 바닥에서 멀어져 새 글을 안 따라가고 읽음을 보류)을 고정한 값이었다. 08h가 ① 바꾸기 전 바닥이면 먼저
     붙이고 ② 다시 재게 고쳐서 바닥 출발은 바닥에 남는다. R2가 막던 것("바닥이 아닌데 따라가기와 읽음")은 위 출발에서
     그대로 본다. 원래 단언은 `test.fail`로 남기지 않는다 — 결함을 고정한 단언이라 남기면 고친 동작을 실패로 센다
     (기획 08h §4-1, 08g 배운 것 5의 유일한 예외). 고정 지연 2개는 값 대기(clientHeight 변화 + 두 프레임, polling 1회)로 */
  test("R2 바닥에서 창 높이를 줄임 → 바닥 유지(|d| ≤ 1) → incoming → 따라감, 읽음 +1", async ({
    page,
  }) => {
    const reads = captureReads(page);
    await openLongRoom(page);
    await expect
      .poll(() => reads.filter((r) => r.roomId === ROOM_LONG).length)
      .toBe(1);
    await shrinkTo700(page);
    const shrunk = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({ afterResize: shrunk }),
    });
    expect(Math.abs(shrunk.fromBottom)).toBeLessThanOrEqual(1);

    await incoming(page, ROOM_LONG, "창 줄인 뒤");
    await waitBubbles(page, 51);
    await nextPoll(page);
    const after = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({
        afterIncoming: after,
        reads: reads.filter((r) => r.roomId === ROOM_LONG),
      }),
    });
    expect(Math.abs(after.fromBottom), "새 글 따라감").toBeLessThanOrEqual(1);
    expect(reads.filter((r) => r.roomId === ROOM_LONG)).toEqual([
      { roomId: ROOM_LONG, seq: 120 },
      { roomId: ROOM_LONG, seq: 121 },
    ]);
    await expect(jumpButton(page)).toHaveCount(0);
  });

  test("R2 위에서 창 높이를 줄임 → incoming 직전 바닥 거리 > 48 → 따라가지 않고 읽음 0, 버튼", async ({
    page,
  }) => {
    const reads = captureReads(page);
    await openLongRoom(page);
    await expect
      .poll(() => reads.filter((r) => r.roomId === ROOM_LONG).length)
      .toBe(1);
    /* 휠로 300px 올린다(바닥 판정 밖, 자동 불러오기 200px 밖) */
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeGreaterThanOrEqual(200);
    await shrinkTo700(page);
    const shrunk = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({ afterResize: shrunk }),
    });
    expect(shrunk.fromBottom, "incoming 직전 바닥 아님").toBeGreaterThan(48);

    await incoming(page, ROOM_LONG, "창 줄인 뒤");
    await waitBubbles(page, 51);
    await nextPoll(page);
    const after = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({
        afterIncoming: after,
        reads: reads.filter((r) => r.roomId === ROOM_LONG),
      }),
    });
    expect(
      Math.abs(after.scrollTop - shrunk.scrollTop),
      "따라가기 0",
    ).toBeLessThanOrEqual(4);
    expect(
      reads.filter((r) => r.roomId === ROOM_LONG),
      "바닥이 아닌데 읽음",
    ).toHaveLength(1);
    await expect(jumpButton(page)).toBeVisible();
  });
});

/** 창 1470×700. log 높이가 바뀐 걸 보고 두 프레임(ResizeObserver 콜백과 뒤따르는 scroll이 다 돈 다음) */
async function shrinkTo700(page: Page): Promise<void> {
  const before = (await logMetrics(page)).clientHeight;
  await page.setViewportSize({ width: 1470, height: 700 });
  await expect
    .poll(async () => (await logMetrics(page)).clientHeight)
    .toBeLessThan(before);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** polling 한 번이 더 나가고 응답까지. 읽음 POST가 날 틈을 고정 지연 대신 이걸로 준다 */
async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, AFTER_GET);
  await expect
    .poll(() => count(page, AFTER_GET), { timeout: 10_000 })
    .toBeGreaterThan(before);
  await settled(page, AFTER_GET);
}

test.describe("S2-19 사용자 스크롤 — 터치, 스크롤바 드래그", () => {
  test("스크롤바 드래그로 위끝 200px 안 → 자동 1회", async ({ playwright }) => {
    /* Playwright headless는 기본 인자 --hide-scrollbars로 스크롤바를 숨긴다. 그 인자를 빼고 따로 띄운다 */
    const browser = await playwright.chromium.launch({
      ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    const context = await browser.newContext({
      viewport: { width: 1470, height: 900 },
      baseURL: "http://localhost:3100",
      locale: "ko-KR",
    });
    const page = await context.newPage();
    await openLongRoom(page);
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    const scrollbar = await log(page).evaluate(
      (el) => el.offsetWidth - el.clientWidth,
    );
    test.info().annotations.push({
      type: "evidence",
      description: `스크롤바 폭 ${scrollbar}px`,
    });
    /* Playwright headless Chromium은 스크롤바를 숨긴다(폭 0) — 그때는 끌 손잡이가 없어 수동 확인으로 남긴다 */
    test.skip(
      scrollbar === 0,
      "headless 스크롤바 폭 0 — 스크롤바 드래그는 수동(headed) 확인",
    );
    /* 바닥이라 손잡이는 맨 아래. 오른쪽 끝 아래쪽을 잡고 위로 끈다 */
    const x = box.x + box.width - scrollbar / 2;
    await page.mouse.move(x, box.y + box.height - 10);
    await page.mouse.down();
    for (let y = box.height - 10; y >= 0; y -= 40)
      await page.mouse.move(x, box.y + y);
    await page.mouse.move(x, box.y + 1);
    await page.mouse.up();
    expect((await logMetrics(page)).scrollTop).toBeLessThanOrEqual(200);
    await expect.poll(() => beforeSequences(page)).toEqual([71]);
    await browser.close();
  });

  test("터치 스크롤(CDP touch 제스처)로 위로 → 자동 1회", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1470, height: 900 },
      baseURL: "http://localhost:3100",
      locale: "ko-KR",
    });
    const page = await context.newPage();
    await openLongRoom(page);
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    await page.evaluate(() => {
      (window as unknown as { __touch: number }).__touch = 0;
      document.addEventListener(
        "touchmove",
        () => {
          (window as unknown as { __touch: number }).__touch += 1;
        },
        { capture: true, passive: true },
      );
    });
    const cdp = await context.newCDPSession(page);
    for (let i = 0; i < 8; i++) {
      if ((await beforeSequences(page)).length > 0) break;
      await cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 3),
        yDistance: 600,
        gestureSourceType: "touch",
        speed: 3000,
      });
    }
    const touches = await page.evaluate(
      () => (window as unknown as { __touch: number }).__touch,
    );
    test.info().annotations.push({
      type: "evidence",
      description: `touchmove ${touches}회, scrollTop ${(await logMetrics(page)).scrollTop}`,
    });
    expect(touches).toBeGreaterThan(0);
    await expect.poll(() => beforeSequences(page)).toEqual([71]);
    await context.close();
  });
});

test("M4 Shift+Tab으로 맨 위 버튼(포커스 스크롤) → 터치로 아래로 조금(scrollTop ≤ 200 유지) → before 0", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1470, height: 900 },
    baseURL: "http://localhost:3100",
    locale: "ko-KR",
  });
  const page = await context.newPage();
  await openLongRoom(page);
  await composer(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(historyButton(page)).toBeFocused();
  await expect.poll(async () => (await logMetrics(page)).scrollTop).toBe(0);
  const box = await log(page).boundingBox();
  if (box === null) throw new Error("log 없음");
  const cdp = await context.newCDPSession(page);
  /* yDistance 음수 = 손가락을 위로 = 내용이 위로 = 아래로 스크롤 */
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    yDistance: -100,
    gestureSourceType: "touch",
    speed: 800,
  });
  await page.waitForTimeout(1_500);
  /* 자동이 걸리면 이전 장이 붙어 scrollTop이 커진다 — 요청을 먼저 본다 */
  expect(await beforeSequences(page), "아래로 끈 터치는 자동이 아님").toEqual(
    [],
  );
  const after = (await logMetrics(page)).scrollTop;
  test.info().annotations.push({
    type: "evidence",
    description: `터치 뒤 scrollTop ${after}`,
  });
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThanOrEqual(200);
  await context.close();
});

test("패턴 3: 위에서 `새 메시지 2개` → 자동으로 이전 장이 붙어도 N, 버튼, 읽음 보류 그대로", async ({
  page,
}) => {
  const reads = captureReads(page);
  await openLongRoom(page);
  await expect
    .poll(() => reads.filter((r) => r.roomId === ROOM_LONG).length)
    .toBe(1);
  await setScrollTop(page, 1200);
  await incoming(page, ROOM_LONG, "위에 있을 때", 2);
  await waitBubbles(page, 52);
  await expect(jumpButton(page)).toHaveText("새 메시지 2개");

  await wheelUpTo(page);
  await waitBubbles(page, 102);
  await expect(jumpButton(page)).toHaveText("새 메시지 2개");
  await expect(jumpButton(page)).toHaveAccessibleName(
    "새 메시지 2개, 아래로 이동",
  );
  await page.waitForTimeout(1000);
  expect(reads.filter((r) => r.roomId === ROOM_LONG)).toHaveLength(1);
});

/** 토큰 이름 → 계산된 값. 같은 속성에 var()를 넣은 임시 요소로 브라우저가 푼 값을 읽는다 */
async function resolved(page: Page, prop: string, token: string) {
  return page.evaluate(
    ({ prop, token }) => {
      const probe = document.createElement("div");
      probe.style.setProperty(prop, `var(${token})`);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    { prop, token },
  );
}

for (const width of [1470, 1280] as const) {
  test(`디자인 실측 ${width}: 불러오는 중, 실패 줄, 끝 문구, 새 메시지 버튼 토큰과 자리`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width,
      height: width === 1470 ? 900 : 800,
    });
    await openLongRoom(page);
    const out: Record<string, unknown> = { width };
    const headBottom = await roomTitle(page).evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );

    /* 불러오는 중(맨 위) */
    await knob(page, "delay", { op: "messages", page: "before", ms: 4000 });
    await wheelUpTo(page);
    await setScrollTop(page, 0);
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    out.loading = await historyButton(page).evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        height: r.height,
        borderRadius: s.borderRadius,
        color: s.color,
        borderColor: s.borderTopColor,
        opacity: s.opacity,
        fontSize: s.fontSize,
      };
    });
    expect((out.loading as { top: number }).top).toBeGreaterThanOrEqual(
      headBottom,
    );
    expect((out.loading as { opacity: string }).opacity).toBe("1");
    await shot(page, `s2-loading-${width}`);
    await waitBubbles(page, 100);

    /* 새 메시지 버튼 */
    await setScrollTop(page, 1500);
    await incoming(page, ROOM_LONG, "디자인 실측", 2);
    await waitBubbles(page, 102);
    await expect(jumpButton(page)).toBeVisible();
    const shadow = await resolved(page, "box-shadow", "--shadow-dropdown");
    out.jump = await jumpButton(page).evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const logBox = document
        .querySelector('[role="log"]')
        ?.getBoundingClientRect();
      return {
        boxShadow: s.boxShadow,
        borderRadius: s.borderRadius,
        height: r.height,
        gapToLogBottom: logBox ? logBox.bottom - r.bottom : null,
        bottom: r.bottom,
        centerOffset: logBox
          ? r.left + r.width / 2 - (logBox.left + logBox.width / 2)
          : null,
      };
    });
    const inputBox = await composer(page).boundingBox();
    const jump = {
      ...(out.jump as {
        boxShadow: string;
        gapToLogBottom: number;
        bottom: number;
        centerOffset: number;
      }),
      inputTop: inputBox?.y ?? Number.NaN,
    };
    out.jump = jump;
    /* theme.css `--shadow-dropdown` = 0 4px 12px 검정 8%. @theme 토큰이라 :root 변수로는 안 풀린다(shadow = "none") —
       Tailwind가 앞에 빈 링 그림자 4겹을 붙이므로 마지막 겹을 본다 */
    out.shadowVar = shadow;
    expect(jump.boxShadow).toMatch(/oklab\(0 0 0 \/ 0\.08\) 0px 4px 12px 0px$/);
    expect(Math.round(jump.gapToLogBottom)).toBe(12);
    expect(jump.bottom).toBeLessThanOrEqual(jump.inputTop);
    expect(Math.abs(jump.centerOffset)).toBeLessThanOrEqual(1);
    await shot(page, `s2-jump-${width}`);

    /* 끝 문구 */
    await wheelUpTo(page);
    await waitBubbles(page, 122);
    await expect(historyEnd(page)).toBeVisible();
    const muted = await resolved(page, "color", "--color-muted-foreground");
    out.end = await historyEnd(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, fontSize: s.fontSize, textAlign: s.textAlign };
    });
    expect((out.end as { color: string }).color).toBe(muted);
    expect((out.end as { fontSize: string }).fontSize).toBe("12px");
    await setScrollTop(page, 0);
    await shot(page, `s2-end-${width}`);
    if (SHOT)
      writeFileSync(
        `${SHOT}/design-measure-${width}.json`,
        JSON.stringify(out, null, 2),
      );
  });

  test(`디자인 실측 ${width}: 실패 줄 색, 크기, 자리`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: width === 1470 ? 900 : 800,
    });
    await openLongRoom(page);
    const headBottom = await roomTitle(page).evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );
    await knob(page, "fail", { op: "messages", page: "before", status: 500 });
    await wheelUpTo(page);
    await expect(historyFail(page)).toBeVisible();
    await setScrollTop(page, 0);
    const strong = await resolved(page, "color", "--color-destructive-strong");
    const line = await historyFail(page)
      .getByText("이전 메시지를 못 불러왔어요", { exact: true })
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          fontSize: s.fontSize,
          top: el.getBoundingClientRect().top,
        };
      });
    expect(line.color).toBe(strong);
    expect(line.fontSize).toBe("12px");
    expect(line.top).toBeGreaterThanOrEqual(headBottom);
    await shot(page, `s2-fail-${width}`);
  });
}
