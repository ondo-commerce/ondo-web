import { expect, test, type Page, type Request } from "@playwright/test";
import {
  AFTER_GET,
  assertStubServers,
  BEFORE_GET,
  bubbles,
  chatMock,
  composer,
  count,
  historyButton,
  historyFail,
  incoming,
  log,
  logMetrics,
  openHistoryRoom,
  READ_POST,
  retryButton,
  scrollToBottom,
  setScrollTop,
  settled,
  setVisibility,
  topOf,
  waitBubbles,
  wheel,
  wheelUpTo,
} from "./retail-history-helpers";

/**
 * loop-08d #352 S4 — 소매 `새 메시지 N개`, 읽음 보류, 바닥 판정 통합(48px), 리사이즈 순서(① 바닥 붙임 ② 다시 잼),
 * 낭독 기록, 긴 왕복. `pnpm e2e:stub`.
 *
 * 시드 `retail-history` 방 1: 1~120, 홀수 RETAILER 짝수 WHOLESALER, 소매 읽음 100 — 열면 읽음 POST 120이 한 번 나간다.
 * 읽음 세는 법(01-plan S4 머리): 그 첫 POST가 응답을 받고 1초 지난 때를 기준점으로 잡고 그 뒤 방 1 POST만 센다.
 */

assertStubServers();

test.use({ viewport: { width: 1280, height: 800 } });

const ROOM1_READ = {
  path: /\/api\/retail\/chat\/rooms\/1\/read$/,
  method: "POST",
} as const;

interface ReadMark {
  requests: number;
  bodies: number;
}

/**
 * 첫 읽음 POST가 끝나고 다음 polling 응답까지 받은 때를 기준점으로. 예전엔 "1초 뒤"였다(08g S5-11) — 고정 대기 대신
 * 방이 한 주기를 돈 것을 기다린다. 첫 그림이 낸 읽음 POST는 그 사이 다 나가고 끝난다
 */
async function markReads(page: Page): Promise<ReadMark> {
  await expect.poll(() => count(page, ROOM1_READ)).toBeGreaterThan(0);
  await settled(page, ROOM1_READ);
  await nextPoll(page);
  await settled(page, ROOM1_READ);
  const { reads, bodies } = await readSnapshot(page);
  return {
    requests: reads.filter((r) => ROOM1_READ.path.test(r.url)).length,
    bodies: bodies.length,
  };
}

interface ReadSnapshot {
  /** 읽음 POST 전부(방 가리지 않음), 나간 순서 */
  reads: { url: string; status: number | null }[];
  bodies: { lastReadSequence: number }[];
}

/**
 * 요청 기록(`__watch`)과 읽음 본문(`__readBodies`)을 evaluate 한 번으로 같이 받는다. 둘 다 같은 fetch 호출 안에서
 * 동기로 쌓여서 한 번에 받으면 서로 어긋나지 않는다. 따로 받으면 그 사이 POST가 끼어 5 대 4가 된다(08e Q3, 08f S5-6)
 */
function readSnapshot(page: Page): Promise<ReadSnapshot> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __watch: {
        requests: { url: string; method: string; status: number | null }[];
      };
      __readBodies: { lastReadSequence: number }[];
    };
    return {
      reads: w.__watch.requests
        .filter(
          (r) => r.method === "POST" && /\/chat\/rooms\/\d+\/read$/.test(r.url),
        )
        .map((r) => ({ url: r.url, status: r.status })),
      bodies: [...w.__readBodies],
    };
  });
}

/** 기준점 뒤 방 1 읽음 POST — 응답 상태와 `lastReadSequence`. 다른 방 POST가 있으면 실패 */
async function readsSince(
  page: Page,
  mark: ReadMark,
): Promise<{ status: number | null; seq: number | undefined }[]> {
  const { reads, bodies } = await readSnapshot(page);
  const room1 = reads.filter((r) => ROOM1_READ.path.test(r.url));
  expect(reads.filter((r) => READ_POST.path.test(r.url)).length).toBe(
    room1.length,
  );
  const since = bodies.slice(mark.bodies);
  return room1.slice(mark.requests).map((r, i) => ({
    status: r.status,
    seq: since[i]?.lastReadSequence,
  }));
}

/** 부른 뒤에 **시작한** polling(after GET) 요청 하나. 이미 나가 있던 요청은 안 잡는다(리뷰 R5) */
function pollStarted(page: Page): Promise<Request> {
  return page.waitForRequest(
    (r) => AFTER_GET.path.test(r.url()) && r.method() === "GET",
    { timeout: 8000 },
  );
}

/**
 * polling 회차 하나: 부른 뒤 시작한 요청 → 응답 본문 끝(`finished()`) → 본문에 메시지가 있으면 그 마지막 sequence가
 * log에 그려질 때까지. 예전엔 fetch wrapper의 status 기록(`settled`)을 봤는데 그건 본문 소비와 쿼리 반영보다 먼저다
 * (08g S5-11, 리뷰 R5). 빈 응답은 화면에 바뀌는 게 없다 — 그 회차가 끝까지 처리됐는지는 `twoPolls`가 다음 회차 시작으로 본다
 */
async function nextPoll(page: Page): Promise<void> {
  const request = await pollStarted(page);
  const response = await request.response();
  if (response === null) throw new Error("polling 응답이 없다");
  await response.finished();
  if (!response.ok()) return;
  const body = (await response.json()) as { data: { sequence: number }[] };
  const last = body.data.at(-1)?.sequence;
  if (last !== undefined)
    await expect(log(page).locator(`[data-sequence="${last}"]`)).toBeAttached();
}

/**
 * "그동안 읽음 POST가 더 안 나감"을 보는 구간. 예전엔 6초 고정 대기였다(08g S5-11) — polling 두 회차를 본 뒤
 * **세 번째 회차 요청이 시작될 때까지** 기다리고 읽음 POST가 다 끝난 뒤 센다(리뷰 R5).
 *
 * 왜 세 번째 시작인가: 같은 쿼리 키는 앞 queryFn이 끝나기 전엔 새 요청을 만들지 않는다(TanStack 중복 제거, interval이
 * 불려도 진행 중 promise를 돌려준다). 그래서 세 번째 요청이 나갔다는 건 두 번째 회차의 본문 소비와 캐시 반영이 끝났다는
 * 뜻이다. 그 반영이 낸 렌더와 읽음 effect는 반영 직후 task로 돌고, 다음 interval(3초 뒤 타이머)보다 먼저 끝난다 —
 * 읽음 POST는 effect 안 `fetch` 호출 때 기록(`__watch`)에 들어가니 그 뒤 `settled`가 그것까지 기다린다
 */
async function twoPolls(page: Page): Promise<void> {
  await nextPoll(page);
  await nextPoll(page);
  await pollStarted(page);
  await settled(page, ROOM1_READ);
}

/** log 높이가 바뀔 때까지(창 크기, 입력창 줄 수 변화가 log에 닿음) */
async function logHeightChangedFrom(page: Page, before: number): Promise<void> {
  await expect
    .poll(async () => (await logMetrics(page)).clientHeight)
    .not.toBe(before);
}

async function logHeight(page: Page): Promise<number> {
  return (await logMetrics(page)).clientHeight;
}

/** 바닥 거리 ≤ 1px이 될 때까지 */
async function expectAtBottom(page: Page, name?: string): Promise<void> {
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom, { message: name })
    .toBeLessThanOrEqual(1);
}

/**
 * 프로그램 스크롤 하나를 하고 그 scroll 이벤트까지 기다린다. 방 화면의 scroll 처리(`useThreadScroll` onScroll, 바닥
 * 판정 ref)는 같은 이벤트 안에서 먼저 돈다 — React가 그 요소에 붙인 리스너가 이 리스너보다 먼저 붙었다.
 * 위치가 그대로면 이벤트가 안 오므로 바로 끝낸다
 */
async function scrollLogAndWait(
  page: Page,
  target: { sequence: number } | { top: number },
): Promise<void> {
  await log(page).evaluate(
    (el, t) =>
      new Promise<void>((resolve, reject) => {
        let next: number;
        if ("sequence" in t) {
          const node = el.querySelector(`[data-sequence="${t.sequence}"]`);
          if (node === null) return reject(new Error(`no ${t.sequence}`));
          next =
            el.scrollTop +
            node.getBoundingClientRect().top -
            el.getBoundingClientRect().top;
        } else next = t.top;
        const max = el.scrollHeight - el.clientHeight;
        if (Math.abs(Math.min(Math.max(next, 0), max) - el.scrollTop) < 1)
          return resolve();
        el.addEventListener("scroll", () => resolve(), { once: true });
        el.scrollTop = next;
      }),
    target,
  );
}

function jumpButton(page: Page) {
  return page.locator('button[data-ac~="08d:S4-2"]');
}

/** 말풍선 n이 그려질 때까지(polling이 받아 옴) */
async function waitSequence(page: Page, n: number): Promise<void> {
  await expect(log(page).locator(`[data-sequence="${n}"]`)).toBeAttached({
    timeout: 8000,
  });
}

/** 100을 log 위끝에 두고(그 scroll 이벤트까지, 예전 100ms 대기 대신 08g S5-11) 바닥까지 ≥ 200px 확인 */
async function readAbove(page: Page): Promise<void> {
  await scrollLogAndWait(page, { sequence: 100 });
  expect((await logMetrics(page)).fromBottom).toBeGreaterThanOrEqual(200);
}

/** 내 다른 기기에서 보낸 글(보내기 POST 직접). 이 화면의 보류 말풍선은 안 는다 */
async function sendFromOtherDevice(page: Page, body: string): Promise<void> {
  const status = await page.evaluate(async (text) => {
    const response = await fetch("/api/retail/chat/rooms/1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ body: text }),
    });
    return response.status;
  }, body);
  expect(status).toBe(201);
}

/** 마지막 말풍선 rect가 log 안에 전부, 입력창 위 */
async function expectLastBubbleShown(page: Page): Promise<void> {
  const box = await log(page).evaluate((el) => {
    const nodes = el.querySelectorAll("[data-sequence]");
    const last = nodes[nodes.length - 1]!.getBoundingClientRect();
    const logRect = el.getBoundingClientRect();
    return {
      top: last.top,
      bottom: last.bottom,
      logTop: logRect.top,
      logBottom: logRect.bottom,
    };
  });
  const input = await composer(page).boundingBox();
  if (input === null) throw new Error("입력창 없음");
  expect(box.bottom).toBeLessThanOrEqual(box.logBottom + 0.5);
  expect(box.top).toBeGreaterThanOrEqual(box.logTop - 0.5);
  expect(box.bottom).toBeLessThanOrEqual(input.y);
}

test.describe("S4-2 위를 읽는 중 새 메시지 → 보류, 버튼", () => {
  async function arrive(page: Page): Promise<{ mark: ReadMark; top: number }> {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    await readAbove(page);
    const top = await topOf(page, 100);
    await incoming(page, 1, "도매 답");
    /* 그 사이 내 다른 기기 글이 끼어도 N은 그대로 */
    await sendFromOtherDevice(page, "다른 기기에서 보낸 글");
    await incoming(page, 1, "자동 답", { kind: "AUTO_REPLY" });
    /* 121 도매 TEXT, 122 내 다른 기기 글, 123 목 자동 답의 넘김 줄(SYSTEM), 124 AUTO_REPLY — N에 드는 건 121, 124 */
    await waitSequence(page, 124);
    /* 예전 300ms 대신(08g S5-11): 124까지 센 버튼이 서면 그 묶음을 그린 렌더가 끝났다 */
    await expect(jumpButton(page)).toHaveText("새 메시지 2개");
    return { mark, top };
  }

  test("incoming 2(TEXT + AUTO_REPLY) → 읽음 0, 100 top ≤ 4px, '새 메시지 2개, 아래로 이동' → 누름 → 바닥, POST 1(그린 최대), 버튼 0, 포커스 입력창", async ({
    page,
  }) => {
    const { mark, top } = await arrive(page);
    expect(await readsSince(page, mark)).toEqual([]);
    expect(Math.abs((await topOf(page, 100)) - top)).toBeLessThanOrEqual(4);
    await expect(jumpButton(page)).toHaveAccessibleName(
      "새 메시지 2개, 아래로 이동",
    );
    await expect(jumpButton(page)).toHaveText("새 메시지 2개");

    await jumpButton(page).click();
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
    await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
    await twoPolls(page);
    expect(await readsSince(page, mark)).toEqual([{ status: 200, seq: 124 }]);
    await expect(jumpButton(page)).toHaveCount(0);
    await expect(composer(page)).toBeFocused();
  });

  test("버튼 대신 휠로 바닥까지 → POST 1, 버튼 0", async ({ page }) => {
    const { mark } = await arrive(page);
    for (let i = 0; i < 40; i++) {
      if ((await logMetrics(page)).fromBottom <= 1) break;
      await wheel(page, 400);
    }
    await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
    await twoPolls(page);
    expect(await readsSince(page, mark)).toEqual([{ status: 200, seq: 124 }]);
    await expect(jumpButton(page)).toHaveCount(0);
  });
});

test.describe("S4-3 N 세는 법", () => {
  test("위로 올린 채 AUTO_REPLY 1개만 → '새 메시지 1개'", async ({ page }) => {
    await openHistoryRoom(page);
    await readAbove(page);
    await incoming(page, 1, "자동 답", { kind: "AUTO_REPLY" });
    await waitSequence(page, 121);
    await expect(jumpButton(page)).toHaveAccessibleName(
      "새 메시지 1개, 아래로 이동",
    );
  });

  test("위로 올린 채 내 다른 기기 글만 → '아래로 이동'", async ({ page }) => {
    await openHistoryRoom(page);
    await readAbove(page);
    await sendFromOtherDevice(page, "다른 기기에서 보낸 글");
    await waitSequence(page, 121);
    await expect(jumpButton(page)).toHaveAccessibleName("아래로 이동");
    await expect(jumpButton(page)).toHaveText("아래로 이동");
  });
});

test("S4-4 바닥에서 incoming 8개(300자, 묶음 > log 높이) → 바닥 거리 ≤ 1px, 마지막 말풍선 log 안, POST 1", async ({
  page,
}) => {
  await openHistoryRoom(page);
  const mark = await markReads(page);
  await incoming(page, 1, "가".repeat(300), { count: 8 });
  await waitSequence(page, 128);
  /* 예전 200ms 대신(08g S5-11): 바닥 붙임이 끝날 때까지 값으로 */
  await expectAtBottom(page);
  const batch = await log(page).evaluate((el) => {
    let sum = 0;
    for (let s = 121; s <= 128; s++)
      sum += el
        .querySelector(`[data-sequence="${s}"]`)!
        .getBoundingClientRect().height;
    return { sum, clientHeight: el.clientHeight };
  });
  expect(batch.sum).toBeGreaterThan(batch.clientHeight);
  expect((await logMetrics(page)).fromBottom).toBeLessThanOrEqual(1);
  await expectLastBubbleShown(page);
  await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
  await twoPolls(page);
  expect(await readsSince(page, mark)).toEqual([{ status: 200, seq: 128 }]);
});

test.describe("S4-5 리사이즈 순서(390, ① 바닥 붙임 ② 다시 잼)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const steps: [string, (page: Page) => Promise<void>][] = [
    ["① 입력창 3줄", (page) => composer(page).fill("첫 줄\n둘째 줄\n셋째 줄")],
    ["② 1,001자 오류 두 줄", (page) => composer(page).fill("가".repeat(1001))],
    [
      "③ 창 높이 844 → 600",
      (page) => page.setViewportSize({ width: 390, height: 600 }),
    ],
    [
      "④ 600 → 844",
      (page) => page.setViewportSize({ width: 390, height: 844 }),
    ],
  ];

  test("바닥 출발: 각 단계 뒤 바닥 거리 ≤ 1px, 마지막 말풍선 입력창 위. ③ 뒤 incoming 1 → 따라가고 POST 1", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    for (const [name, step] of steps) {
      /* 예전 200ms 대신(08g S5-11): 그 단계가 log 높이를 바꾼 것을 본 뒤 바닥 거리를 값으로 기다린다 */
      const height = await logHeight(page);
      await step(page);
      await logHeightChangedFrom(page, height);
      await expectAtBottom(page, name);
      await expectLastBubbleShown(page);
      if (name.startsWith("③")) {
        await incoming(page, 1, "창이 줄어든 뒤 답");
        await waitSequence(page, 121);
        await expectAtBottom(page, "③ 뒤 incoming");
        await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
        expect(await readsSince(page, mark)).toEqual([
          { status: 200, seq: 121 },
        ]);
        await expect(jumpButton(page)).toHaveCount(0);
      }
    }
  });

  test("위 출발: 각 단계 뒤 첫 보이던 말풍선 top 이동 ≤ 4px, 버튼과 읽음 POST 변화 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    await readAbove(page);
    const top = await topOf(page, 100);
    for (const [name, step] of steps) {
      const height = await logHeight(page);
      await step(page);
      await logHeightChangedFrom(page, height);
      await expect
        .poll(async () => Math.abs((await topOf(page, 100)) - top), {
          message: name,
        })
        .toBeLessThanOrEqual(4);
      await expect(jumpButton(page)).toHaveCount(0);
    }
    expect(await readsSince(page, mark)).toEqual([]);
  });
});

test.describe("S4-6 탭 숨김과 읽음 실패", () => {
  test("위로 올린 채 숨김 → incoming → 복귀 → polling 1회 뒤 '새 메시지 1개', POST 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    await readAbove(page);
    await setVisibility(page, "hidden");
    await incoming(page, 1, "숨긴 사이 답");
    /* 숨긴 채 0.5초. 실제 대기 대신 페이지 시계로 민다(08g S5-11) — polling 타이머도 같은 시계다 */
    await page.clock.runFor(500);
    await setVisibility(page, "visible");
    await nextPoll(page);
    await waitSequence(page, 121);
    await expect(jumpButton(page)).toHaveAccessibleName(
      "새 메시지 1개, 아래로 이동",
    );
    await twoPolls(page);
    expect(await readsSince(page, mark)).toEqual([]);
  });

  test("바닥에서 숨김 → incoming → 복귀 → POST 1", async ({ page }) => {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    await setVisibility(page, "hidden");
    await incoming(page, 1, "숨긴 사이 답");
    await page.clock.runFor(500);
    await setVisibility(page, "visible");
    await waitSequence(page, 121);
    await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
    await twoPolls(page);
    expect(await readsSince(page, mark)).toEqual([{ status: 200, seq: 121 }]);
  });

  test("read 500 + 바닥 incoming → POST 1(500), 다음 polling 뒤 POST 1(200, 같은 값). 다시 500 뒤 위로 올리면 0, 바닥에 오면 1", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    const mark = await markReads(page);
    await chatMock(page, "fail", { op: "read", status: 500 });
    await incoming(page, 1, "첫 답");
    await expect.poll(() => readsSince(page, mark)).toHaveLength(1);
    await settled(page, ROOM1_READ);
    expect(await readsSince(page, mark)).toEqual([{ status: 500, seq: 121 }]);
    await nextPoll(page);
    await expect.poll(() => readsSince(page, mark)).toHaveLength(2);
    await settled(page, ROOM1_READ);
    expect((await readsSince(page, mark))[1]).toEqual({
      status: 200,
      seq: 121,
    });

    /* 다시 500 — 응답을 받자마자 위로. 보류 중엔 다시 보내지 않는다 */
    await chatMock(page, "fail", { op: "read", status: 500 });
    await incoming(page, 1, "둘째 답");
    await expect.poll(() => readsSince(page, mark)).toHaveLength(3);
    await settled(page, ROOM1_READ);
    await readAbove(page);
    expect((await readsSince(page, mark))[2]).toEqual({
      status: 500,
      seq: 122,
    });
    /* "그동안 POST 더 없음"이라 마지막 회차 반영까지 본다(리뷰 R5) */
    await twoPolls(page);
    expect(await readsSince(page, mark)).toHaveLength(3);
    await scrollToBottom(page);
    await expect.poll(() => readsSince(page, mark)).toHaveLength(4);
    await settled(page, ROOM1_READ);
    expect((await readsSince(page, mark))[3]).toEqual({
      status: 200,
      seq: 122,
    });
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`S4-7 ${viewport.width} 버튼 자리와 크기`, () => {
    test.use({ viewport });

    async function size(locator: ReturnType<typeof historyButton>) {
      return locator.evaluate((el) => ({
        h: el.getBoundingClientRect().height,
        f: getComputedStyle(el).fontSize,
      }));
    }

    test("새 메시지 버튼 bottom ≤ 입력창 top, 좌우 log 안. 새 메시지, 이전 메시지 보기, 불러오는 중, 다시 시도 높이 44/28 글자 14/12", async ({
      page,
    }) => {
      const phone = viewport.width === 390;
      const expected = phone ? { h: 44, f: "14px" } : { h: 28, f: "12px" };
      await openHistoryRoom(page);
      await readAbove(page);
      await incoming(page, 1, "새 답");
      await waitSequence(page, 121);
      const jump = await jumpButton(page).boundingBox();
      const logBox = await log(page).boundingBox();
      const composerBox = await page.locator('[data-ac="S5-9"]').boundingBox();
      if (jump === null || logBox === null || composerBox === null)
        throw new Error("자리 없음");
      expect(jump.y + jump.height).toBeLessThanOrEqual(composerBox.y);
      expect(jump.x).toBeGreaterThanOrEqual(logBox.x);
      expect(jump.x + jump.width).toBeLessThanOrEqual(logBox.x + logBox.width);
      expect(await size(jumpButton(page))).toEqual(expected);

      await setScrollTop(page, 0);
      expect(await size(historyButton(page))).toEqual(expected);
      await chatMock(page, "delay", {
        op: "messages",
        page: "before",
        ms: 2000,
      });
      await historyButton(page).click();
      await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
      expect(await size(historyButton(page))).toEqual(expected);
      await waitBubbles(page, 101);

      await chatMock(page, "fail", {
        op: "messages",
        page: "before",
        status: 500,
      });
      await setScrollTop(page, 0);
      await historyButton(page).click();
      await expect(historyFail(page)).toBeVisible();
      expect((await size(retryButton(page))).h).toBe(expected.h);
    });
  });
}

/**
 * 채팅 live 영역 하나(`data-ac~="08d:S4-8"`)를 MutationObserver로 센다. 영역은 방을 열 때 생겨서 init script가
 * 찾을 때까지 기다렸다 붙는다. `__live.reset()`으로 비운다
 */
async function watchLive(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = {
      added: 0,
      chars: 0,
      /** 관찰자가 live 영역에 붙었나. 붙기 전 기록은 0이라 리셋 시점을 이걸로 기다린다(08g S5-11) */
      attached: false,
      reset() {
        record.added = 0;
        record.chars = 0;
      },
    };
    (window as unknown as { __live: typeof record }).__live = record;
    let attached: Element | null = null;
    const observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") record.added += m.addedNodes.length;
        if (m.type === "characterData") record.chars += 1;
      }
    });
    setInterval(() => {
      const el = document.querySelector('[data-ac~="08d:S4-8"]');
      if (el === attached) return;
      observer.disconnect();
      attached = el;
      record.attached = el !== null;
      if (el !== null)
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
        });
    }, 50);
  });
}

function liveRecord(page: Page): Promise<{ added: number; chars: number }> {
  return page.evaluate(() => {
    const r = (
      window as unknown as { __live: { added: number; chars: number } }
    ).__live;
    return { added: r.added, chars: r.chars };
  });
}

test("S4-8 낭독 기록: 옛 메시지 자동, 버튼으로 붙이는 동안 0. 위로 올린 채 incoming 1 → 1. 이어서 옛 메시지 → 그대로 1", async ({
  page,
}) => {
  await watchLive(page);
  await openHistoryRoom(page);
  /* 예전 1초 대신(08g S5-11): 관찰자가 붙은 뒤 비운다. 방을 열 때 live 영역은 빈 채로 선다(`liveAnnouncement` null) */
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __live: { attached: boolean } }).__live
            .attached,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as unknown as { __live: { reset: () => void } }).__live.reset(),
  );

  /* 아래 "그대로 0", "그대로 1"은 대기 없이 본다. live 글자는 말풍선과 같은 렌더에서 정해지고(`liveAnnouncement`),
     MutationObserver 기록은 그 커밋의 microtask라 말풍선 수를 확인한 때 이미 쌓였다(예전 300ms 셋, 08g S5-11) */
  await wheelUpTo(page);
  await waitBubbles(page, 100);
  expect(await liveRecord(page)).toEqual({ added: 0, chars: 0 });

  await incoming(page, 1, "위를 읽는 중 온 답");
  await waitSequence(page, 121);
  await expect.poll(() => liveRecord(page)).toEqual({ added: 1, chars: 0 });

  await setScrollTop(page, 0);
  await historyButton(page).click();
  await waitBubbles(page, 121);
  expect(await liveRecord(page)).toEqual({ added: 1, chars: 0 });
});

/**
 * 08f S5-6 변이: `readsSince`가 지키는 건 "기준점 뒤 다른 방 읽음 POST가 섞이지 않음"이다. 방 33 읽음 POST를
 * 일부러 끼워 넣으면 그 단언이 잡아야 한다.
 *
 * 08f R9: 예전엔 `test.fail()`이 맨 앞이라 준비, 사전 검증, 방 33 POST까지 어디서 실패해도 "예상대로 실패"로 통과했다
 * (`readsSince`가 늘 던져도 통과). 이제 준비와 사전 검증은 일반 단언이고, 끼운 뒤 `readsSince`가 요청 수 불일치로
 * 던지는 것만 `rejects`로 기대한다
 */
test("08f S5-6 변이: 기준점 뒤 방 33 읽음 POST를 끼우면 readsSince가 실패", async ({
  page,
}) => {
  await openHistoryRoom(page);
  const mark = await markReads(page);
  /* 끼우기 전엔 통과한다 — 실패가 끼운 POST 때문임을 가른다 */
  expect(await readsSince(page, mark)).toEqual([]);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/retail/chat/rooms/33/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastReadSequence: 1 }),
    });
    return response.status;
  });
  expect(status, "방 33 읽음 POST가 실제로 나갔다").toBe(200);
  await settled(page, READ_POST);
  /* 읽음 POST 전체 수(방 1 + 방 33)와 방 1 수가 어긋나 readsSince 안의 개수 단언이 던진다 */
  await expect(readsSince(page, mark)).rejects.toThrow(/toBe/);
});

test.describe("S4-10 긴 왕복", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("21~70 불러온 채 위 → 입력창 포커스, 844 → 600 → 844 → incoming 1 → '새 메시지 1개' → 상품 상세 → 뒤로 → 바닥에서 시작, 21~70 있음, before 0, 버튼 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await wheelUpTo(page);
    await waitBubbles(page, 100);
    await composer(page).focus();
    /* 예전 200ms 둘 대신(08g S5-11): 창 크기 변화가 log 높이에 닿은 것을 본다 */
    let height = await logHeight(page);
    await page.setViewportSize({ width: 390, height: 600 });
    await logHeightChangedFrom(page, height);
    height = await logHeight(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await logHeightChangedFrom(page, height);
    await incoming(page, 1, "왕복 전 답");
    await waitSequence(page, 121);
    await expect(jumpButton(page)).toHaveAccessibleName(
      "새 메시지 1개, 아래로 이동",
    );

    /* 상품 상세 — 클라이언트 이동이라 목과 캐시가 남는다. 홈 로고 → 첫 상품 */
    await page.getByRole("banner").getByRole("link").first().click();
    await expect(page).toHaveURL("/");
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page).toHaveURL(/\/products\/\d+/);
    const before = await count(page, BEFORE_GET);
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/chats\/1/);

    await waitBubbles(page, 101);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
    await expect(jumpButton(page)).toHaveCount(0);
    /* 예전 500ms 대신(08g S5-11): 위끝 scroll 이벤트를 방 화면이 처리한 뒤 센다. 자동 불러오기는 그 처리 안에서
       요청을 시작한다(`shouldAutoLoadOlder` → `fetchOlder`) */
    await scrollLogAndWait(page, { top: 0 });
    await expect(log(page).locator('[data-sequence="21"]')).toBeAttached();
    expect(await count(page, BEFORE_GET)).toBe(before);
    expect(await bubbles(page).count()).toBe(101);
  });
});
