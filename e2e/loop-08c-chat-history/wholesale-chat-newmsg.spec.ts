import { expect, test, type Page } from "@playwright/test";
import {
  alignTop,
  captureReads,
  composer,
  historyButton,
  historyFail,
  incoming,
  jumpButton,
  knob,
  log,
  logMetrics,
  openLongRoom,
  roomTitle,
  ROOM_LONG,
  scrollToBottom,
  sendFromOtherDevice,
  setScrollTop,
  setVisibility,
  topOf,
  waitBubbles,
  wheelUpTo,
} from "./helpers";

/**
 * loop-08c #339 S2 — 위치 보존, `새 메시지 N개`, 읽음 보류(Q1 ①), 버튼 자리, 낭독 0.
 * 방 3은 사장이 100까지 읽음 → 열자마자 읽음 120 POST 1회. 그 뒤 수를 센다.
 */

function readsOf(reads: { roomId: number; seq: number }[]) {
  return reads.filter((r) => r.roomId === ROOM_LONG);
}

/** 열 때의 읽음(120)이 끝날 때까지 */
async function openSettled(
  page: Page,
  reads: { roomId: number; seq: number }[],
) {
  await openLongRoom(page);
  await expect.poll(() => readsOf(reads).map((r) => r.seq)).toEqual([120]);
}

test("S2-9 100 을 위끝에(바닥까지 ≥ 200) → incoming 2 → 읽음 0, 100 제자리, `새 메시지 2개, 아래로 이동` → 누름 → 바닥, 읽음 122 1회, 버튼 0, 포커스 입력창", async ({
  page,
}) => {
  const reads = captureReads(page);
  await openSettled(page, reads);
  await alignTop(page, 100);
  expect((await logMetrics(page)).fromBottom).toBeGreaterThanOrEqual(200);
  const top = await topOf(page, 100);

  await incoming(page, ROOM_LONG, "위에 있을 때", 2);
  await waitBubbles(page, 52);
  await expect(jumpButton(page)).toHaveAccessibleName(
    "새 메시지 2개, 아래로 이동",
  );
  await expect(jumpButton(page)).toHaveText("새 메시지 2개");
  expect(Math.abs((await topOf(page, 100)) - top)).toBeLessThanOrEqual(4);
  await page.waitForTimeout(3500);
  expect(readsOf(reads)).toHaveLength(1);

  await jumpButton(page).click();
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await expect.poll(() => readsOf(reads).map((r) => r.seq)).toEqual([120, 122]);
  await expect(jumpButton(page)).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
});

test("S2-9 버튼 대신 직접 바닥까지 스크롤해도 읽음 1회", async ({ page }) => {
  const reads = captureReads(page);
  await openSettled(page, reads);
  await alignTop(page, 100);
  await incoming(page, ROOM_LONG, "위에 있을 때");
  await waitBubbles(page, 51);
  await expect(jumpButton(page)).toHaveText("새 메시지 1개");
  expect(readsOf(reads)).toHaveLength(1);
  await scrollToBottom(page);
  await expect.poll(() => readsOf(reads).map((r) => r.seq)).toEqual([120, 121]);
  await expect(jumpButton(page)).toHaveCount(0);
});

test("S2-10 바닥에서 incoming 8개(300자, 묶음 > log) → 바닥 거리 ≤ 1, 마지막 말풍선 log 안, 읽음 1회, 버튼 0", async ({
  page,
}) => {
  const reads = captureReads(page);
  await openSettled(page, reads);
  const { clientHeight } = await logMetrics(page);
  await incoming(page, ROOM_LONG, "가".repeat(300), 8);
  await waitBubbles(page, 58);
  const batch = await log(page).evaluate((el) => {
    let sum = 0;
    for (let s = 121; s <= 128; s++)
      sum +=
        el.querySelector(`[data-sequence="${s}"]`)?.getBoundingClientRect()
          .height ?? 0;
    return sum;
  });
  expect(batch).toBeGreaterThan(clientHeight);
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  const inside = await log(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const last = el
      .querySelector('[data-sequence="128"]')
      ?.getBoundingClientRect();
    return (
      last !== undefined && last.top >= box.top && last.bottom <= box.bottom
    );
  });
  expect(inside).toBe(true);
  await expect.poll(() => readsOf(reads).map((r) => r.seq)).toEqual([120, 128]);
  await expect(jumpButton(page)).toHaveCount(0);
});

test("S2-11 위로 올린 채 숨김 → incoming → 복귀 → 새 메시지 1개, 읽음 0. 바닥이면 1회. 읽음 500 → 다음 polling 때 1회 더, 위에선 0", async ({
  page,
}) => {
  const reads = captureReads(page);
  await openSettled(page, reads);
  await setScrollTop(page, 0);
  await setVisibility(page, "hidden");
  await incoming(page, ROOM_LONG, "숨김 중");
  await page.waitForTimeout(3500);
  await setVisibility(page, "visible");
  await waitBubbles(page, 51);
  await expect(jumpButton(page)).toHaveText("새 메시지 1개");
  await page.waitForTimeout(1000);
  expect(readsOf(reads)).toHaveLength(1);

  /* 바닥으로 내려 121 읽음 → 바닥에서 숨김 → incoming → 복귀 → 1회 */
  await scrollToBottom(page);
  await expect.poll(() => readsOf(reads).map((r) => r.seq)).toEqual([120, 121]);
  await setVisibility(page, "hidden");
  await incoming(page, ROOM_LONG, "바닥에서 숨김 중");
  await page.waitForTimeout(3500);
  await setVisibility(page, "visible");
  await waitBubbles(page, 52);
  await expect
    .poll(() => readsOf(reads).map((r) => r.seq))
    .toEqual([120, 121, 122]);

  /* 읽음 500 → 다음 polling 응답 때 다시 1회 */
  await knob(page, "fail", { op: "read", status: 500 });
  await incoming(page, ROOM_LONG, "읽음 실패");
  /* 실패한 1회 + 다음 캐시 갱신(polling 응답, 또는 그 직후 방 머리 합치기) 때 1회. 그 뒤로는 안 늘어난다 */
  await expect.poll(() => readsOf(reads).length, { timeout: 8000 }).toBe(5);
  expect(
    readsOf(reads)
      .slice(3)
      .map((r) => r.seq),
  ).toEqual([123, 123]);
  await page.waitForTimeout(3500);
  expect(readsOf(reads)).toHaveLength(5);

  /* 위로 올린 동안은 0 */
  await setScrollTop(page, 0);
  await incoming(page, ROOM_LONG, "위에서");
  await waitBubbles(page, 54);
  await page.waitForTimeout(3500);
  expect(readsOf(reads)).toHaveLength(5);
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`S2-12 ${size.width}×${size.height} 새 메시지 버튼 bottom ≤ 입력창 top, 좌우 log 안. 맨 위에서 불러오는 중, 실패 줄 top ≥ 방 머리 bottom. 다른 기기 글만 → 아래로 이동`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openLongRoom(page);

    await setScrollTop(page, 0);
    await sendFromOtherDevice(page, ROOM_LONG, "다른 기기에서 보냄");
    await waitBubbles(page, 51);
    await expect(jumpButton(page)).toHaveAccessibleName("아래로 이동");
    await expect(jumpButton(page)).toHaveText("아래로 이동");

    await incoming(page, ROOM_LONG, "소매 글");
    await waitBubbles(page, 52);
    await expect(jumpButton(page)).toHaveText("새 메시지 1개");
    const button = await jumpButton(page).boundingBox();
    const input = await composer(page).boundingBox();
    const logBox = await log(page).boundingBox();
    if (button === null || input === null || logBox === null)
      throw new Error("상자 없음");
    expect(button.y + button.height).toBeLessThanOrEqual(input.y);
    expect(button.x).toBeGreaterThanOrEqual(logBox.x);
    expect(button.x + button.width).toBeLessThanOrEqual(
      logBox.x + logBox.width,
    );

    const head = await roomTitle(page).boundingBox();
    if (head === null) throw new Error("방 머리 없음");
    await knob(page, "delay", { op: "messages", page: "before", ms: 3000 });
    await scrollToBottom(page);
    await wheelUpTo(page);
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    await setScrollTop(page, 0);
    const busy = await historyButton(page).boundingBox();
    expect(busy?.y ?? -1).toBeGreaterThanOrEqual(head.y + head.height);
    await waitBubbles(page, 102);

    await knob(page, "fail", { op: "messages", page: "before", status: 500 });
    await wheelUpTo(page);
    await expect(historyFail(page)).toBeVisible();
    await setScrollTop(page, 0);
    const fail = await historyFail(page).boundingBox();
    expect(fail?.y ?? -1).toBeGreaterThanOrEqual(head.y + head.height);
  });
}

test("S2-13 live 영역 변경 기록: 옛 메시지 자동, 버튼으로 붙이는 동안 0, 위로 올린 채 incoming 1 → 1(새 span)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const records: string[] = [];
    (window as unknown as { __live: string[] }).__live = records;
    new MutationObserver((list) => {
      for (const m of list) {
        const target =
          m.target instanceof Element ? m.target : m.target.parentElement;
        if (target?.closest('[data-ac~="08c:S2-13"]') == null) continue;
        for (const node of m.addedNodes) records.push(node.nodeName);
        if (m.type === "characterData") records.push("#text");
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  const live = () =>
    page.evaluate(() => (window as unknown as { __live: string[] }).__live);
  await openLongRoom(page);
  await page.waitForTimeout(500);
  expect(await live()).toEqual([]);

  await wheelUpTo(page);
  await waitBubbles(page, 100);
  await historyButton(page).click();
  await waitBubbles(page, 120);
  expect(await live()).toEqual([]);

  await setScrollTop(page, 0);
  await incoming(page, ROOM_LONG, "새 문의 하나");
  await waitBubbles(page, 121);
  await expect.poll(live).toEqual(["SPAN"]);
});
