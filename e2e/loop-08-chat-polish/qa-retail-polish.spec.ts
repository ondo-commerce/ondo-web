import { expect, test } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  composer,
  count,
  counterpartRead,
  enterFromList,
  expectRows,
  FIRST_PAGE_GET,
  flushUntil,
  listRows,
  log,
  moreBox,
  moreButton,
  NEXT_PAGE_GET,
  openList,
  pauseOnList,
  readMarkSequences,
  readMarks,
  rowIds,
  settled,
  start,
  waitCount,
} from "./retail-helpers";

/**
 * loop-08 QA(소매). `pnpm e2e:stub`(이름에 `retail`). 개발 spec과 겹치지 않는 경우만 둔다.
 *
 * - 사장 시나리오 (c) 390 폭 `더 보기` 높이 44, 글자 14(02-dev S4 부채 2 — 개발은 클래스만 두고 안 쟀다), 잠김 모양
 * - 반복 패턴 3(왕복 소실): `더 보기`로 35행을 본 뒤 방에 들어갔다 `채팅 목록`으로 돌아오면 35행이 남는가
 * - 소매 읽음 390: 시각 줄 안이라 줄이 안 늘고, 맨 아래 `읽음`이 입력창 위
 */

assertStubServers();

const QA_DIR = ".claude/harness/runs/loop-08-chat-polish/qa";

test("QA-c1 390 폭: 더 보기 높이 44 글자 14, 갱신 중 잠김은 글자 그대로", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openList(page, 35);
  await expectRows(page, 30);
  await moreButton(page).scrollIntoViewIfNeeded();
  const idle = await moreButton(page).evaluate((b) => {
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return { h: r.height, w: r.width, font: s.fontSize };
  });
  expect(idle.h).toBe(44);
  expect(idle.font).toBe("14px");
  await page.screenshot({ path: `${QA_DIR}/qa-r-more-390.png` });

  const first0 = await pauseOnList(page);
  await chatMock(page, "delay", { op: "rooms", ms: 5_000 });
  await page.clock.runFor(16_000);
  await waitCount(page, FIRST_PAGE_GET, first0 + 1);
  await flushUntil(page, async () => moreButton(page).isDisabled());
  await expect(moreBox(page)).toHaveAttribute("data-more", "locked");
  await expect(moreButton(page)).toHaveText("더 보기");
  const locked = await moreButton(page).evaluate(
    (b) => b.getBoundingClientRect().height,
  );
  expect(locked).toBe(44);
  await page.screenshot({ path: `${QA_DIR}/qa-r-more-locked-390.png` });

  await page.clock.runFor(5_000);
  await settled(page, FIRST_PAGE_GET);
  await flushUntil(page, async () => moreButton(page).isEnabled());
  await moreButton(page).click();
  await flushUntil(page, async () => (await listRows(page).count()) === 35);
  await expectRows(page, 35);
  expect(await count(page, NEXT_PAGE_GET)).toBe(1);
});

test("QA-c2 왕복: 더 보기로 35행 → 맨 아래 방 → 채팅 목록으로 돌아와도 35행, 겹침 0", async ({
  page,
}) => {
  await openList(page, 35);
  await moreButton(page).click();
  await expect(listRows(page)).toHaveCount(35);
  const ids = await rowIds(page);
  const last = ids.at(-1) ?? 0;
  await listRows(page).last().click();
  await expect(page).toHaveURL(`/chats/${last}?from=/chats`);
  await expect(log(page)).toBeVisible();
  await page.getByRole("link", { name: "채팅 목록", exact: true }).click();
  await expect(page).toHaveURL("/chats");
  /* 돌아온 순간(캐시) 그리고 다시 받은 뒤 모두 35 */
  await expectRows(page, 35);
  await settled(page, FIRST_PAGE_GET);
  await settled(page, NEXT_PAGE_GET);
  await expectRows(page, 35);
  expect(await rowIds(page)).toEqual(ids);
});

test("QA-r1 390 폭 소매 방: 읽음은 시각 줄 안(말풍선 높이 그대로), 맨 아래 읽음은 입력창 위", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, "/");
  await enterFromList(page, 33);
  await expect(bubbles(page)).toHaveCount(6);
  await expect(readMarks(page)).toHaveCount(0);
  const bubble6 = log(page).locator('[data-sequence="6"]');
  const h0 = await bubble6.evaluate((el) => el.getBoundingClientRect().height);

  await counterpartRead(page, 33, 7);
  await expect.poll(() => readMarkSequences(page)).toEqual([6]);
  await expect(readMarks(page)).toHaveCount(1);
  const h1 = await bubble6.evaluate((el) => el.getBoundingClientRect().height);
  expect(h1, "읽음이 붙어도 말풍선 높이 그대로").toBe(h0);
  await log(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const mark = await readMarks(page).boundingBox();
  const input = await composer(page).boundingBox();
  expect(mark).not.toBeNull();
  expect(input).not.toBeNull();
  expect((mark?.y ?? 0) + (mark?.height ?? 0)).toBeLessThanOrEqual(
    input?.y ?? -1,
  );
  await page.screenshot({ path: `${QA_DIR}/qa-r-read-390.png` });
});
