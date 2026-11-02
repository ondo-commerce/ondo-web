import { expect, test } from "@playwright/test";
import {
  AFTER_GET,
  alignTop,
  beforeSequences,
  bubbles,
  captureReads,
  collectPageErrors,
  composer,
  drawnSequences,
  enterChats,
  gotoChats,
  historyButton,
  incoming,
  knob,
  log,
  logMetrics,
  ME,
  openLongRoom,
  openRoom,
  requests,
  ROOM_LONG,
  ROOM_OTHER,
  scrollToBottom,
  setScrollTop,
  signIn,
  signOut,
  topOf,
  waitBubbles,
} from "./helpers";

/**
 * loop-08c #339 S2 — 이전 장(before)과 polling(after)이 겹칠 때, 응답 전에 방을 옮기거나 내려가거나 보내거나
 * 로그아웃할 때. 순서는 요청별 `delay {page}`로만 만든다(§0 2). "이전 누름"은 버튼으로 시험한다 — 자동과 같은 `fetchOlder`다.
 */

async function expectUnique(page: Parameters<typeof drawnSequences>[0]) {
  const seqs = await drawnSequences(page);
  expect(new Set(seqs).size).toBe(seqs.length);
  return seqs;
}

test("S2-6 before 6초 지연 → 이전 → incoming 60 → after 2장이 먼저 끝 → before 끝. 중복 0, 마지막 180, cursor 180, 끝까지 180", async ({
  page,
}) => {
  await openLongRoom(page);
  /* 기획은 3초. polling 간격도 3초라 after 가 먼저 끝난다는 보장이 없어 6초로 늘렸다(02-dev 판단) */
  await knob(page, "delay", { op: "messages", page: "before", ms: 6000 });
  await historyButton(page).click();
  await expect.poll(() => beforeSequences(page)).toEqual([71]);
  const afterStart = (await requests(page, AFTER_GET)).length;
  await incoming(page, ROOM_LONG, "많이", 60);
  await expect(log(page)).toHaveAttribute("data-cursor", "180", {
    timeout: 6000,
  });
  /* after 가 이어 받은 장이 2개 이상(50 + 10)이고 before 는 아직 안 붙었다 */
  expect(
    (await requests(page, AFTER_GET)).length - afterStart,
  ).toBeGreaterThanOrEqual(2);
  expect(await bubbles(page).count()).toBe(110);
  await waitBubbles(page, 160);
  const seqs = await expectUnique(page);
  expect(seqs.at(-1)).toBe(180);
  await expect(log(page)).toHaveAttribute("data-cursor", "180");

  await historyButton(page).click();
  await waitBubbles(page, 180);
  await expectUnique(page);
  expect(await beforeSequences(page)).toEqual([71, 21]);
});

test("S2-7 after 3초 지연 + incoming → after 기다리는 동안 이전 → before 먼저 끝 → after 끝. 중복 0, cursor 121, 버튼은 before 응답대로", async ({
  page,
}) => {
  await openLongRoom(page);
  await knob(page, "delay", { op: "messages", page: "after", ms: 3000 });
  await incoming(page, ROOM_LONG, "늦은 polling");
  /* after 요청이 날아가는 중(응답 전)일 때 누른다 */
  await expect
    .poll(async () =>
      (await requests(page, AFTER_GET)).some((r) => r.status === null),
    )
    .toBe(true);
  await historyButton(page).click();
  await waitBubbles(page, 100);
  await expect(log(page)).toHaveAttribute("data-cursor", "120");
  await waitBubbles(page, 101);
  await expect(log(page)).toHaveAttribute("data-cursor", "121");
  await expectUnique(page);
  /* before 응답 hasMore true 그대로 — after 응답(hasMore false)이 버튼을 안 지운다 */
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
});

test("S2-14 위로 올린 채 보냄 → 바닥, 버튼 0. before 응답 전 로그아웃 → 같은 계정 로그인 → 70 없음, pageerror 0", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openLongRoom(page);
  await setScrollTop(page, 0);
  await incoming(page, ROOM_LONG, "위에 있는 동안");
  await waitBubbles(page, 51);
  await composer(page).fill("위에서 보냄");
  await composer(page).press("Enter");
  await expect(log(page).getByText("위에서 보냄")).toBeVisible();
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await expect(
    page.locator('[data-ac="08c:S2-1 08c:S2-9 08c:S2-12"]'),
  ).toHaveCount(0);

  await knob(page, "delay", { op: "messages", page: "before", ms: 3000 });
  await historyButton(page).click();
  await expect.poll(() => beforeSequences(page)).toEqual([71]);
  await signOut(page);
  await signIn(page, ME);
  await gotoChats(page);
  await openRoom(page, ROOM_LONG);
  await page.waitForTimeout(3500);
  await expect(log(page).locator('[data-sequence="70"]')).toHaveCount(0);
  expect(await bubbles(page).count()).toBeLessThanOrEqual(53);
  expect(errors).toEqual([]);
});

test("S2-15 before 3초 지연 → 방 3 이전 → 방 2 → 응답 도착. 방 2 변화 0, 방 3 복귀 때 새 요청 0, 바닥, 위에 21~70", async ({
  page,
}) => {
  const reads = captureReads(page);
  await openLongRoom(page);
  await knob(page, "delay", { op: "messages", page: "before", ms: 3000 });
  await historyButton(page).click();
  await expect.poll(() => beforeSequences(page)).toEqual([71]);

  await openRoom(page, ROOM_OTHER);
  const room2Reads = reads.filter((r) => r.roomId === ROOM_OTHER).length;
  const room2Bubbles = await bubbles(page).count();
  const room2Top = (await logMetrics(page)).scrollTop;
  await page.waitForTimeout(3500);
  expect(await bubbles(page).count()).toBe(room2Bubbles);
  expect((await logMetrics(page)).scrollTop).toBe(room2Top);
  expect(reads.filter((r) => r.roomId === ROOM_OTHER).length).toBe(room2Reads);
  await expect(
    page.locator('[data-ac="08c:S2-1 08c:S2-9 08c:S2-12"]'),
  ).toHaveCount(0);

  await openRoom(page, ROOM_LONG);
  await waitBubbles(page, 100);
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await setScrollTop(page, 0);
  await expect(log(page).locator('[data-sequence="21"]')).toBeAttached();
  await expect(log(page).locator('[data-sequence="70"]')).toBeAttached();
  expect(await beforeSequences(page)).toEqual([71]);
});

test.describe("S2-16 이전 누른 뒤 응답 전에", () => {
  test.beforeEach(async ({ page }) => {
    await openLongRoom(page);
    await knob(page, "delay", { op: "messages", page: "before", ms: 3000 });
    await historyButton(page).click();
    await expect.poll(() => beforeSequences(page)).toEqual([71]);
  });

  test("① 바닥까지 내림 → 응답 뒤 바닥 거리 ≤ 1px", async ({ page }) => {
    await scrollToBottom(page);
    await waitBubbles(page, 100);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
  });

  test("② 보냄 → 응답 뒤 바닥, 내 말풍선 보임", async ({ page }) => {
    await composer(page).fill("기다리는 동안 보냄");
    await composer(page).press("Enter");
    await waitBubbles(page, 101);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
    await expect(log(page).getByText("기다리는 동안 보냄")).toBeInViewport();
  });

  test("③ 90 이 위끝이 되게 스크롤 → 응답 뒤 90 top 이동 ≤ 4px(누르기 전 71 자리로 안 돌아감)", async ({
    page,
  }) => {
    await alignTop(page, 90);
    const before = await topOf(page, 90);
    await waitBubbles(page, 100);
    expect(Math.abs((await topOf(page, 90)) - before)).toBeLessThanOrEqual(4);
  });
});

test("S2-14 로그아웃 정리 뒤엔 before 상태도 비어 버튼이 바로 눌린다(불러오는 중 아님)", async ({
  page,
}) => {
  await enterChats(page);
  await openRoom(page, ROOM_LONG);
  await knob(page, "delay", { op: "messages", page: "before", ms: 3000 });
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
  await signOut(page);
  await signIn(page, ME);
  await gotoChats(page);
  await openRoom(page, ROOM_LONG);
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
  await expect(historyButton(page)).not.toHaveAttribute("aria-busy", "true");
});
