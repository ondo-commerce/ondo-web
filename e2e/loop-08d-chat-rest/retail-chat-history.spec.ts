import { expect, test, type Page } from "@playwright/test";
import {
  ANY_CHAT,
  assertStubServers,
  BEFORE_GET,
  beforeSequences,
  bubbles,
  chatMock,
  chatNav,
  composer,
  count,
  enterFromList,
  firstVisible,
  historyButton,
  historyEnd,
  historyFail,
  incoming,
  log,
  logMetrics,
  lostAlert,
  MESSAGES_GET,
  openHistoryRoom,
  requests,
  retryButton,
  ROOM_GET,
  ROOM_LONG,
  ROOM_SHORT,
  roomHead,
  roomRow,
  setScrollTop,
  topOf,
  waitBubbles,
  wheel,
  wheelUpTo,
} from "./retail-history-helpers";

/**
 * loop-08d #351 S3 — 소매 이전 메시지(자동 + 버튼), 끝, 실패, 오프라인, 401, 사용자 스크롤만 트리거, 자리 겹침,
 * 다시 연 방의 잠금(S3-11). 순서 역전과 세션 칸(S3-6 S3-7 S3-9)은 `retail-chat-history-race.spec.ts`.
 * `pnpm e2e:stub`.
 */

assertStubServers();

test.describe("S3-2 이전 메시지 자동, 버튼, 끝", () => {
  test("① 열고 3초 before 0 → 휠 위로 → beforeSequence=71&size=50 1회, 21~70, 첫 보이던 말풍선 ≤ 4px → 다시 → 21 → 1~20 대화 처음이에요, 120개 → 위끝 휠 3번 before 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 1500,
    });
    await page.waitForTimeout(3000);
    expect(await beforeSequences(page)).toEqual([]);

    await wheelUpTo(page);
    await expect.poll(() => beforeSequences(page)).toEqual([71]);
    const [first] = await requests(page, BEFORE_GET);
    expect(new URL(first!.url, "http://x").searchParams.get("size")).toBe("50");
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    /* 응답 전(불러오는 중) 첫 보이는 말풍선과 그 자리 */
    await page.waitForTimeout(300);
    const anchor = await firstVisible(page);
    const top = await topOf(page, anchor);
    await waitBubbles(page, 100);
    await expect(log(page).locator('[data-sequence="21"]')).toBeAttached();
    expect(Math.abs((await topOf(page, anchor)) - top)).toBeLessThanOrEqual(4);
    expect(await beforeSequences(page)).toEqual([71]);

    await wheelUpTo(page);
    await waitBubbles(page, 120);
    expect(await beforeSequences(page)).toEqual([71, 21]);
    await expect(historyEnd(page)).toBeVisible();
    await expect(historyButton(page)).toHaveCount(0);
    await setScrollTop(page, 0);
    for (let i = 0; i < 3; i++) await wheel(page, -400);
    await page.waitForTimeout(500);
    expect(await beforeSequences(page)).toEqual([71, 21]);
  });

  test("② 새 reset, 새 페이지 → Tab(Shift+Tab)으로 `이전 메시지 보기` 포커스, 포커스 스크롤에도 before 0 → Enter → 1회", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await composer(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(historyButton(page)).toBeFocused();
    await expect(historyButton(page)).toHaveText("이전 메시지 보기");
    expect((await logMetrics(page)).scrollTop).toBeLessThanOrEqual(200);
    await page.waitForTimeout(1500);
    expect(await beforeSequences(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
    /* 더 있으면 포커스는 같은 버튼 */
    await expect(historyButton(page)).toBeFocused();
  });

  test("③ 방 33(50개 이하)은 버튼, 문구 0, 휠에도 before 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await roomRow(page, ROOM_SHORT).click();
    await expect(page).toHaveURL(`/chats/${ROOM_SHORT}?from=/chats`);
    await expect(bubbles(page).first()).toBeVisible();
    await expect(historyButton(page)).toHaveCount(0);
    await expect(historyEnd(page)).toHaveCount(0);
    for (let i = 0; i < 3; i++) await wheel(page, -400);
    await page.waitForTimeout(500);
    expect(await beforeSequences(page)).toEqual([]);
  });
});

test("S3-3 before 2초 지연 → 위끝 휠 5번 + 버튼 3연타 → before 1회, aria-busy aria-disabled 불러오는 중", async ({
  page,
}) => {
  await openHistoryRoom(page);
  await chatMock(page, "delay", { op: "messages", page: "before", ms: 2000 });
  await wheelUpTo(page);
  for (const dy of [-200, 200, -200, 200, -200]) await wheel(page, dy);
  const button = historyButton(page);
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toHaveText("불러오는 중");
  await expect(button).not.toHaveAttribute("disabled", /.*/);
  for (let i = 0; i < 3; i++) await button.click({ force: true });
  await waitBubbles(page, 100);
  expect(await beforeSequences(page)).toEqual([71]);
  await expect(button).toHaveText("이전 메시지 보기");
});

test.describe("S3-4 실패", () => {
  test("before 500 → 한 줄 + 다시 시도, 말풍선 그대로, incoming 붙음, 3초 위끝 휠 before 0 → 다시 시도 1회 성공 → 위로 스크롤 자동 1회", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await chatMock(page, "fail", {
      op: "messages",
      page: "before",
      status: 500,
    });
    await wheelUpTo(page);
    await expect(historyFail(page)).toContainText(
      "이전 메시지를 못 불러왔어요",
    );
    await expect(retryButton(page)).toBeVisible();
    expect(await bubbles(page).count()).toBe(50);
    await incoming(page, ROOM_LONG, "실패 뒤 새 답");
    await waitBubbles(page, 51);

    await setScrollTop(page, 0);
    for (let i = 0; i < 10; i++) {
      await wheel(page, -400);
      await page.waitForTimeout(240);
    }
    expect(await beforeSequences(page)).toEqual([71]);

    await retryButton(page).click();
    await waitBubbles(page, 101);
    expect(await beforeSequences(page)).toEqual([71, 71]);
    await expect(historyButton(page)).toHaveText("이전 메시지 보기");
    await wheelUpTo(page);
    await expect.poll(() => beforeSequences(page)).toEqual([71, 71, 21]);
  });

  test("오프라인 → 위끝(자동) → 요청 0, 같은 줄 → 온라인 → 2초 휠 before 0 → 다시 시도 1회", async ({
    page,
    context,
  }) => {
    await openHistoryRoom(page);
    await context.setOffline(true);
    await wheelUpTo(page, 0, false);
    await expect(historyFail(page)).toContainText(
      "이전 메시지를 못 불러왔어요",
    );
    expect(await bubbles(page).count()).toBe(50);
    expect(await beforeSequences(page)).toEqual([]);

    await context.setOffline(false);
    for (let i = 0; i < 6; i++) {
      await wheel(page, -400);
      await page.waitForTimeout(300);
    }
    expect(await beforeSequences(page)).toEqual([]);
    await retryButton(page).click();
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
  });
});

test("S3-5 [지금 세션 401, 이전 장] → 끊김 줄, 입력창 읽기 전용, 쓴 글 남음, 맨 위 자리 잠김, 그 뒤 messages 0, 위끝 휠에도 0", async ({
  page,
}) => {
  await openHistoryRoom(page);
  await composer(page).fill("쓰던 글");
  await chatMock(page, "fail", { op: "messages", page: "before", status: 401 });
  await wheelUpTo(page);
  await expect(lostAlert(page)).toBeVisible();
  await expect(composer(page)).toHaveAttribute("readonly", "");
  await expect(composer(page)).toHaveValue("쓰던 글");
  await expect(historyButton(page)).toBeDisabled();
  await expect(historyFail(page)).toHaveCount(0);
  const after = await count(page, MESSAGES_GET);
  await setScrollTop(page, 0);
  for (let i = 0; i < 5; i++) await wheel(page, -400);
  await page.waitForTimeout(4000);
  expect(await count(page, MESSAGES_GET)).toBe(after);
});

test.describe("S3-8 사용자 스크롤만 트리거", () => {
  test("① 열고 3초 before 0, 자동 1회 뒤 스크롤 없이 3초 추가 0, 위끝 200px 안에서 incoming 2 → before 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await page.waitForTimeout(3000);
    expect(await beforeSequences(page)).toEqual([]);
    await wheelUpTo(page);
    await waitBubbles(page, 100);
    await page.waitForTimeout(3000);
    expect(await beforeSequences(page)).toEqual([71]);

    await setScrollTop(page, 100);
    await incoming(page, ROOM_LONG, "위끝 근처에서", { count: 2 });
    await waitBubbles(page, 102);
    await page.waitForTimeout(1000);
    expect(await beforeSequences(page)).toEqual([71]);
  });

  test("② log 포커스 + Home → 자동 1회", async ({ page }) => {
    await openHistoryRoom(page);
    await log(page).focus();
    await page.keyboard.press("Home");
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
  });

  test("③ 휠 위로 한 번(위끝 200px 밖) → 곧바로 Tab 으로 `이전 메시지 보기` 포커스(포커스 스크롤로 200px 안) → 1초 before 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await wheel(page, -400);
    expect((await logMetrics(page)).scrollTop).toBeGreaterThan(200);
    await composer(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(historyButton(page)).toBeFocused();
    expect((await logMetrics(page)).scrollTop).toBeLessThanOrEqual(200);
    await page.waitForTimeout(1000);
    expect(await beforeSequences(page)).toEqual([]);
  });
});

/**
 * 터치(390, `hasTouch`). Playwright 터치스크린은 탭만 있어 CDP `Input.dispatchTouchEvent`로 끈다.
 * 손가락 화면 y가 커지면(아래로 끌면) 내용이 내려와 위 대화가 보인다 — log `scrollTop`이 준다
 */
test.describe("S3-8 ④ 터치 방향(390)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  async function drag(page: Page, ys: number[]): Promise<void> {
    const box = await log(page).boundingBox();
    if (box === null) throw new Error("log 없음");
    const x = box.x + box.width / 2;
    const cdp = await page.context().newCDPSession(page);
    const point = (y: number) => [{ x, y }];
    const first = ys[0]!;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: point(first),
    });
    let y = first;
    for (const target of ys.slice(1)) {
      const step = target > y ? 10 : -10;
      while (y !== target) {
        y += step;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(y),
        });
        await page.waitForTimeout(16);
      }
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(500);
  }

  test("위끝 250px 에서 y 300 → 400(위 스크롤) → scrollTop 감소, before 1회", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    /* 합친 뒤 위치 복원이 scrollTop 을 크게 올린다 — 합치기 전에 재려고 응답을 늦춘다 */
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 2000,
    });
    await setScrollTop(page, 250);
    await page.waitForTimeout(500);
    await drag(page, [300, 400]);
    expect((await logMetrics(page)).scrollTop).toBeLessThan(250);
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
  });

  test("같은 자리에서 y 400 → 300(아래 스크롤) → scrollTop 증가, before 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await setScrollTop(page, 250);
    await page.waitForTimeout(500);
    await drag(page, [400, 300]);
    expect((await logMetrics(page)).scrollTop).toBeGreaterThan(250);
    await page.waitForTimeout(500);
    expect(await beforeSequences(page)).toEqual([]);
  });

  test("한 터치 안 y 400 → 300 → 500 → 둘째 구간부터 위 스크롤, before 1회", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await setScrollTop(page, 250);
    await page.waitForTimeout(500);
    await drag(page, [400, 300, 500]);
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`S3-10 ${viewport.width} 맨 위 자리 겹침, 가로 넘침`, () => {
    test.use({ viewport });

    async function expectSlotBelowHead(page: Page, slot: string) {
      await setScrollTop(page, 0);
      const head = await roomHead(page).boundingBox();
      const box = await log(page).locator(slot).first().boundingBox();
      if (head === null || box === null) throw new Error("자리 없음");
      expect(box.y).toBeGreaterThanOrEqual(head.y + head.height);
      expect(
        await page.evaluate(() => {
          const s = document.scrollingElement!;
          return s.scrollWidth <= s.clientWidth;
        }),
      ).toBe(true);
    }

    test("불러오는 중과 실패 줄 자리 top ≥ 방 머리 bottom, 가로 넘침 0. 390 은 버튼 높이 44, 글자 14", async ({
      page,
    }) => {
      const phone = viewport.width === 390;
      await openHistoryRoom(page);
      await chatMock(page, "delay", {
        op: "messages",
        page: "before",
        ms: 3000,
      });
      await historyButton(page).click();
      await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
      await expectSlotBelowHead(page, 'button[data-ac~="08d:S3-2"]');
      const loading = await historyButton(page).evaluate((el) => ({
        h: el.getBoundingClientRect().height,
        f: getComputedStyle(el).fontSize,
      }));
      expect(loading).toEqual(
        phone ? { h: 44, f: "14px" } : { h: 28, f: "12px" },
      );
      await waitBubbles(page, 100);

      await chatMock(page, "fail", {
        op: "messages",
        page: "before",
        status: 500,
      });
      await historyButton(page).click();
      await expect(historyFail(page)).toBeVisible();
      await expectSlotBelowHead(page, '[data-ac~="08d:S3-4"]');
      const retryH = await retryButton(page).evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      expect(retryH).toBe(phone ? 44 : 28);
    });
  });
}

test("S3-11 [지금 세션 401] 다시 연 방: 방 머리 GET ≤ 1, messages GET ≤ 1 → 끊김 줄, 읽기 전용, 3초 요청 0. 계획 소진 뒤 다시 열면 끊김 0, polling 계속", async ({
  page,
}) => {
  await openHistoryRoom(page);
  await chatMock(page, "fail", { op: "messages", status: 401, times: 3 });
  await expect(lostAlert(page)).toBeVisible({ timeout: 8000 });
  await expect(composer(page)).toHaveAttribute("readonly", "");

  /* 다시 열기 — 계획 2번째가 확인 요청에 걸린다 */
  async function reopen(): Promise<{ room: number; messages: number }> {
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    const room = await count(page, ROOM_GET);
    const messages = await count(page, MESSAGES_GET);
    await enterFromList(page, ROOM_LONG);
    await expect(bubbles(page).first()).toBeVisible();
    return { room, messages };
  }

  for (let round = 0; round < 2; round++) {
    const at = await reopen();
    await expect(lostAlert(page)).toBeVisible({ timeout: 8000 });
    await expect(composer(page)).toHaveAttribute("readonly", "");
    expect((await count(page, ROOM_GET)) - at.room).toBeLessThanOrEqual(1);
    expect((await count(page, MESSAGES_GET)) - at.messages).toBeLessThanOrEqual(
      1,
    );
    const chat = await count(page, ANY_CHAT);
    await page.waitForTimeout(3000);
    expect(await count(page, ANY_CHAT), `${round + 2}번째 잠김 뒤 요청`).toBe(
      chat,
    );
  }

  /* 401 계획 3회 소진 — 다시 열면 확인 요청 200 */
  const at = await reopen();
  await expect
    .poll(() => count(page, MESSAGES_GET), { timeout: 8000 })
    .toBeGreaterThan(at.messages + 1);
  await expect(lostAlert(page)).toHaveCount(0);
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
});
