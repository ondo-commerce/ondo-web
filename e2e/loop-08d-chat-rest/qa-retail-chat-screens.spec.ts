import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  alignTop,
  assertStubServers,
  chatMock,
  composer,
  historyButton,
  historyFail,
  incoming,
  log,
  logMetrics,
  openHistoryRoom,
  wheelUpTo,
  retryButton,
  roomHead,
  setScrollTop,
  waitBubbles,
} from "./retail-history-helpers";

/**
 * loop-08d QA — 소매 방 화면(S3 S4) 디자인 audit. 와이어프레임 `18_retail-chat/08d_screen{,-fail}-{390,1280}.png`과
 * 같은 상태(맨 위까지 올린 채 불러오는 중 + 새 메시지 2개 / 실패 줄 + 새 메시지 2개)를 실제 화면에 만들고 잰다.
 * 스크린샷: .claude/harness/runs/loop-08d-chat-rest/qa/s4-*.png. `pnpm e2e:stub`.
 */

assertStubServers();

const SHOTS = ".claude/harness/runs/loop-08d-chat-rest/qa";

function jumpButton(page: Page): Locator {
  return page.locator('button[data-ac~="08d:S4-2"]');
}

/** 토큰 클래스를 단 임시 요소의 계산값(같은 토큰이면 같은 값) */
function tokenValue(page: Page, className: string, prop: string) {
  return page.evaluate(
    ([cls, p]) => {
      const probe = document.createElement("span");
      probe.className = cls!;
      document.body.append(probe);
      const v = getComputedStyle(probe).getPropertyValue(p!);
      probe.remove();
      return v;
    },
    [className, prop],
  );
}

function styleOf(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      h: Math.round(r.height),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      font: s.fontSize,
      radius: s.borderTopLeftRadius,
      borderColor: s.borderTopColor,
      color: s.color,
      shadow: s.boxShadow,
      lines: Math.round(r.height / parseFloat(s.lineHeight || "16")),
      whiteSpace: s.whiteSpace,
    };
  });
}

/** 위를 읽는 채 새 메시지 2개 */
async function upWithTwoNew(page: Page) {
  await openHistoryRoom(page);
  await alignTop(page, 100);
  await incoming(page, 1, "도매 답", { count: 2 });
  await expect(log(page).locator('[data-sequence="122"]')).toBeAttached({
    timeout: 8000,
  });
  await expect(jumpButton(page)).toHaveText("새 메시지 2개");
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`QA 디자인 ${viewport.width}`, () => {
    test.use({ viewport });
    const phone = viewport.width === 390;

    test("불러오는 중 + 새 메시지 2개: 자리, 크기, 토큰, 넘침", async ({
      page,
    }) => {
      await upWithTwoNew(page);
      await chatMock(page, "delay", {
        op: "messages",
        page: "before",
        ms: 4000,
      });
      await setScrollTop(page, 0);
      await historyButton(page).click();
      await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");

      const jump = await styleOf(jumpButton(page));
      const slot = await styleOf(historyButton(page));
      const head = await roomHead(page).boundingBox();
      const input = await composer(page).boundingBox();
      const logBox = await log(page).boundingBox();
      if (head === null || input === null || logBox === null)
        throw new Error("자리 없음");
      const overflow = await page.evaluate(() => ({
        x:
          document.scrollingElement!.scrollWidth -
          document.scrollingElement!.clientWidth,
      }));
      const border = await tokenValue(
        page,
        /* Button line(packages/ui)이 쓰는 토큰 — 와이어프레임도 Button line sm */
        "border border-border-strong",
        "border-top-color",
      );
      const radius = await tokenValue(
        page,
        "rounded-button",
        "border-top-left-radius",
      );
      const shadow = await tokenValue(page, "shadow-dropdown", "box-shadow");
      const spinner = await historyButton(page)
        .locator(".animate-spin")
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return { name: s.animationName, prop: s.transitionProperty };
        });
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({
          jump,
          slot,
          headBottom: head.y + head.height,
          inputTop: input.y,
          log: logBox,
          overflow,
          border,
          radius,
          shadow,
          spinner,
        }),
      });

      expect(overflow.x).toBeLessThanOrEqual(0);
      expect(jump.bottom).toBeLessThanOrEqual(input.y);
      expect(jump.left).toBeGreaterThanOrEqual(logBox.x);
      expect(jump.right).toBeLessThanOrEqual(logBox.x + logBox.width);
      expect(slot.top).toBeGreaterThanOrEqual(head.y + head.height);
      expect(jump.h).toBe(phone ? 44 : 28);
      expect(slot.h).toBe(phone ? 44 : 28);
      expect(jump.font).toBe(phone ? "14px" : "12px");
      expect(jump.borderColor).toBe(border);
      expect(slot.borderColor).toBe(border);
      expect(jump.shadow).toBe(shadow);
      expect(jump.radius).toBe(radius);
      expect(slot.radius).toBe(radius);
      /* 버튼 글이 두 줄로 접히지 않는다 */
      expect(jump.whiteSpace).toBe("nowrap");

      await page.screenshot({
        path: `${SHOTS}/s4-loading-${viewport.width}.png`,
      });
      /* 50 + 새 2 + 이전 장 50 */
      await waitBubbles(page, 102);
    });

    test("실패 줄 + 새 메시지 2개: 한 줄, 다시 시도 크기, 경고 글 색 토큰", async ({
      page,
    }) => {
      await upWithTwoNew(page);
      await chatMock(page, "fail", {
        op: "messages",
        page: "before",
        status: 500,
      });
      await setScrollTop(page, 0);
      await historyButton(page).click();
      await expect(historyFail(page)).toBeVisible();

      const row = await styleOf(historyFail(page));
      const retry = await styleOf(retryButton(page));
      const text = await historyFail(page)
        .locator("span")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      const danger = await tokenValue(page, "text-destructive-strong", "color");
      const head = await roomHead(page).boundingBox();
      if (head === null) throw new Error("머리 없음");
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({ row, retry, text, danger }),
      });
      expect(text).toBe(danger);
      expect(retry.h).toBe(phone ? 44 : 28);
      expect(retry.font).toBe(phone ? "14px" : "12px");
      expect(row.top).toBeGreaterThanOrEqual(head.y + head.height);
      /* 글과 버튼이 한 줄: 행 높이 = 버튼 높이 + 위 여백(pt-1, 4px) 안 */
      expect(row.h).toBeLessThanOrEqual(retry.h + 4 + 1);
      await page.screenshot({ path: `${SHOTS}/s4-fail-${viewport.width}.png` });
    });
  });
}

/**
 * 사장 시나리오(폰 390): 지난 대화를 위로 올려 찾는 중 도매 답 2개 → 끌려가지 않음 → 버튼 → 바닥, 입력창 포커스 →
 * 세 줄 쓰는 동안 화면 키보드(창 높이 600) → 마지막 말풍선이 입력창 위에 보인다.
 */
test.describe("QA 사장 시나리오 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("옛 대화 찾기 → 답 2개 → 버튼 → 바닥 → 키보드 열고 세 줄", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await wheelUpTo(page);
    await waitBubbles(page, 100);
    const top = await log(page).evaluate((el) => el.scrollTop);
    await incoming(page, 1, "찾던 거 있어요?", { count: 2 });
    await expect(jumpButton(page)).toHaveText("새 메시지 2개", {
      timeout: 8000,
    });
    expect(
      Math.abs((await log(page).evaluate((el) => el.scrollTop)) - top),
    ).toBeLessThanOrEqual(4);
    await page.screenshot({ path: `${SHOTS}/scenario-up-390.png` });

    await jumpButton(page)
      .tap()
      .catch(() => jumpButton(page).click());
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
    await expect(composer(page)).toBeFocused();
    await composer(page).fill("레드 L\n두 장\n내일 가요");
    await page.setViewportSize({ width: 390, height: 600 });
    const gap = async () => {
      const last = await log(page).evaluate((el) => {
        const nodes = el.querySelectorAll("[data-sequence]");
        return nodes[nodes.length - 1]!.getBoundingClientRect().bottom;
      });
      const input = await composer(page).boundingBox();
      if (input === null) throw new Error("입력창 없음");
      return input.y - last;
    };
    await expect.poll(gap, { timeout: 3000 }).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/scenario-keyboard-390.png` });
  });
});
