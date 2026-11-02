import { expect, type Locator, type Page } from "@playwright/test";
import {
  bubbles,
  chatMock,
  enterFromList,
  log,
  requests,
  start,
} from "../loop-08-chat-polish/retail-helpers";

export * from "../loop-08-chat-polish/retail-helpers";

/**
 * loop-08d S3(#351) 소매 이전 메시지 공통. `pnpm e2e:stub`(`playwright.stub.config.ts`)으로 돈다.
 *
 * 시드 `retail-history`: 방 1(봄봄상회 × 무드온) = 메시지 120개, 본문 "메시지 N", 홀수 RETAILER(나), 짝수 WHOLESALER.
 * 처음 열면 71~120(50개), 이전 장 둘(21~70, 1~20)로 끝이다. 방 33(라온)은 50개 이하.
 *
 * 도매 08c `helpers.ts`의 스크롤 도우미를 소매 경로로 다시 적었다(그 파일은 도매 helpers를 다시 내보내 이름이 겹친다).
 * 스크롤은 둘로 나눠 만든다 — 사장 스크롤은 `page.mouse.wheel`, 키보드, 터치(CDP), 프로그램 스크롤은 `scrollTop`을
 * 직접 바꾼다(`setScrollTop`). 앱은 앞의 것만 자동 불러오기 트리거로 본다(§4-3 2-1).
 *
 * 목은 페이지 안(MSW)이라 `page.goto`마다 시드로 돌아간다. 손잡이를 건 뒤엔 클라이언트 이동만 한다.
 */

export const ROOM_LONG = 1;
export const ROOM_SHORT = 33;

export const BEFORE_GET = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/messages\?.*beforeSequence=/,
  method: "GET",
} as const;
export const AFTER_GET = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/messages\?.*afterSequence=/,
  method: "GET",
} as const;

/** 나간 before 요청의 `beforeSequence` 값들, 순서대로 */
export async function beforeSequences(page: Page): Promise<number[]> {
  return (await requests(page, BEFORE_GET)).map((r) =>
    Number(new URL(r.url, "http://x").searchParams.get("beforeSequence")),
  );
}

/** i번째 before 요청의 응답 상태(아직이면 null) */
export async function beforeStatus(
  page: Page,
  i: number,
): Promise<number | null> {
  return (await requests(page, BEFORE_GET))[i]?.status ?? null;
}

/** 나간 after 요청의 `afterSequence` 값들 */
export async function afterSequences(page: Page): Promise<number[]> {
  return (await requests(page, AFTER_GET)).map((r) =>
    Number(new URL(r.url, "http://x").searchParams.get("afterSequence")),
  );
}

/**
 * 공통 시작 → 시드 `retail-history` → 헤더 → `/chats` → 방 1. 최신 50개가 그려지고 바닥까지.
 * `beforeOpen`은 방을 열기 전에 걸 손잡이
 */
export async function openHistoryRoom(
  page: Page,
  beforeOpen?: (page: Page) => Promise<void>,
): Promise<void> {
  await start(page, "/");
  await chatMock(page, "reset", { seed: "retail-history" });
  if (beforeOpen) await beforeOpen(page);
  await enterFromList(page, ROOM_LONG);
  await waitBubbles(page, 50);
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
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
 * 휠로 위로 올려 `scrollTop ≤ target`까지(또는 before 요청이 나갈 때까지). 자동 불러오기는 200px 안에서 걸린다
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
  return log(page).locator('button[data-ac~="08d:S3-2"]');
}

/** 실패 한 줄(role=alert) */
export function historyFail(page: Page): Locator {
  return log(page).locator('[role="alert"][data-ac~="08d:S3-4"]');
}

export function historyEnd(page: Page): Locator {
  return log(page).getByText("대화 처음이에요", { exact: true });
}

export function retryButton(page: Page): Locator {
  return historyFail(page).getByRole("button", { name: "다시 시도" });
}

/** 입력창 아래 세션 끊김 줄(05a `COMPOSER_TEXT.sessionLost`) */
export function lostAlert(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: "로그인이 끊겼어요" });
}

/** 그린 말풍선 sequence가 n개가 될 때까지 */
export async function waitBubbles(page: Page, n: number): Promise<void> {
  await expect(bubbles(page)).toHaveCount(n, { timeout: 10_000 });
}

/** 방 머리 상자(h1 + 돌아가기 링크) */
export function roomHead(page: Page): Locator {
  return page.locator('[data-ac="S5-5 S5-13 S5-15"]');
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
