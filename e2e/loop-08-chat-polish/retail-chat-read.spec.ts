import { expect, test, type Response } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  composer,
  count,
  counterpartRead,
  enterFromList,
  flushUntil,
  incoming,
  log,
  MESSAGES_GET,
  pauseClock,
  readMarkSequences,
  readMarks,
  settled,
  start,
  waitCount,
} from "./retail-helpers";

/**
 * #307 S4-2 — 소매 방의 상대 읽음. 와이어프레임 `18_retail-chat` `#state-read-mark` `#state-read-race`(data-loop="08").
 * 도매 S3-2, S3-3, S3-4와 같은 세 경우를 소매 방에서 본다.
 *
 * 방 33(도매처 102, 나 = 봄봄상회): 1 내 글, 2 내 글, 3 자동 답, 4 내 글, 5 자동 답, 6 내 글, 7 넘김. 시드 도매 읽음 0.
 * 대상은 내 글(RETAILER TEXT)뿐이라 읽음 2 → seq 2, 5 → seq 4, 7 → seq 6(기획 §4-3 2, 손으로 센 값).
 */

assertStubServers();

const ROOM = 33;

/** 숨긴 알림 통로(방 하나에 하나, S6-11) */
const liveRegion = (page: Parameters<typeof log>[0]) =>
  page.locator('[aria-live="polite"][data-ac="S6-11"]');

test("S4-2 ① 빈 응답 갱신: 읽음 0(표시 없음) → counterpart-read 2 → 새 메시지 없는 polling 뒤 seq 2 밑 읽음 1개, 7 → seq 6, 입력창 위", async ({
  page,
}) => {
  await start(page, "/");
  await enterFromList(page, ROOM);
  await expect(bubbles(page)).toHaveCount(6);
  await expect(readMarks(page), "값 0 — 글자 0, '안 읽음'도 0").toHaveCount(0);
  await expect(log(page)).not.toContainText("안 읽음");
  const cursor = await log(page).getAttribute("data-cursor");

  await counterpartRead(page, ROOM, 2);
  await expect(readMarks(page)).toHaveCount(1);
  expect(await readMarkSequences(page)).toEqual([2]);
  await expect(readMarks(page)).toHaveText("읽음");
  /* 빈 응답 — 말풍선 수, cursor 그대로 */
  await expect(bubbles(page)).toHaveCount(6);
  await expect(log(page)).toHaveAttribute("data-cursor", cursor ?? "");
  /* 시각과 다른 색(secondary-foreground), 시각 줄 안 */
  const colors = await readMarks(page).evaluate((mark) => [
    getComputedStyle(mark).color,
    getComputedStyle(mark.parentElement!).color,
  ]);
  expect(colors[0]).not.toBe(colors[1]);

  await counterpartRead(page, ROOM, 7);
  await expect.poll(() => readMarkSequences(page)).toEqual([6]);
  await expect(readMarks(page)).toHaveCount(1);
  const [mark, input] = await Promise.all([
    readMarks(page).boundingBox(),
    composer(page).boundingBox(),
  ]);
  expect(mark!.y + mark!.height).toBeLessThanOrEqual(input!.y);
});

test("S4-2 ② 늦은 방 머리: 읽음 2에서 delay {op: room} → 방 열기 → counterpart-read 5 → polling meta 5 → 늦은 머리(2) 도착 뒤에도 seq 4", async ({
  page,
}) => {
  /* 응답 순서와 늦은 머리 본문을 기록한다(엿보기 GET 없이 화면이 받은 응답 그대로) */
  const order: string[] = [];
  const headBodies: number[] = [];
  page.on("response", (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() !== "GET") return;
    if (path === `/api/retail/chat/rooms/${ROOM}`) {
      order.push("room");
      void response
        .json()
        .then((b: { data: { counterpartLastReadSequence: number } }) =>
          headBodies.push(b.data.counterpartLastReadSequence),
        );
    } else if (path === `/api/retail/chat/rooms/${ROOM}/messages`)
      order.push("messages");
  });

  await start(page, "/");
  await counterpartRead(page, ROOM, 2);
  await chatMock(page, "delay", { op: "room", ms: 5_000 });
  await enterFromList(page, ROOM);
  /* 메시지 첫 조회는 바로 온다. 방은 머리를 기다리느라 아직 막대다 */
  await waitCount(page, MESSAGES_GET, 1);
  await settled(page, MESSAGES_GET);
  await pauseClock(page);

  await counterpartRead(page, ROOM, 5);
  const before = await count(page, MESSAGES_GET);
  await page.clock.runFor(3_000);
  await waitCount(page, MESSAGES_GET, before + 1);
  await settled(page, MESSAGES_GET);
  /* 그 뒤 polling은 붙잡아 둔다 — 머리가 값을 덮어도 polling이 되살리면 이 시험이 그걸 못 본다(S3 첫 판 거짓 통과) */
  await chatMock(page, "delay", { op: "messages", ms: 120_000, times: 20 });
  expect(order, "머리는 아직 안 왔다").not.toContain("room");

  await page.clock.runFor(2_500);
  await flushUntil(page, async () => (await log(page).count()) === 1);
  await flushUntil(page, async () => (await readMarks(page).count()) === 1);
  expect(
    order.indexOf("room"),
    "머리가 polling 응답 뒤에 도착",
  ).toBeGreaterThan(order.lastIndexOf("messages"));
  await expect.poll(() => headBodies).toEqual([2]);
  expect(await readMarkSequences(page)).toEqual([4]);

  await page.clock.runFor(1_000);
  expect(await readMarkSequences(page), "늦은 머리(2) 뒤에도 그대로").toEqual([
    4,
  ]);
});

test("S4-2 ③ 읽음 값만 바뀐 polling: 낭독 그대로, 위로 올린 스크롤 그대로, 말풍선 끝 ', 읽음'", async ({
  page,
}) => {
  await start(page, "/");
  /* 들어가기 전에 넣어 첫 조회에 다 들어온다(기준점 안이라 낭독 대상 아님). 영역이 넘쳐 스크롤이 생긴다 */
  await incoming(page, ROOM, "새 답", { count: 20 });
  await counterpartRead(page, ROOM, 2);
  await enterFromList(page, ROOM);
  await expect(bubbles(page)).toHaveCount(26);
  await expect.poll(() => readMarkSequences(page)).toEqual([2]);

  const area = log(page);
  expect(
    await area.evaluate((el) => el.scrollHeight > el.clientHeight + 100),
    "메시지 영역이 넘친다",
  ).toBe(true);
  await area.evaluate((el) => {
    el.scrollTop = 0;
  });
  const live = await liveRegion(page).textContent();

  await counterpartRead(page, ROOM, 5);
  await expect.poll(() => readMarkSequences(page)).toEqual([4]);
  await expect(readMarks(page)).toHaveCount(1);
  expect(await area.evaluate((el) => el.scrollTop), "스크롤 그대로").toBe(0);
  expect(await liveRegion(page).textContent(), "낭독 그대로").toBe(live);

  const marked = bubbles(page).filter({
    has: page.locator('span[aria-hidden="true"] > span[data-ac="S4-2"]'),
  });
  await expect(marked.locator(":scope > span.sr-only").last()).toHaveText(
    ", 읽음",
  );
  /* 보이는 글자는 aria-hidden 안이라 낭독 이름에 "읽음"이 두 번 들어가지 않는다 */
  await expect(readMarks(page)).toHaveAttribute("data-ac", "S4-2");
  expect(
    await readMarks(page).evaluate(
      (el) => el.closest('[aria-hidden="true"]') !== null,
    ),
  ).toBe(true);
});
