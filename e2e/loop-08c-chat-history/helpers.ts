import { expect, type Locator, type Page } from "@playwright/test";
import {
  chatRows,
  enterChats,
  log,
  openRoomReady,
  requests,
} from "../loop-08b-chat-filter-history/helpers";

export * from "../loop-08b-chat-filter-history/helpers";

/**
 * loop-08c 도매 이전 메시지(#339 S2). 기본 시드 방 3 가람상회 = 메시지 120개(홀수 소매, 짝수 도매, 본문 "메시지 N"),
 * 사장은 100까지 읽음. 처음 열면 71~120(50개), 이전 장 둘(21~70, 1~20)로 끝이다. 방 1 봄봄상회는 50개 이하.
 *
 * 목은 페이지 안(MSW)이라 손잡이는 로그인 화면에서, 또는 방을 연 뒤 `knob`으로 건다(`/__mock/chat/*`는 감시 대상 밖).
 * 스크롤은 둘로 나눠 만든다 — 사장이 한 스크롤은 `page.mouse.wheel`, 키보드(진짜 입력 이벤트), 프로그램 스크롤은
 * `scrollTop`을 직접 바꾼다(`setScrollTop`). 앱은 앞의 것만 자동 불러오기 트리거로 본다(§4-1 2-1).
 */

export const ROOM_LONG = 3;
export const ROOM_SHORT = 1;
export const ROOM_OTHER = 2;

export const BEFORE_GET = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+\/messages\?.*beforeSequence=/,
  method: "GET",
} as const;
export const AFTER_GET = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+\/messages\?.*afterSequence=/,
  method: "GET",
} as const;

/** 나간 before 요청의 `beforeSequence` 값들, 순서대로 */
export async function beforeSequences(page: Page): Promise<number[]> {
  return (await requests(page, BEFORE_GET)).map((r) =>
    Number(new URL(r.url, "http://x").searchParams.get("beforeSequence")),
  );
}

/**
 * 방을 열고 입력창까지. 방 3은 목록 둘째 장(31번째쯤)이라 목록 끝으로 스크롤해 이어 받기를 부른 뒤 누른다.
 * 받은 장은 목록 캐시에 남아 다음부터는 바로 보인다
 */
export async function openRoom(page: Page, roomId: number): Promise<void> {
  const link = page.locator(`a[data-room-id="${roomId}"]`);
  for (let i = 0; i < 10 && (await link.count()) === 0; i++) {
    await chatRows(page).last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await openRoomReady(page, roomId);
  await expect(log(page).locator("[data-sequence]").first()).toBeVisible();
}

/** 로그인 → 채팅 → 방 3(또는 `roomId`) 열고 입력창까지. `before`는 로그인 전에 걸 손잡이 */
export async function openLongRoom(
  page: Page,
  options: { roomId?: number; before?: (page: Page) => Promise<void> } = {},
): Promise<void> {
  await enterChats(page, { before: options.before });
  await openRoom(page, options.roomId ?? ROOM_LONG);
}

export interface LogMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** 아래 끝까지 남은 거리 */
  fromBottom: number;
}

export function logMetrics(page: Page): Promise<LogMetrics> {
  return log(page).evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
  }));
}

/** 프로그램 스크롤(사용자 이벤트 없음). 앱은 이걸 자동 불러오기 트리거로 보지 않아야 한다 */
export async function setScrollTop(page: Page, top: number): Promise<void> {
  await log(page).evaluate((el, t) => {
    el.scrollTop = t;
  }, top);
}

export async function scrollToBottom(page: Page): Promise<void> {
  await log(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

/** `[data-sequence=n]`이 log 위끝에 오게 프로그램 스크롤 */
export async function alignTop(page: Page, sequence: number): Promise<void> {
  await log(page).evaluate((el, seq) => {
    const node = el.querySelector(`[data-sequence="${seq}"]`);
    if (node === null) throw new Error(`no ${seq}`);
    el.scrollTop +=
      node.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, sequence);
}

/** 말풍선 n의 log 위끝 기준 top(px) */
export function topOf(page: Page, sequence: number): Promise<number> {
  return log(page).evaluate((el, seq) => {
    const node = el.querySelector(`[data-sequence="${seq}"]`);
    if (node === null) throw new Error(`no ${seq}`);
    return node.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, sequence);
}

/** 지금 첫 보이는 말풍선(아래 끝이 log 위끝 아래)의 sequence */
export function firstVisible(page: Page): Promise<number> {
  return log(page).evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    for (const node of el.querySelectorAll<HTMLElement>("[data-sequence]"))
      if (node.getBoundingClientRect().bottom > top)
        return Number(node.dataset.sequence);
    return -1;
  });
}

/** log 위에 마우스를 두고 휠 한 번(사용자 스크롤). 음수 = 위로 */
export async function wheel(page: Page, deltaY: number): Promise<void> {
  const box = await log(page).boundingBox();
  if (box === null) throw new Error("log 없음");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(60);
}

/**
 * 휠로 위로 올려 `scrollTop ≤ target`까지(또는 before 요청이 나갈 때까지). 자동 불러오기는 200px 안에서 걸린다.
 * 휠 한 번이 너무 크면 200px 안을 건너뛰어 0에 닿는다 — 그래도 같은 판정이라 상관없다
 */
export async function wheelUpTo(
  page: Page,
  target = 200,
  stopOnRequest = true,
): Promise<void> {
  const startCount = (await requests(page, BEFORE_GET)).length;
  for (let i = 0; i < 60; i++) {
    const { scrollTop } = await logMetrics(page);
    if (scrollTop <= target) return;
    if (stopOnRequest && (await requests(page, BEFORE_GET)).length > startCount)
      return;
    await wheel(page, -400);
  }
  throw new Error("휠로 위끝에 못 닿음");
}

/** 맨 위 자리의 버튼(이전 메시지 보기, 불러오는 중, 잠김 모두 같은 노드) */
export function historyButton(page: Page): Locator {
  return log(page).locator('[data-ac~="08c:S2-3"], [data-ac="08c:S2-5"]');
}

export function historyFail(page: Page): Locator {
  return log(page).getByRole("alert");
}

export function historyEnd(page: Page): Locator {
  return log(page).getByText("대화 처음이에요", { exact: true });
}

export function retryButton(page: Page): Locator {
  return historyFail(page).getByRole("button", { name: "다시 시도" });
}

/** 새 메시지 버튼(log 위에 뜬 것) */
export function jumpButton(page: Page): Locator {
  return page.locator('[data-ac="08c:S2-1 08c:S2-9 08c:S2-12"]');
}

/** 그린 말풍선 sequence가 n개가 될 때까지 */
export async function waitBubbles(page: Page, n: number): Promise<void> {
  await expect(log(page).locator("[data-sequence]")).toHaveCount(n, {
    timeout: 10_000,
  });
}

/** 읽음 POST 본문(`lastReadSequence`)을 쌓는다 */
export function captureReads(page: Page): { roomId: number; seq: number }[] {
  const reads: { roomId: number; seq: number }[] = [];
  page.on("request", (r) => {
    const m = /\/chat\/rooms\/(\d+)\/read$/.exec(r.url());
    if (r.method() !== "POST" || m?.[1] === undefined) return;
    const body = r.postDataJSON() as { lastReadSequence?: number } | null;
    reads.push({ roomId: Number(m[1]), seq: body?.lastReadSequence ?? -1 });
  });
  return reads;
}

/** 다른 기기에서 내가 보낸 글(도매 sender). 목의 보내기 op를 앱 밖에서 직접 부른다 */
export async function sendFromOtherDevice(
  page: Page,
  roomId: number,
  body: string,
): Promise<void> {
  const status = await page.evaluate(
    async ({ roomId, body }) => {
      const r = await fetch(`/api/wholesale/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ body, inquiry: null }),
      });
      return r.status;
    },
    { roomId, body },
  );
  expect(status).toBe(201);
}
