import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";
import {
  AFTER_GET,
  afterSequences,
  alignTop,
  assertStubServers,
  BEFORE_GET,
  beforeSequences,
  beforeStatus,
  bubbles,
  chatMock,
  chatNav,
  collectPageErrors,
  composer,
  count,
  drawnSequences,
  enterFromList,
  firstVisible,
  historyButton,
  historyEnd,
  historyFail,
  incoming,
  log,
  logMetrics,
  lostAlert,
  MESSAGES_GET,
  openHistoryRoom,
  requests,
  ROOM_LONG,
  ROOM_SHORT,
  scrollToBottom,
  setScrollTop,
  topOf,
  waitBubbles,
  wheelUpTo,
} from "./retail-history-helpers";

/**
 * loop-08d #351 S3 — 소매 이전 장의 순서 역전(S3-6), 기다리는 동안 움직인 사장의 위치(S3-7), 세션 칸(S3-9).
 * 늦은 응답은 목 `delay {page}`로만 만든다. 응답 값은 요청 시점에 정해진다. `pnpm e2e:stub`.
 */

assertStubServers();

/** `[data-cursor]`(polling이 빠짐없이 이어 받은 위쪽 끝) */
function cursorOf(page: Page): Promise<number> {
  return log(page)
    .getAttribute("data-cursor")
    .then((v) => Number(v));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** S3-6 ①② 끝 상태: 21~180 각 1개, cursor 180, 다음 polling afterSequence=180, 맨 위 이전 메시지 보기 */
async function expectMerged21to180(page: Page): Promise<void> {
  await waitBubbles(page, 160);
  expect(await drawnSequences(page)).toEqual(range(21, 180));
  expect(await cursorOf(page)).toBe(180);
  await expect
    .poll(async () => (await afterSequences(page)).includes(180), {
      timeout: 8000,
    })
    .toBe(true);
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
}

test.describe("S3-6 이전 장과 polling 순서", () => {
  test("① before 늦음 → incoming 60 → after 가 먼저 끝(121~180) → before 끝 → 21~180, cursor 180, afterSequence=180, 이전 메시지 보기", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    /* polling 간격(3초) 한 번 + 이어 받기가 before 보다 먼저 끝나게 6초(기획 3초는 after 가 바로 돈다는 가정) */
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 6000,
    });
    await historyButton(page).click();
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    await incoming(page, ROOM_LONG, "새 답", { count: 60 });
    await expect.poll(() => cursorOf(page), { timeout: 8000 }).toBe(180);
    expect(await beforeStatus(page, 0), "after 가 먼저 끝남").toBeNull();
    await expectMerged21to180(page);
    expect(await beforeSequences(page)).toEqual([71]);
  });

  test("② after 늦음 + incoming 60 → 이전(71)이 먼저 끝 → after 끝 → 같은 끝 상태", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await chatMock(page, "delay", {
      op: "messages",
      page: "after",
      ms: 3000,
    });
    await incoming(page, ROOM_LONG, "새 답", { count: 60 });
    /* 늦춘 after 가 날아가는 중일 때 이전 장 */
    await expect
      .poll(
        async () =>
          (await requests(page, AFTER_GET)).some((r) => r.status === null),
        { timeout: 8000 },
      )
      .toBe(true);
    await historyButton(page).click();
    await waitBubbles(page, 100);
    expect(await cursorOf(page), "before 가 먼저 끝남").toBe(120);
    await expectMerged21to180(page);
    expect(await beforeSequences(page)).toEqual([71]);
  });

  test("③ before 응답 전 방 1 → /chats → 방 33 → 방 1: 방 33 추가 0, before 새 요청 0, 바닥에서 시작, 위에 21~70", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 3000,
    });
    await historyButton(page).click();
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");

    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await enterFromList(page, ROOM_SHORT);
    await expect(bubbles(page).first()).toBeVisible();
    const short = await drawnSequences(page);
    await expect.poll(() => beforeStatus(page, 0), { timeout: 8000 }).toBe(200);
    await page.waitForTimeout(500);
    expect(await drawnSequences(page), "방 33 말풍선 그대로").toEqual(short);

    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await enterFromList(page, ROOM_LONG);
    await waitBubbles(page, 100);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeLessThanOrEqual(1);
    await setScrollTop(page, 0);
    await expect(log(page).locator('[data-sequence="21"]')).toBeAttached();
    await expect(log(page).locator('[data-sequence="70"]')).toBeAttached();
    await page.waitForTimeout(500);
    expect(await beforeSequences(page)).toEqual([71]);
  });
});

test.describe("S3-7 기다리는 동안 움직인 사장", () => {
  async function startSlowOlder(page: Page): Promise<void> {
    await openHistoryRoom(page);
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 3000,
    });
    await wheelUpTo(page);
    await expect.poll(() => beforeSequences(page)).toEqual([71]);
  }

  test("① 바닥까지 내림 → 응답 뒤 바닥 거리 ≤ 1px", async ({ page }) => {
    await startSlowOlder(page);
    await scrollToBottom(page);
    await waitBubbles(page, 100);
    await page.waitForTimeout(200);
    expect((await logMetrics(page)).fromBottom).toBeLessThanOrEqual(1);
  });

  test("② 보냄 → 바닥, 내 말풍선 보임(응답 뒤에도)", async ({ page }) => {
    await startSlowOlder(page);
    await composer(page).fill("기다리는 중 보낸 글");
    await composer(page).press("Enter");
    const mine = log(page).getByText("기다리는 중 보낸 글");
    await expect(mine).toBeInViewport();
    await waitBubbles(page, 101);
    await page.waitForTimeout(200);
    expect((await logMetrics(page)).fromBottom).toBeLessThanOrEqual(1);
    await expect(mine).toBeInViewport();
  });

  test("③ 90을 위끝에 → 응답 뒤 90 top 이동 ≤ 4px", async ({ page }) => {
    await startSlowOlder(page);
    await alignTop(page, 90);
    await page.waitForTimeout(100);
    const before = await topOf(page, 90);
    await waitBubbles(page, 100);
    await page.waitForTimeout(200);
    expect(Math.abs((await topOf(page, 90)) - before)).toBeLessThanOrEqual(4);
    expect(await firstVisible(page)).toBeGreaterThanOrEqual(89);
  });
});

/* --- 세션 칸(§4-1) ------------------------------------------------------------ */

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await chatMock(page, "me", { retailerId: RETAILERS[key].retailerId });
  await page.getByLabel("이메일").fill(RETAILERS[key].email);
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** 다른 탭에서 같은 소매처(bombom) 로그인 */
async function sameAccountRelogin(page: Page): Promise<void> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await tab.getByLabel("이메일").fill(RETAILERS.bombom.email);
  await tab.getByLabel("비밀번호").fill("ondo1234!");
  await tab.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(tab).toHaveURL(/\/$/);
  await page.bringToFront();
}

/** 목이 돌려준 계획 실패(`/__mock/chat/log`) */
async function plannedBefore(page: Page, status: number): Promise<number> {
  const data = await page.evaluate(async () => {
    const r = await fetch("/__mock/chat/log");
    return ((await r.json()) as { data: { page: string; status: number }[] })
      .data;
  });
  return data.filter((f) => f.page === "before" && f.status === status).length;
}

test("S3-9 ① [로그아웃, 이전 장] before 응답 전 로그아웃 → miso 로그인 → 4초 뒤 소매처 1 말풍선 0, pageerror 0", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await routeAuth(page);
  await openHistoryRoom(page);
  await chatMock(page, "delay", { op: "messages", page: "before", ms: 3000 });
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
  await logout(page);
  await loginAs(page, "miso");
  await expect
    .poll(() => beforeStatus(page, 0), { timeout: 8000 })
    .not.toBeNull();
  await page.waitForTimeout(4000);
  await expect(page.getByText(/^메시지 \d+$/)).toHaveCount(0);

  /* miso 의 방 2 — 소매처 1 의 옛 메시지("메시지 N")가 하나도 없다 */
  await enterFromList(page, 2);
  await expect(bubbles(page).first()).toBeVisible();
  await expect(log(page).getByText(/^메시지 \d+$/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

/**
 * 08d R2: 위 ①은 miso 가 방 1 을 안 열어 늦은 200 이 "캐시 없음"에서 끝난다 — 세대 검사를 다 지워도 통과했다.
 * 여기서는 같은 소매처로 다시 들어와 방 1 캐시를 **새로 만든 뒤** 옛 before 200 이 도착하게 한다. 세대 검사가 없으면
 * 옛 응답(21~70)이 새 캐시에 합쳐진다. 기대(§4-1 로그아웃 × 이전 장): 버림 — 71~120 그대로, 상태 칸도 안 씀
 */
test("S3-9 ① R2 before 응답 전 로그아웃 → 같은 소매처 로그인 → 방 1 다시 엶 → 옛 200 도착 → 71~120만, 이전 메시지 보기", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await routeAuth(page);
  await openHistoryRoom(page);
  await chatMock(page, "delay", { op: "messages", page: "before", ms: 8000 });
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
  await logout(page);
  await loginAs(page, "bombom");
  await enterFromList(page, ROOM_LONG);
  await waitBubbles(page, 50);
  expect(await beforeStatus(page, 0), "새 캐시가 먼저 생김").toBeNull();

  await expect.poll(() => beforeStatus(page, 0), { timeout: 12_000 }).toBe(200);
  await page.waitForTimeout(1000);
  expect(await drawnSequences(page)).toEqual(range(71, 120));
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
  await expect(historyButton(page)).not.toHaveAttribute("aria-busy", "true");
  expect(errors).toEqual([]);
});

/**
 * 08d R1(§4-1 잠금 범위: 소매는 방 화면 하나). 방 1 이전 장을 401(지연)로 띄워 둔 채 방 33 으로 옮긴다. 늦은 401 은 떠난
 * 방 화면의 것이라 방 33 을 잠그지 않는다 — 끊김 줄 0, 쓰기 가능, polling 계속. 방 1 로 돌아오면 자리는
 * `이전 메시지 보기`(불러오는 중에 갇히지 않음). 다시 누르면 새 요청이 나간다
 */
test("R1 방 1 이전 장 401(지연) → 방 33 → 늦은 401 도착 → 방 33 잠금 0, polling 계속 → 방 1 자리 이전 메시지 보기", async ({
  page,
}) => {
  await openHistoryRoom(page);
  await chatMock(page, "fail", { op: "messages", page: "before", status: 401 });
  await chatMock(page, "delay", { op: "messages", page: "before", ms: 3000 });
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");

  await enterFromList(page, ROOM_SHORT);
  await expect(bubbles(page).first()).toBeVisible();
  await expect.poll(() => plannedBefore(page, 401), { timeout: 8000 }).toBe(1);
  await page.waitForTimeout(800);
  await expect(lostAlert(page)).toHaveCount(0);
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  const at = await count(page, MESSAGES_GET);
  await page.waitForTimeout(4000);
  expect(await count(page, MESSAGES_GET), "방 33 polling 4초").toBeGreaterThan(
    at,
  );

  await enterFromList(page, ROOM_LONG);
  await waitBubbles(page, 50);
  await expect(historyButton(page)).toHaveText("이전 메시지 보기");
  await expect(historyButton(page)).not.toHaveAttribute("aria-busy", "true");
  await historyButton(page).click();
  await waitBubbles(page, 100);
});

test.describe("S3-9 ② [같은 계정, 이전 장] 다른 탭 bombom 로그인", () => {
  /** A = 늦춘 before 71. 출발 → 같은 소매처 로그인 → 자리가 `이전 메시지 보기`로 돌아옴 */
  async function startLateOlder(page: Page): Promise<void> {
    await historyButton(page).click();
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    expect(await count(page, BEFORE_GET)).toBe(1);
    await sameAccountRelogin(page);
    await expect(historyButton(page)).toHaveText("이전 메시지 보기", {
      timeout: 5000,
    });
    await expect(historyButton(page)).not.toHaveAttribute("aria-busy", "true");
  }

  test("① A 200이 B, C 뒤에 도착 → 버튼 0, 대화 처음이에요, 120개 각 1개, 위치 이동 ≤ 4px", async ({
    page,
  }) => {
    await routeAuth(page);
    await openHistoryRoom(page);
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 6000,
      times: 1,
    });
    await startLateOlder(page);

    await historyButton(page).click();
    await waitBubbles(page, 100);
    await historyButton(page).click();
    await waitBubbles(page, 120);
    await expect(historyEnd(page)).toBeVisible();
    expect(await beforeStatus(page, 0), "A가 C보다 먼저 끝남").toBeNull();

    const anchor = await firstVisible(page);
    const top = await topOf(page, anchor);
    await expect
      .poll(() => beforeStatus(page, 0), { timeout: 10_000 })
      .toBe(200);
    await page.waitForTimeout(2000);

    await expect(historyButton(page)).toHaveCount(0);
    await expect(historyEnd(page)).toBeVisible();
    const seqs = await drawnSequences(page);
    expect(seqs).toHaveLength(120);
    expect(new Set(seqs).size).toBe(120);
    expect(Math.abs((await topOf(page, anchor)) - top)).toBeLessThanOrEqual(4);
  });

  test("② A 500이 B 진행 중 도착 → 그 자리 불러오는 중 그대로, 실패 줄 0 → B 도착 → 21~70", async ({
    page,
  }) => {
    await routeAuth(page);
    await openHistoryRoom(page);
    await chatMock(page, "fail", {
      op: "messages",
      page: "before",
      status: 500,
    });
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 4000,
    });
    await startLateOlder(page);

    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 5000,
    });
    await historyButton(page).click();
    await expect
      .poll(() => beforeStatus(page, 0), { timeout: 10_000 })
      .toBe(500);
    expect(await beforeStatus(page, 1), "B가 A보다 먼저 끝남").toBeNull();
    await page.waitForTimeout(300);
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    await expect(historyFail(page)).toHaveCount(0);

    await waitBubbles(page, 100);
    await expect(historyFail(page)).toHaveCount(0);
    expect((await drawnSequences(page))[0]).toBe(21);
  });

  test("③ A 401이 B 뒤에 도착 → 끊김 0, 쓰기 가능, 자리 이전 메시지 보기, polling 계속", async ({
    page,
  }) => {
    await routeAuth(page);
    await openHistoryRoom(page);
    await chatMock(page, "fail", {
      op: "messages",
      page: "before",
      status: 401,
    });
    await chatMock(page, "delay", {
      op: "messages",
      page: "before",
      ms: 6000,
    });
    await startLateOlder(page);

    await historyButton(page).click();
    await waitBubbles(page, 100);
    await expect
      .poll(() => plannedBefore(page, 401), { timeout: 10_000 })
      .toBe(1);
    await page.waitForTimeout(1000);

    await expect(lostAlert(page)).toHaveCount(0);
    await expect(composer(page)).not.toHaveAttribute("readonly", "");
    await expect(historyButton(page)).toHaveText("이전 메시지 보기");
    const at = await count(page, MESSAGES_GET);
    await expect
      .poll(() => count(page, MESSAGES_GET), { timeout: 10_000 })
      .toBeGreaterThan(at);
  });
});
