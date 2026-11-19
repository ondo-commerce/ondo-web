/* 08e QA 재현 spec, 08f에서 회귀 시험으로 커밋(08f-Q3) */
import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  flushRows,
  flushUntil,
  incoming,
  listRows,
  moreButton,
  NEXT_PAGE_GET,
  openList,
  pauseOnList,
  rowIds,
  runToTick,
  settled,
} from "../loop-08-chat-polish/retail-helpers";

/**
 * loop-08e QA — #364 `/chats` 15초 갱신 중 보던 행 자리, 390 1280 화면 확인. 스크린샷:
 * .claude/harness/runs/loop-08e-chat-rest/qa/s4-*.png. 그리고 08e-N6(첫 장 30행만 받은 채 문서 끝 근처에서 보정이
 * 잘림)을 브라우저로 잰다. `pnpm e2e:stub`. 고정 지연 없음.
 */

assertStubServers();

const SHOTS = ".claude/harness/runs/loop-08e-chat-rest/qa";
const LIST_ROW = 'ul[aria-label="대화 목록"] a[data-room-id]';

async function topOf(page: Page, roomId: number) {
  return page.evaluate(
    ({ selector, roomId }) => {
      const header = document.querySelector("header");
      const row = document.querySelector(
        `${selector}[data-room-id="${roomId}"]`,
      );
      return {
        top: row?.getBoundingClientRect().top ?? Number.NaN,
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
        scrollY: window.scrollY,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    },
    { selector: LIST_ROW, roomId },
  );
}

/** position번째 행 위끝을 헤더 아래끝에 맞춘다. 앱 scroll 리스너가 한 번 돈 뒤 돌아온다. 남은 차이를 돌려준다 */
async function scrollRowToHeader(page: Page, position: number) {
  return page.evaluate(
    ({ selector, position }) =>
      new Promise<number>((resolve) => {
        const header = document.querySelector("header")!;
        const row = document.querySelectorAll(selector)[position - 1]!;
        const off = () =>
          row.getBoundingClientRect().top -
          header.getBoundingClientRect().bottom;
        const dy = off();
        if (Math.abs(dy) < 0.5) return resolve(off());
        window.addEventListener("scroll", () => resolve(off()), {
          once: true,
        });
        window.scrollBy(0, dy);
      }),
    { selector: LIST_ROW, position },
  );
}

async function openAll(page: Page, rooms: number) {
  await openList(page, rooms);
  await pauseOnList(page);
  while ((await listRows(page).count()) < rooms) {
    const n = await listRows(page).count();
    await moreButton(page).click();
    await flushRows(page, Math.min(rooms, n + 30));
  }
  await settled(page, NEXT_PAGE_GET);
}

async function refreshUntilFirst(page: Page, firstId: number) {
  await runToTick(page);
  await flushUntil(page, async () => (await rowIds(page))[0] === firstId);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`QA #364 화면 ${viewport.width}`, () => {
    test.use({ viewport });

    test("35행, 20번째를 헤더 밑에 둔 채 30번째 방 새 말 → 갱신 → 20 자리 그대로", async ({
      page,
    }) => {
      await openAll(page, 35);
      const ids = await rowIds(page);
      const row20 = ids[19]!;
      const row30 = ids[29]!;
      expect(Math.abs(await scrollRowToHeader(page, 20))).toBeLessThan(1);
      const before = await topOf(page, row20);
      await page.screenshot({
        path: `${SHOTS}/s4-before-${viewport.width}.png`,
      });
      await incoming(page, row30, "QA 30번째 방 새 말");
      await refreshUntilFirst(page, row30);
      const after = await topOf(page, row20);
      await page.screenshot({
        path: `${SHOTS}/s4-after-${viewport.width}.png`,
      });
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({ before, after }),
      });
      expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(4);
      expect(after.top).toBeGreaterThanOrEqual(after.headerBottom - 0.5);
      expect(after.overflowX).toBeLessThanOrEqual(0);
    });
  });
}

/* 08e-N6 확인. AC S4-2 글자 그대로(`reset {rooms: 35}`, 더 보기 없이 첫 장 30행)는 이 경우다. 개발은 시험을 35행
   전부로 바꿨다(02-dev-364 §4 1). QA 11-03 재현: 390 이동 34px, 1280 6px(문서 끝에 막힘, scrollY = 최대값).
   08e에서 고쳐졌다. 08f-Q3에서 test.fail을 떼고 회귀 시험으로 둔다 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])
  test.describe(`QA 08e-N6 첫 장 30행 ${viewport.width}`, () => {
    test.use({ viewport });

    test("30행만 받은 채 20번째를 헤더 밑에 두고 30번째 방 새 말 → 20 이동", async ({
      page,
    }) => {
      await openList(page, 35);
      await pauseOnList(page);
      const ids = await rowIds(page);
      const row20 = ids[19]!;
      const row30 = ids[29]!;
      const off = await scrollRowToHeader(page, 20);
      const before = await topOf(page, row20);
      await incoming(page, row30, "QA N6 새 말");
      await refreshUntilFirst(page, row30);
      const after = await topOf(page, row20);
      await page.screenshot({
        path: `${SHOTS}/s4-n6-after-${viewport.width}.png`,
      });
      test.info().annotations.push({
        type: "evidence",
        description: JSON.stringify({ off, before, after }),
      });
      expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(4);
    });
  });
