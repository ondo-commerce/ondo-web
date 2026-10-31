import { expect, type Locator, type Page } from "@playwright/test";
import {
  chatMock,
  chatNav,
  count,
  flushUntil,
  log,
  pauseClock,
  roomList,
  roomRow,
  settled,
  start,
} from "../loop-06-backorder-reply/helpers";

export * from "../loop-06-backorder-reply/helpers";

/**
 * loop-08-chat-polish 소매 쪽(#307 S4). `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`). 06a 공통
 * (`../loop-06-backorder-reply/helpers.ts`, 시계 T0 = 10/29 14:20) 위에 목록 장, `더 보기`, 상대 읽음 셀렉터를 더한다.
 *
 * 목은 페이지 안(MSW)이라 `page.goto`마다 시드로 돌아간다. 손잡이(reset {rooms}, delay, fail, counterpart-read)를 건 뒤엔
 * 헤더 → `/chats` → 행 클라이언트 이동만 한다.
 *
 * 순서 역전은 목 `delay` 손잡이로만 만든다(brief 2). 응답 값은 요청 시점에 정해져 늦게 온 응답이 옛 값을 든다.
 * 시계를 멈춘 테스트에서 TanStack은 렌더 알림을 setTimeout(0)으로 모으므로 화면 확인은 `flushUntil`로 민다.
 */

/** 목록 첫 장(cursor 없음) — 15초 갱신이 늘 여기서 시작한다 */
export const FIRST_PAGE_GET = {
  path: /\/api\/retail\/chat\/rooms(\?(?![^#]*cursor=)[^#]*)?$/,
  method: "GET",
} as const;
/** 목록 다음 장(cursor 있음) — `더 보기`, 그리고 갱신이 받은 장 수만큼 이어 묻는 장 */
export const NEXT_PAGE_GET = {
  path: /\/api\/retail\/chat\/rooms\?[^#]*cursor=/,
  method: "GET",
} as const;

export function listRows(page: Page): Locator {
  return roomList(page).locator("a[data-room-id]");
}

export async function rowIds(page: Page): Promise<number[]> {
  return listRows(page).evaluateAll((nodes) =>
    nodes.map((n) => Number((n as HTMLElement).dataset.roomId)),
  );
}

/** 목록 끝 `더 보기` 자리(`data-more` = 상태)와 그 안 버튼 */
export function moreBox(page: Page): Locator {
  return page.locator("[data-more]");
}

export function moreButton(page: Page): Locator {
  return moreBox(page).getByRole("button");
}

/** 행 수와 겹침 0을 같이 본다 */
export async function expectRows(page: Page, n: number): Promise<void> {
  await expect(listRows(page)).toHaveCount(n);
  const ids = await rowIds(page);
  expect(new Set(ids).size, "roomId 겹침 0").toBe(n);
}

/**
 * 공통 시작(`start`) → 내 방 `rooms`개(2면 시드 그대로) → 헤더 `채팅` → `/chats` 첫 장 응답까지.
 * 시계는 흐른다. 간격을 재는 테스트는 이 뒤에 `pauseClock`.
 */
export async function openList(page: Page, rooms = 35): Promise<void> {
  await start(page, "/");
  if (rooms !== 2) await chatMock(page, "reset", { rooms });
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(listRows(page)).toHaveCount(Math.min(rooms, 30));
  await settled(page, FIRST_PAGE_GET);
}

/** 멈춘 시계에서 행 수가 n이 될 때까지 민다 */
export async function flushRows(page: Page, n: number): Promise<void> {
  await flushUntil(page, async () => (await listRows(page).count()) === n);
}

/** 목록을 연 뒤 시계를 멈춘다. 반환값은 그 시점 첫 장 요청 수 */
export async function pauseOnList(page: Page): Promise<number> {
  await pauseClock(page);
  return count(page, FIRST_PAGE_GET);
}

/* --- 상대 읽음 ------------------------------------------------------------ */

/** 보이는 `읽음`(시각 줄 안, aria-hidden) */
export function readMarks(page: Page): Locator {
  return log(page).locator('span[aria-hidden="true"] > span[data-ac="S4-2"]');
}

/** `읽음`이 붙은 말풍선들의 sequence */
export async function readMarkSequences(page: Page): Promise<number[]> {
  return log(page)
    .locator(
      '[data-sequence]:has(> span[aria-hidden="true"] > span[data-ac="S4-2"])',
    )
    .evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
    );
}

/** 헤더 → `/chats` → 방 하나. 클라이언트 이동이라 걸어 둔 손잡이가 남는다 */
export async function enterFromList(page: Page, roomId: number): Promise<void> {
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, roomId).click();
  await expect(page).toHaveURL(`/chats/${roomId}?from=/chats`);
}

/** 상대(도매)가 여기까지 읽었다 — 다음 방 머리와 messages meta 의 값 */
export function counterpartRead(
  page: Page,
  roomId: number,
  sequence: number,
): Promise<void> {
  return chatMock(page, `rooms/${roomId}/counterpart-read`, { sequence });
}
