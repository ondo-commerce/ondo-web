import { expect, test, type Page } from "@playwright/test";
import {
  appAlert,
  assertStubServers,
  chatMock,
  FIRST_PAGE_GET,
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
 * #364 S4 — 소매 `/chats` 15초 갱신 중 보던 행 자리(기획 §4-4). 기대값은 전부 **기준 행의 갱신 전 top 대비
 * 이동량 ≤ 4px**이다(절대 위치 아님). 갱신은 멈춘 시계를 15초 회차까지 밀어서(`runToTick`) 일으킨다.
 *
 * "N번째 행"은 갱신 전 목록의 자리다(1부터). 목 `reset {rooms: n}`은 시드 방 1, 33 + 가짜 방이다.
 * 기준 행을 헤더 밑에 둔 시험은 `더 보기`까지 받아 연다(S4-2 35행, S4-3 ②③④와 S4-4 45행). 첫 장 30행만이면
 * 20번째 행을 헤더 밑에 둔 자리가 문서 끝 근처라 한 칸 내리는 보정이 문서 끝에 막혀 잘리고(390 34px, 1280 6px),
 * 35행이면 1280×800에서 33과 25를 헤더 밑까지 올릴 만큼 아래가 없다(02-dev-364 §4).
 *
 * 브라우저 scroll anchoring(Chrome 기본 켜짐)과 앱 보정이 겹치면 두 배로 움직인다. 각 갱신에서 `scrollY` 변화가
 * 손 계산한 보정량(기준 행 자리 변화 × 행 간격, 또는 안내 줄 높이)과 같은지 본다(S4-3 ⑤).
 *
 * 고정 대기는 없다. scroll 이벤트는 실제로 한 번 난 것을 받고 넘어간다.
 */

assertStubServers();

const LIST_ROW = 'ul[aria-label="대화 목록"] a[data-room-id]';

interface Geometry {
  headerBottom: number;
  innerHeight: number;
  scrollY: number;
  /** roomId → 창 기준 위끝, 목록 순서대로 */
  rows: { roomId: number; top: number; bottom: number }[];
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate((selector) => {
    const header = document.querySelector("header");
    return {
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      rows: [...document.querySelectorAll(selector)].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          roomId: Number((el as HTMLElement).dataset.roomId),
          top: rect.top,
          bottom: rect.bottom,
        };
      }),
    };
  }, LIST_ROW);
}

function topOf(g: Geometry, roomId: number): number {
  const row = g.rows.find((r) => r.roomId === roomId);
  if (row === undefined) throw new Error(`행 ${roomId} 없음`);
  return row.top;
}

/** 행 간격(행 높이 + gap). 첫 두 행 차이 */
function pitchOf(g: Geometry): number {
  const [a, b] = g.rows;
  return (b?.top ?? 0) - (a?.top ?? 0);
}

/** 헤더 아래 창 안에 걸친 행(앱 `visibleRows`와 같은 규칙) */
function visibleIds(g: Geometry): number[] {
  return g.rows
    .filter((r) => r.bottom > g.headerBottom && r.top < g.innerHeight)
    .map((r) => r.roomId);
}

/**
 * `position`번째 행 위끝을 헤더 아래끝에 맞춘다. 앱은 scroll 이벤트에서 보이는 행을 적으니, 그 이벤트가 실제로
 * 한 번 난 뒤(앱 리스너가 먼저 등록돼 먼저 돈다) 돌아온다. 문서 끝에 막혀 못 가면 실패시킨다
 */
async function scrollRowToHeader(page: Page, position: number): Promise<void> {
  const off = await page.evaluate(
    ({ selector, position }) =>
      new Promise<number>((resolve) => {
        const header = document.querySelector("header");
        const row = document.querySelectorAll(selector)[position - 1];
        if (header === null || row === undefined) return resolve(Number.NaN);
        const dy =
          row.getBoundingClientRect().top -
          header.getBoundingClientRect().bottom;
        const settle = () =>
          resolve(
            row.getBoundingClientRect().top -
              header.getBoundingClientRect().bottom,
          );
        if (Math.abs(dy) < 0.5) return settle();
        window.addEventListener("scroll", settle, { once: true });
        window.scrollBy(0, dy);
      }),
    { selector: LIST_ROW, position },
  );
  expect(Math.abs(off), `${position}번째 행이 헤더 아래끝에 닿음`).toBeLessThan(
    1,
  );
}

/** 15초 회차 하나를 일으키고 행 순서가 바뀔 때까지 민다(여러 장이면 마지막 장까지 받고 한 번 그린다) */
async function refreshUntilFirst(page: Page, firstId: number): Promise<void> {
  await runToTick(page);
  await flushUntil(page, async () => (await rowIds(page))[0] === firstId);
}

/** rooms개 방으로 열고 `더 보기`를 끝까지 눌러 전부 그린 뒤 시계를 멈춘다 */
async function openAll(page: Page, rooms: number): Promise<void> {
  await openList(page, rooms);
  await pauseOnList(page);
  while ((await listRows(page).count()) < rooms) {
    const n = await listRows(page).count();
    await moreButton(page).click();
    await flushRows(page, Math.min(rooms, n + 30));
  }
  await settled(page, NEXT_PAGE_GET);
}

function expectMoved(
  before: Geometry,
  after: Geometry,
  roomId: number,
  label: string,
): void {
  expect(
    Math.abs(topOf(after, roomId) - topOf(before, roomId)),
    `${label} — 이동 ≤ 4px`,
  ).toBeLessThanOrEqual(4);
}

/** S4-3 ⑤ — 브라우저 보정과 겹쳐 두 배가 되지 않았다 */
function expectScrollDelta(
  before: Geometry,
  after: Geometry,
  expected: number,
  label: string,
): void {
  expect(
    Math.abs(after.scrollY - before.scrollY - expected),
    `${label} — scrollY 변화 ${after.scrollY - before.scrollY} = 기대 보정 ${expected}`,
  ).toBeLessThanOrEqual(1);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`S4-2 ${viewport.width}`, () => {
    test.use({ viewport });

    test("① 20번째 행을 헤더 밑에 두고 30번째 방 incoming → 갱신 → 20 이동 ≤ 4px, 헤더 아래", async ({
      page,
    }) => {
      await openAll(page, 35);
      const ids = await rowIds(page);
      const row20 = ids[19]!;
      const row30 = ids[29]!;
      await scrollRowToHeader(page, 20);
      const before = await geometry(page);

      await incoming(page, row30, "30번째 방 새 말");
      await refreshUntilFirst(page, row30);
      const after = await geometry(page);

      expectMoved(before, after, row20, "20");
      expect(topOf(after, row20)).toBeGreaterThanOrEqual(
        after.headerBottom - 0.5,
      );
      /* 20은 한 칸 밀렸다 → 앱이 한 칸만큼 내린다(두 배 아님) */
      expectScrollDelta(before, after, pitchOf(before), "S4-2 ①");
    });

    test("② 20번째 방 incoming → 갱신 → 21 이동 ≤ 4px, 20이 목록 첫 행", async ({
      page,
    }) => {
      await openAll(page, 35);
      const ids = await rowIds(page);
      const row20 = ids[19]!;
      const row21 = ids[20]!;
      await scrollRowToHeader(page, 20);
      const before = await geometry(page);

      await incoming(page, row20, "20번째 방 새 말");
      await refreshUntilFirst(page, row20);
      const after = await geometry(page);

      expect((await rowIds(page))[0]).toBe(row20);
      expectMoved(before, after, row21, "21");
      /* 21은 자리 그대로 → 보정 0 */
      expectScrollDelta(before, after, 0, "S4-2 ②");
    });
  });
}

test.describe("S4-3 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("① scrollY 0 → incoming → 갱신 뒤 scrollY 0, 새 첫 행 보임 (⑤ 변화 0)", async ({
    page,
  }) => {
    await openList(page, 35);
    await pauseOnList(page);
    const ids = await rowIds(page);
    const row10 = ids[9]!;
    const before = await geometry(page);
    expect(before.scrollY).toBe(0);

    await incoming(page, row10, "10번째 방 새 말");
    await refreshUntilFirst(page, row10);
    const after = await geometry(page);

    expect(after.scrollY).toBe(0);
    const first = after.rows[0]!;
    expect(first.roomId).toBe(row10);
    expect(first.top).toBeGreaterThanOrEqual(after.headerBottom);
    expect(first.bottom).toBeLessThanOrEqual(after.innerHeight);
    expectScrollDelta(before, after, 0, "S4-3 ①");
  });

  test("② 45행(2장) 33 보던 중 30번째 방 incoming → 33 이동 ≤ 4px, 이어 40번째 방(2장) incoming → 33 이동 ≤ 4px (⑤)", async ({
    page,
  }) => {
    await openAll(page, 45);
    const ids = await rowIds(page);
    const row33 = ids[32]!;
    await scrollRowToHeader(page, 33);

    /* 30번째는 33 위 — 33 자리 그대로, 보정 0 */
    let before = await geometry(page);
    await incoming(page, ids[29]!, "30번째 방 새 말");
    await refreshUntilFirst(page, ids[29]!);
    await settled(page, NEXT_PAGE_GET);
    let after = await geometry(page);
    expect(await listRows(page).count(), "2장 다시 받아 45행").toBe(45);
    expectMoved(before, after, row33, "33(30번째 incoming)");
    expectScrollDelta(before, after, 0, "S4-3 ② 30번째");

    /* 40번째는 33 아래(2장) — 33이 한 칸 밀린다 → 한 칸 보정 */
    const row40 = (await rowIds(page))[39]!;
    before = await geometry(page);
    await incoming(page, row40, "40번째 방 새 말");
    await refreshUntilFirst(page, row40);
    await settled(page, NEXT_PAGE_GET);
    after = await geometry(page);
    expectMoved(before, after, row33, "33(40번째 incoming)");
    expectScrollDelta(before, after, pitchOf(before), "S4-3 ② 40번째");
  });

  test("③ delay {op: rooms, 3000} 중 25가 맨 위가 되게 스크롤 → 응답 뒤 25 이동 ≤ 4px(스크롤 뒤 값 기준) (⑤)", async ({
    page,
  }) => {
    await openAll(page, 45);
    const ids = await rowIds(page);
    const row25 = ids[24]!;
    const row30 = ids[29]!;
    await scrollRowToHeader(page, 10);

    await incoming(page, row30, "30번째 방 새 말");
    await chatMock(page, "delay", { op: "rooms", ms: 3_000 });
    await runToTick(page);
    /* 요청이 나간 뒤(응답 전) 사장이 스크롤한다 — 보정은 이 값으로 */
    await scrollRowToHeader(page, 25);
    const before = await geometry(page);
    expect((await rowIds(page))[0], "아직 응답 전").toBe(ids[0]);

    await page.clock.runFor(3_000);
    await flushUntil(page, async () => (await rowIds(page))[0] === row30);
    await settled(page, NEXT_PAGE_GET);
    const after = await geometry(page);
    expectMoved(before, after, row25, "25");
    expect(topOf(after, row25)).toBeGreaterThanOrEqual(
      after.headerBottom - 0.5,
    );
    expectScrollDelta(before, after, pitchOf(before), "S4-3 ③");
  });

  test("④ 보이는 행 전부가 위로 가는 incoming → scrollY 그대로 (⑤ 변화 0)", async ({
    page,
  }) => {
    await openAll(page, 45);
    await scrollRowToHeader(page, 25);
    const before = await geometry(page);
    const visible = visibleIds(before);
    expect(visible.length).toBeGreaterThan(5);

    /* 시계가 멈춰 있어 받은 시각이 같다 — 목 정렬(시각 desc, roomId desc)상 이 방들이 맨 위 묶음이 된다 */
    for (const roomId of visible) await incoming(page, roomId, "새 말");
    const sameSet = async () => {
      const top = (await rowIds(page)).slice(0, visible.length);
      return [...top].sort().join() === [...visible].sort().join();
    };
    await runToTick(page);
    await flushUntil(page, sameSet);
    await settled(page, NEXT_PAGE_GET);
    const after = await geometry(page);
    expect(await sameSet(), "보이던 행 전부 위로").toBe(true);
    expectScrollDelta(before, after, 0, "S4-3 ④");
  });
});

test.describe("S4-4 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("① 25 보던 중 갱신 500 → 행과 scrollY 변화 0", async ({ page }) => {
    await openAll(page, 45);
    const ids = await rowIds(page);
    await scrollRowToHeader(page, 25);
    const before = await geometry(page);

    /* 갱신이 성공했다면 순서가 바뀌었을 변경을 먼저 둔다 */
    await incoming(page, ids[39]!, "40번째 방 새 말");
    await chatMock(page, "fail", { op: "rooms", status: 500 });
    await runToTick(page);
    await settled(page, FIRST_PAGE_GET);
    /* 실패 알림은 TanStack이 setTimeout(0)으로 모은다 — 멈춘 시계를 조금 밀어 그리게 한다 */
    await page.clock.runFor(100);
    const after = await geometry(page);

    expect(await rowIds(page)).toEqual(ids);
    expect(after.scrollY).toBe(before.scrollY);
    expect(after.rows).toEqual(before.rows);
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("② 25 보던 중 갱신 401 → 끊김 안내 줄이 목록 위에 생김, 25 이동 ≤ 4px, 헤더 아래 (⑤ 안내 줄 높이만큼)", async ({
    page,
  }) => {
    await openAll(page, 45);
    const ids = await rowIds(page);
    const row25 = ids[24]!;
    await scrollRowToHeader(page, 25);
    const before = await geometry(page);
    const listTop0 = await page
      .locator('ul[aria-label="대화 목록"]')
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

    await chatMock(page, "fail", { op: "rooms", status: 401 });
    await runToTick(page);
    const note = appAlert(page).filter({
      hasText: "로그인이 끊겨 목록을 새로 받지 못했어요",
    });
    await flushUntil(page, async () => (await note.count()) === 1);
    const after = await geometry(page);
    const listTop1 = await page
      .locator('ul[aria-label="대화 목록"]')
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

    expect(
      listTop1 - listTop0,
      "안내 줄이 목록 위에 끼어 목록이 내려감",
    ).toBeGreaterThan(20);
    expectMoved(before, after, row25, "25");
    expect(topOf(after, row25)).toBeGreaterThanOrEqual(
      after.headerBottom - 0.5,
    );
    expectScrollDelta(before, after, listTop1 - listTop0, "S4-4 ②");
  });
});
