import { expect, test } from "@playwright/test";
import {
  beforeSequences,
  bubbles,
  collectPageErrors,
  composer,
  count,
  firstVisible,
  historyButton,
  historyEnd,
  historyFail,
  incoming,
  knob,
  log,
  logMetrics,
  MESSAGES_GET,
  openLongRoom,
  openRoom,
  retryButton,
  ROOM_LONG,
  ROOM_OTHER,
  ROOM_SHORT,
  setScrollTop,
  topOf,
  waitBubbles,
  wheel,
  wheelUpTo,
} from "./helpers";

/**
 * loop-08c #339 S2 — 도매 이전 메시지(자동 + 버튼), 끝, 실패, 오프라인, 처음 열 때 자동 0, 프로그램 스크롤.
 * 순서 역전(S2-6 S2-7 S2-14~S2-16)은 `wholesale-chat-history-race.spec.ts`, 새 메시지 버튼과 읽음 보류는
 * `wholesale-chat-newmsg.spec.ts`.
 */

test("S2-2 방 3 열기 → 3초 before 0 → 휠로 위로 → beforeSequence=71 1회, 21~70 붙음, 첫 보이던 말풍선 제자리(≤ 4px)", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openLongRoom(page);
  await knob(page, "delay", { op: "messages", page: "before", ms: 1500 });
  await page.waitForTimeout(3000);
  expect(await beforeSequences(page)).toEqual([]);

  await wheelUpTo(page);
  await expect.poll(() => beforeSequences(page)).toEqual([71]);
  await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
  /* 응답 전(불러오는 중) 첫 보이는 말풍선과 그 자리 */
  await page.waitForTimeout(300);
  const anchor = await firstVisible(page);
  const before = await topOf(page, anchor);
  await expect(log(page).locator('[data-sequence="21"]')).toBeAttached();
  await expect(log(page).locator('[data-sequence="70"]')).toBeAttached();
  expect(Math.abs((await topOf(page, anchor)) - before)).toBeLessThanOrEqual(4);
  await waitBubbles(page, 100);
  expect(await beforeSequences(page)).toEqual([71]);
  expect(errors).toEqual([]);
});

test("S2-2 키보드: Shift+Tab 으로 `이전 메시지 보기` → Enter → beforeSequence=71 1회(포커스 스크롤은 자동 아님)", async ({
  page,
}) => {
  await openLongRoom(page);
  await composer(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(historyButton(page)).toBeFocused();
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
  await page.waitForTimeout(1500);
  expect(await beforeSequences(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await waitBubbles(page, 100);
  expect(await beforeSequences(page)).toEqual([71]);
  /* 더 있으면 포커스는 같은 버튼(결정 87) */
  await expect(historyButton(page)).toBeFocused();
});

test("S2-3 before 2초 지연 → 위끝 근처 휠 위아래 5번 + 버튼 3연타 → before 1회, aria-busy aria-disabled 불러오는 중", async ({
  page,
}) => {
  await openLongRoom(page);
  await knob(page, "delay", { op: "messages", page: "before", ms: 2000 });
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

test("S2-4 다시 위로(자동) → beforeSequence=21 → 1~20, 버튼 0, `대화 처음이에요`, 120개. 위끝 휠 3번 → before 0. 방 1 은 버튼, 문구 0", async ({
  page,
}) => {
  await openLongRoom(page);
  await wheelUpTo(page);
  await waitBubbles(page, 100);
  await wheelUpTo(page);
  await waitBubbles(page, 120);
  expect(await beforeSequences(page)).toEqual([71, 21]);
  await expect(historyEnd(page)).toBeVisible();
  await expect(historyButton(page)).toHaveCount(0);
  await setScrollTop(page, 0);
  for (let i = 0; i < 3; i++) await wheel(page, -400);
  await page.waitForTimeout(500);
  expect(await beforeSequences(page)).toEqual([71, 21]);

  await openRoom(page, ROOM_SHORT);
  await expect(historyButton(page)).toHaveCount(0);
  await expect(historyEnd(page)).toHaveCount(0);
  for (let i = 0; i < 3; i++) await wheel(page, -400);
  await page.waitForTimeout(500);
  expect(await beforeSequences(page)).toEqual([71, 21]);
});

test("S2-5 before 500 → 자동 1회 실패 → 한 줄 + 다시 시도, 말풍선 그대로, 그 사이 incoming 붙음, 3초 휠 → 0, 다시 시도 → 성공 → 다시 자동 1회", async ({
  page,
}) => {
  await openLongRoom(page);
  await knob(page, "fail", { op: "messages", page: "before", status: 500 });
  await wheelUpTo(page);
  await expect(historyFail(page)).toContainText("이전 메시지를 못 불러왔어요");
  await expect(retryButton(page)).toBeVisible();
  expect(await bubbles(page).count()).toBe(50);
  await incoming(page, ROOM_LONG, "실패 뒤 새 문의");
  await waitBubbles(page, 51);

  await setScrollTop(page, 0);
  for (let i = 0; i < 8; i++) {
    await wheel(page, -400);
    await page.waitForTimeout(300);
  }
  expect(await beforeSequences(page)).toEqual([71]);

  await retryButton(page).click();
  await waitBubbles(page, 101);
  expect(await beforeSequences(page)).toEqual([71, 71]);
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
  await wheelUpTo(page);
  await expect.poll(() => beforeSequences(page)).toEqual([71, 71, 21]);
});

test("S2-5 before 401 → 세션 끊김 줄, 버튼 잠금, 그 뒤 messages 0, 위끝 휠에도 0", async ({
  page,
}) => {
  await openLongRoom(page);
  await knob(page, "fail", { op: "messages", page: "before", status: 401 });
  await wheelUpTo(page);
  await expect(page.locator('[data-ac="S4-7"]')).toBeVisible();
  await expect(historyButton(page)).toBeDisabled();
  await expect(historyFail(page)).toHaveCount(0);
  const after = await count(page, MESSAGES_GET);
  await setScrollTop(page, 0);
  for (let i = 0; i < 5; i++) await wheel(page, -400);
  await page.waitForTimeout(4000);
  expect(await count(page, MESSAGES_GET)).toBe(after);
});

test("S2-8 더 있음 + incoming → 버튼 그대로. 끝 + incoming → 문구 그대로, 버튼 안 살아남. 방 2 → 방 3 → 바닥, 위에 1 있음, before 0", async ({
  page,
}) => {
  await openLongRoom(page);
  await wheelUpTo(page);
  await waitBubbles(page, 100);
  await incoming(page, ROOM_LONG, "더 있을 때");
  await waitBubbles(page, 101);
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");

  await historyButton(page).click();
  await waitBubbles(page, 121);
  await expect(historyEnd(page)).toBeVisible();
  await incoming(page, ROOM_LONG, "끝난 뒤");
  await waitBubbles(page, 122);
  await expect(historyEnd(page)).toBeVisible();
  await expect(historyButton(page)).toHaveCount(0);
  const sent = await beforeSequences(page);

  await openRoom(page, ROOM_OTHER);
  await openRoom(page, ROOM_LONG);
  await waitBubbles(page, 122);
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await setScrollTop(page, 0);
  await expect(log(page).locator('[data-sequence="1"]')).toBeAttached();
  await page.waitForTimeout(500);
  expect(await beforeSequences(page)).toEqual(sent);
});

test("S2-17 오프라인 → 위끝까지(자동) → 요청 0, 실패 한 줄 → 온라인 → 2초 휠에도 0 → 다시 시도 → 1회 성공", async ({
  page,
  context,
}) => {
  await openLongRoom(page);
  await context.setOffline(true);
  await wheelUpTo(page, 0, false);
  await expect(historyFail(page)).toContainText("이전 메시지를 못 불러왔어요");
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

test("S2-19 ① 바닥에서 열고 3초 → before 0, 방 2 → 방 3 다시 열어도 0", async ({
  page,
}) => {
  await openLongRoom(page);
  await page.waitForTimeout(3000);
  await openRoom(page, ROOM_OTHER);
  await openRoom(page, ROOM_LONG);
  await page.waitForTimeout(3000);
  expect(await beforeSequences(page)).toEqual([]);
});

test("S2-19 ② 1280×4000(첫 장이 log 를 못 채움) → 3초 before 0, 버튼 보임 → 누름 1회 → 넘친 뒤 위로 휠이면 자동", async ({
  page,
}) => {
  /* 기획은 1280×3000. 말풍선 50개가 약 3,480px라 3000이면 log를 넘친다 — 못 채우는 높이로 올렸다(02-dev 판단) */
  await page.setViewportSize({ width: 1280, height: 4000 });
  await openLongRoom(page);
  const m = await logMetrics(page);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
  await page.waitForTimeout(3000);
  expect(await beforeSequences(page)).toEqual([]);
  await expect(historyButton(page)).toBeVisible();
  await historyButton(page).click();
  await waitBubbles(page, 100);
  const after = await logMetrics(page);
  expect(after.scrollHeight).toBeGreaterThan(after.clientHeight);
  await wheelUpTo(page);
  await expect.poll(() => beforeSequences(page)).toEqual([71, 21]);
});

for (const key of ["Home", "PageUp", "ArrowUp"] as const) {
  test(`S2-19 ③ log 포커스 + ${key} 로 위끝 200px 안 → 자동 1회`, async ({
    page,
  }) => {
    await openLongRoom(page);
    await log(page).focus();
    for (let i = 0; i < 200; i++) {
      if ((await beforeSequences(page)).length > 0) break;
      await page.keyboard.press(key);
      if (key !== "Home") await page.waitForTimeout(20);
    }
    await waitBubbles(page, 100);
    expect(await beforeSequences(page)).toEqual([71]);
  });
}

test("S2-19 ③ Tab 포커스로 브라우저가 위끝까지 스크롤해도 자동 0 — Enter 를 눌러야 1회", async ({
  page,
}) => {
  await openLongRoom(page);
  await composer(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(historyButton(page)).toBeFocused();
  expect((await logMetrics(page)).scrollTop).toBeLessThanOrEqual(200);
  await page.waitForTimeout(2000);
  expect(await beforeSequences(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect.poll(() => beforeSequences(page)).toEqual([71]);
});

test("S2-20 ① 자동 1회 뒤 사장이 스크롤 안 하면 3초 before 추가 0 ② 위끝 200px 안(프로그램 스크롤) + incoming 2 → before 0", async ({
  page,
}) => {
  await openLongRoom(page);
  await wheelUpTo(page);
  await waitBubbles(page, 100);
  await page.waitForTimeout(3000);
  expect(await beforeSequences(page)).toEqual([71]);

  await setScrollTop(page, 100);
  await incoming(page, ROOM_LONG, "위끝 근처에서", 2);
  await waitBubbles(page, 102);
  await page.waitForTimeout(1000);
  expect(await beforeSequences(page)).toEqual([71]);
});
