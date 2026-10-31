import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bubbles,
  composer,
  count,
  installClock,
  knob,
  log,
  login,
  MESSAGES_GET,
  openChats,
  settled,
  watchRequests,
} from "./helpers";

/**
 * loop-08 #269 S3 도매 읽음 표시(01-plan §4-3, §6 S3, 와이어프레임 17 `#state-read-*`, 디자인 결정 47 48).
 *
 * 상대 읽음 값은 목 손잡이 `counterpart-read {sequence}`로만 올린다. 순서 역전은 `delay {op: room}`(값은 요청 시점에
 * 정해진다)로만 만든다. 엿보기 GET, 가짜 오류는 쓰지 않는다(§0 3).
 *
 * 쓰는 시드 방(값은 시드 그대로, 손으로 센 것):
 * - 방 9: 1 소매, 2 내 글. 소매 읽음 1 → `읽음` 없음
 * - 방 2 대기상회: 1 소매, 2 자동 답, 3 소매, 4 넘김. 소매 읽음 4 → `읽음`은 2(넘김엔 안 붙는다)
 * - 방 3 가람상회: 120개(홀수 소매, 짝수 내 글), 소매 읽음 120 → `읽음`은 120. 첫 장 50개라 위로 스크롤된다
 *
 * 기획 AC의 숫자(5, 3)는 "그 위치에 내 메시지가 있는 방"을 전제한다. 시드엔 그런 방이 없어 값을 방에 맞췄다(02-dev §4):
 * S3-2 방 9 값 2(보내지 않는 빈 응답 경우), S3-3 방 9에 한 줄 보내 3을 내 글로(늦은 머리 값 1), S3-5 방 2에 보내 5를 내 글로.
 * S3-3을 방 9로 둔 이유: 늦은 머리가 그려진 순간을 `답 필요` 배지(꺼짐 → 켜짐)로 알 수 있다. 방 2는 넘김이 열려 늘 켜져 있다.
 */

const ROOM_GET = {
  path: /\/api\/wholesale\/chat\/rooms\/\d+$/,
  method: "GET",
} as const;

/** 대화 안 보이는 `읽음` 글자(aria-hidden). 낭독용 ", 읽음"은 글자가 달라 안 잡힌다 */
function marks(page: Page): Locator {
  return log(page).getByText("읽음", { exact: true });
}

/** `읽음`이 붙은 말풍선들의 sequence */
async function markedSequences(page: Page): Promise<number[]> {
  return bubbles(page)
    .filter({ has: page.getByText("읽음", { exact: true }) })
    .evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
    );
}

function bubble(page: Page, sequence: number): Locator {
  return log(page).locator(`[data-sequence="${sequence}"]`);
}

/** 방 머리 `답 필요` 배지. 방 머리 응답(`needsReply`)으로만 그려진다 */
function needsReplyBadge(page: Page): Locator {
  return page
    .locator('[data-ac="S2-5 S3-9"]')
    .getByText("답 필요", { exact: true });
}

function liveRegion(page: Page): Locator {
  return page.locator('[aria-live="polite"][data-ac~="S3-8"]');
}

/** 다음 messages polling 하나가 응답까지 받을 때까지(3초 간격, 흐르는 시계) */
async function nextMessagesPoll(page: Page): Promise<void> {
  const before = await count(page, MESSAGES_GET);
  await expect.poll(() => count(page, MESSAGES_GET)).toBeGreaterThan(before);
  await settled(page, MESSAGES_GET);
}

/** 입력창으로 보낸다 → 서버 sequence를 받은 말풍선이 생길 때까지 */
async function send(page: Page, text: string, sequence: number) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(bubble(page, sequence)).toContainText(text);
}

/** 방 열기 → reset 200. 목은 페이지 안이라 reset은 그 방을 연 문서에 건다(시드와 같은 값) */
async function openRoom(page: Page, roomId: number): Promise<void> {
  await openChats(page, roomId);
  await expect(log(page)).toBeVisible();
  await knob(page, "reset");
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
});

test("S3-2 방 9(읽음 1, 표시 없음) → counterpart-read 2 → 빈 polling 응답 뒤 seq 2 밑 `읽음` 1개", async ({
  page,
}) => {
  await openRoom(page, 9);
  await expect(bubbles(page)).toHaveCount(2);
  await expect(marks(page)).toHaveCount(0);
  await expect(log(page)).toHaveAttribute("data-cursor", "2");

  await knob(page, "rooms/9/counterpart-read", { sequence: 2 });
  await nextMessagesPoll(page);
  /* 빈 응답이었다 — 새 말풍선 0, cursor 그대로. 값은 meta로만 왔다 */
  await expect(log(page)).toHaveAttribute("data-cursor", "2");
  await expect(bubbles(page)).toHaveCount(2);
  await expect(marks(page)).toHaveCount(1);
  expect(await markedSequences(page)).toEqual([2]);
  /* 색은 secondary-foreground, 시각은 muted(디자인 결정 47). 둘이 달라야 읽음이 시각과 갈린다 */
  const colors = await bubble(page, 2).evaluate((el) => {
    const mark = [...el.querySelectorAll("span")].find(
      (s) => s.textContent === "읽음",
    );
    return {
      mark: mark && getComputedStyle(mark).color,
      time: mark?.parentElement && getComputedStyle(mark.parentElement).color,
    };
  });
  expect(colors.mark).toBeDefined();
  expect(colors.mark).not.toBe(colors.time);
});

test("S3-3 늦은 방 머리: 방 9 읽음 1, 내 글 3에서 delay {op: room} → 머리 요청이 떠난 뒤 counterpart-read 3 → polling으로 3 → 늦은 머리(1) 도착 뒤에도 3", async ({
  page,
}) => {
  const order: string[] = [];
  page.on("request", (r) => {
    if (ROOM_GET.path.test(r.url()) && r.method() === "GET")
      order.push("room:request");
  });
  page.on("response", (r) => {
    if (ROOM_GET.path.test(r.url()) && r.request().method() === "GET")
      order.push("room:response");
  });

  await openRoom(page, 9);
  await expect(marks(page)).toHaveCount(0);
  /* 3을 내 글로 만든다. 보낸 뒤 polling이 3을 이어 받아 cursor가 3이 되고 방 머리 재조회까지 끝날 때까지.
     마지막이 내 글이라 방 머리 `답 필요`가 꺼진다 — 늦은 머리가 그려진 순간을 이 배지로 안다 */
  await send(page, "목요일 오전에 올라가요", 3);
  await expect(log(page)).toHaveAttribute("data-cursor", "3");
  await settled(page, ROOM_GET);
  await expect(needsReplyBadge(page)).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);

  await knob(page, "delay", { op: "room", ms: 5000 });
  const roomsBefore = await count(page, ROOM_GET);
  /* 소매 새 글 4 → polling이 받아 방 머리를 다시 부른다(이 요청이 5초 늦는다, 값은 지금의 1, 답 필요 켜짐) */
  await knob(page, "rooms/9/incoming", { body: "네 기다릴게요" });
  await expect(log(page)).toHaveAttribute("data-cursor", "4");
  await expect.poll(() => count(page, ROOM_GET)).toBe(roomsBefore + 1);
  const lateHeader = page.waitForResponse(
    (r) => ROOM_GET.path.test(r.url()) && r.request().method() === "GET",
  );

  order.push("counterpart-read 3");
  await knob(page, "rooms/9/counterpart-read", { sequence: 3 });
  await nextMessagesPoll(page);
  await expect.poll(() => markedSequences(page)).toEqual([3]);
  order.push("marked 3");
  /* 머리가 그려진 바로 뒤를 본다 — 그 사이 polling이 와서 3으로 덮어 주면 역전이 안 보인다. 다음 messages 응답을 늦춘다 */
  await knob(page, "delay", { op: "messages", ms: 8000 });

  const response = await lateHeader;
  const body = (await response.json()) as {
    data: { counterpartLastReadSequence: number | null; needsReply: boolean };
  };
  /* 늦은 머리는 정말 옛 값을 들고 왔다 — 1이 아니면 이 테스트는 역전을 시험하지 않는다 */
  expect(body.data.counterpartLastReadSequence).toBe(1);
  expect(body.data.needsReply).toBe(true);
  order.push("late header arrived");
  await expect(needsReplyBadge(page)).toBeVisible();
  expect(await markedSequences(page)).toEqual([3]);
  await expect(marks(page)).toHaveCount(1);

  /* 기록된 순서: 늦은 머리 요청 → counterpart-read 3 → 3 표시 → 머리 응답 */
  expect(order.lastIndexOf("room:request")).toBeLessThan(
    order.indexOf("counterpart-read 3"),
  );
  expect(order.indexOf("marked 3")).toBeLessThan(
    order.lastIndexOf("room:response"),
  );
});

test("S3-4 값만 바뀐 polling: 낭독 그대로, 위로 올린 스크롤 그대로, 말풍선 끝 ', 읽음', 맨 아래 읽음은 입력창 위", async ({
  page,
}) => {
  await openRoom(page, 3);
  expect(await markedSequences(page)).toEqual([120]);
  await send(page, "확인했어요", 121);
  await expect(log(page)).toHaveAttribute("data-cursor", "121");
  await settled(page, MESSAGES_GET);
  expect(await markedSequences(page)).toEqual([120]);

  /* 위로 올려 읽던 중 */
  await log(page).evaluate((el) => {
    el.scrollTop = 200;
  });
  const scrollBefore = await log(page).evaluate((el) => el.scrollTop);
  expect(scrollBefore).toBe(200);
  const liveBefore = await liveRegion(page).textContent();

  await knob(page, "rooms/3/counterpart-read", { sequence: 121 });
  await nextMessagesPoll(page);
  await expect.poll(() => markedSequences(page)).toEqual([121]);

  expect(await log(page).evaluate((el) => el.scrollTop)).toBe(scrollBefore);
  expect(await liveRegion(page).textContent()).toBe(liveBefore);
  /* 낭독: "나, HH:mm: 확인했어요, 읽음" — 숨긴 글이 말풍선 맨 끝 */
  await expect(bubble(page, 121).locator(".sr-only").last()).toHaveText(
    ", 읽음",
  );
  await expect(bubble(page, 121).locator(".sr-only")).toHaveCount(2);
  await expect(bubble(page, 120).locator(".sr-only")).toHaveCount(1);
  /* 보이는 `읽음`은 시각과 같이 숨긴다 */
  await expect(
    bubble(page, 121).getByText("읽음", { exact: true }),
  ).toHaveAttribute("data-ac", "S3-2");
  expect(
    await bubble(page, 121)
      .getByText("읽음", { exact: true })
      .evaluate((el) => el.closest("[aria-hidden]") !== null),
  ).toBe(true);

  /* 바닥으로 내려 맨 아래 말풍선의 읽음이 입력창에 안 가리는지 */
  await log(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const mark = await bubble(page, 121)
    .getByText("읽음", { exact: true })
    .boundingBox();
  const input = await composer(page).boundingBox();
  expect(mark).not.toBeNull();
  expect(input).not.toBeNull();
  expect((mark?.y ?? 0) + (mark?.height ?? 0)).toBeLessThanOrEqual(
    input?.y ?? -1,
  );
});

test("S3-5 보내면 `읽음`은 앞 메시지에 남고(보내는 중에도), counterpart-read로 새 sequence → 새 말풍선 밑 1개", async ({
  page,
}) => {
  await openRoom(page, 2);
  expect(await markedSequences(page)).toEqual([2]);

  await composer(page).fill("네 확인해 볼게요");
  await composer(page).press("Enter");
  /* 보내는 중 말풍선(서버 sequence 없음)에는 붙지 않는다 */
  const pending = log(page).locator('[data-pending="sending"]');
  await expect(pending).toHaveCount(1);
  await expect(pending.getByText("읽음", { exact: true })).toHaveCount(0);
  await expect(marks(page)).toHaveCount(1);
  expect(await markedSequences(page)).toEqual([2]);

  await expect(bubble(page, 5)).toContainText("네 확인해 볼게요");
  await expect(marks(page)).toHaveCount(1);
  expect(await markedSequences(page)).toEqual([2]);

  await knob(page, "rooms/2/counterpart-read", { sequence: 5 });
  await nextMessagesPoll(page);
  await expect.poll(() => markedSequences(page)).toEqual([5]);
  await expect(marks(page)).toHaveCount(1);
});
