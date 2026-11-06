import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  AFTER_GET,
  captureReads,
  composer,
  count,
  log,
  logMetrics,
  openLongRoom,
  READ_POST,
  settled,
  topOf,
} from "../loop-08c-chat-history/helpers";

export * from "../loop-08c-chat-history/helpers";

/**
 * loop-08h S1(#386) 도매 방 바닥 지키기 공통. 기본 시드 방 3 가람상회(메시지 120개, 처음 71~120).
 *
 * 측정식(기획 §6 머리): log에서 `d = scrollHeight − clientHeight − scrollTop`. 바닥 판정 `d ≤ 48`, 리사이즈 뒤
 * 밀착 `|d| ≤ 1`. "마지막 말풍선이 보임" = 마지막 `[data-sequence]` bottom ≤ 입력창 바깥 상자 top.
 * 값은 단계마다 `test.info().annotations`에 남긴다(02-dev 표가 이 값을 옮긴다).
 */

/** 입력창 바깥 상자(textarea, 안내 줄을 담은 것). log의 형제라 늘어난 만큼 log가 준다 */
export function composerBox(page: Page): Locator {
  /* `S3-2`는 읽음 표시 span에도 붙어 있다 — 입력창을 품은 div만 */
  return page.locator('div[data-ac="S3-2"]').filter({ has: composer(page) });
}

export interface Snapshot {
  clientHeight: number;
  scrollTop: number;
  scrollHeight: number;
  d: number;
  /** 입력창 바깥 상자 높이와 top */
  boxHeight: number;
  boxTop: number;
  textareaHeight: number;
  /** 마지막 말풍선 bottom(뷰포트 기준) */
  lastBottom: number;
}

export async function snapshot(page: Page): Promise<Snapshot> {
  const m = await logMetrics(page);
  const box = await composerBox(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { height: r.height, top: r.top };
  });
  const textareaHeight = await composer(page).evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  const lastBottom = await log(page).evaluate((el) => {
    const nodes = el.querySelectorAll("[data-sequence]");
    const last = nodes[nodes.length - 1];
    if (last === undefined) throw new Error("말풍선 없음");
    return last.getBoundingClientRect().bottom;
  });
  return {
    clientHeight: m.clientHeight,
    scrollTop: m.scrollTop,
    scrollHeight: m.scrollHeight,
    d: m.fromBottom,
    boxHeight: box.height,
    boxTop: box.top,
    textareaHeight,
    lastBottom,
  };
}

/** 단계 값 남기기. `type`은 단계 이름 */
export function note(step: string, value: unknown): void {
  test.info().annotations.push({
    type: step,
    description: JSON.stringify(value),
  });
}

/** 단계 값을 재서 남기고 돌려준다 */
export async function record(page: Page, step: string): Promise<Snapshot> {
  const s = await snapshot(page);
  note(step, s);
  return s;
}

/** 두 프레임. ResizeObserver 콜백과 그 뒤 scroll 이벤트가 다 돈 다음을 잡는다(고정 지연 대신) */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** polling 한 번이 더 나가고 응답까지. 읽음 POST가 날 틈을 고정 지연 대신 이걸로 준다(기획 §6 "읽음 0 검사 시점") */
export async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, AFTER_GET);
  await expect
    .poll(() => count(page, AFTER_GET), { timeout: 10_000 })
    .toBeGreaterThan(before);
  await settled(page, AFTER_GET);
}

/**
 * 방 3을 바닥에서 연다. 첫 읽음 POST가 응답까지 끝난 걸 보고 그때까지의 기록 수를 돌려준다(기록 비움 대신 기준값).
 * 입력창은 빈칸, textarea 84px(min-h-21)을 확인한다 — 단계 전제조건
 */
export async function openAtBottom(
  page: Page,
): Promise<{ reads: ReturnType<typeof captureReads>; baseReads: number }> {
  const reads = captureReads(page);
  await openLongRoom(page);
  await expect.poll(() => count(page, READ_POST)).toBeGreaterThan(0);
  await settled(page, READ_POST);
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await expect(composer(page)).toHaveValue("");
  const s = await record(page, "open");
  expect(s.textareaHeight, "빈 입력창 84px").toBeCloseTo(84, 0);
  return { reads, baseReads: reads.length };
}

/**
 * 입력창에 글을 넣고 상자가 늘 때까지. 전제조건(기획 §6 머리): 상자 Δ > 0이고 log `clientHeight`가 같은 만큼(±1) 줄었다.
 * Δ = 0이면 실패한다(통과로 치지 않는다)
 */
export async function growComposer(
  page: Page,
  text: string,
  step: string,
): Promise<{ before: Snapshot; after: Snapshot; delta: number }> {
  const before = await snapshot(page);
  await composer(page).fill(text);
  await expect
    .poll(async () => (await snapshot(page)).boxHeight)
    .toBeGreaterThan(before.boxHeight);
  await frames(page);
  const after = await snapshot(page);
  const delta = after.boxHeight - before.boxHeight;
  const logShrink = before.clientHeight - after.clientHeight;
  note(step, { before, after, delta, logShrink });
  expect(delta, "전제조건: 상자 Δ > 0").toBeGreaterThan(0);
  expect(
    Math.abs(logShrink - delta),
    "전제조건: log가 Δ만큼 줄었다",
  ).toBeLessThanOrEqual(1);
  return { before, after, delta };
}

/** 창 높이를 바꾸고 두 프레임. log `clientHeight`가 바뀌었는지(전제조건)도 본다 */
export async function resizeTo(
  page: Page,
  width: number,
  height: number,
  step: string,
): Promise<Snapshot> {
  const before = await snapshot(page);
  await page.setViewportSize({ width, height });
  await expect
    .poll(async () => (await logMetrics(page)).clientHeight)
    .not.toBe(before.clientHeight);
  await frames(page);
  const after = await snapshot(page);
  note(step, {
    before,
    after,
    logDelta: after.clientHeight - before.clientHeight,
  });
  return after;
}

/** 마지막 말풍선 bottom ≤ 입력창 바깥 상자 top */
export function expectLastVisible(s: Snapshot): void {
  expect(s.lastBottom, "마지막 말풍선이 입력창 위에 보임").toBeLessThanOrEqual(
    s.boxTop,
  );
}

/** 기준 말풍선(지금 첫 보이는 것)과 그 top */
export async function anchorOf(
  page: Page,
): Promise<{ sequence: number; top: number }> {
  const sequence = await log(page).evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    for (const node of el.querySelectorAll<HTMLElement>("[data-sequence]"))
      if (node.getBoundingClientRect().bottom > top)
        return Number(node.dataset.sequence);
    return -1;
  });
  return { sequence, top: await topOf(page, sequence) };
}

/** 휠 위로(사장 스크롤). 스크롤이 실제로 옮겨질 때까지 값으로 기다린다 */
export async function wheelUp(page: Page, deltaY: number): Promise<void> {
  const box = await log(page).boundingBox();
  if (box === null) throw new Error("log 없음");
  const start = (await logMetrics(page)).scrollTop;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -deltaY);
  await expect
    .poll(async () => (await logMetrics(page)).scrollTop)
    .toBeLessThan(start);
}

/** 이 sequence 말풍선이 DOM에 들어올 때까지 */
export async function waitSequence(
  page: Page,
  sequence: number,
): Promise<void> {
  await expect(log(page).locator(`[data-sequence="${sequence}"]`)).toBeAttached(
    { timeout: 10_000 },
  );
}
