import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  beforeSequences,
  captureReads,
  composer,
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

  test("R2 바닥에서 창 높이를 줄임(스크롤 없음, 바닥 거리 > 48) → incoming → 따라가지 않고 읽음 0 이어야 한다", async ({
    page,
  }) => {
    const reads = captureReads(page);
    await openLongRoom(page);
    await expect
      .poll(() => reads.filter((r) => r.roomId === ROOM_LONG).length)
      .toBe(1);
    await page.setViewportSize({ width: 1470, height: 700 });
    await page.waitForTimeout(300);
    const shrunk = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({ afterResize: shrunk }),
    });
    expect(shrunk.fromBottom).toBeGreaterThan(48);

    await incoming(page, ROOM_LONG, "창 줄인 뒤");
    await waitBubbles(page, 51);
    await page.waitForTimeout(1000);
    const after = await logMetrics(page);
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({
        afterIncoming: after,
        reads: reads.filter((r) => r.roomId === ROOM_LONG),
      }),
    });
    expect(
      reads.filter((r) => r.roomId === ROOM_LONG),
      "바닥이 아닌데 읽음",
    ).toHaveLength(1);
    await expect(jumpButton(page)).toBeVisible();
  });
});

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
