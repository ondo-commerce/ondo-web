import { expect, test, type Page } from "@playwright/test";
import {
  appAlert,
  assertStubServers,
  box,
  chatMock,
  chatNav,
  composer,
  COUNT_GET,
  count,
  countLoginNavigations,
  flushUntil,
  incoming,
  navBadge,
  navUnread,
  pageOverflow,
  pauseClock,
  READ_POST,
  readBodies,
  requests,
  ROOMS_GET,
  roomList,
  roomRow,
  runPolls,
  runToNextCount,
  sendButton,
  setVisibility,
  settled,
  start,
  stubRequests,
  waitCount,
} from "./helpers";

/**
 * #297 S2 — 소매 헤더 `채팅` 링크와 배지, `/chats` 첫 장, 방 읽음. 와이어프레임 `18_retail-chat`
 * `#state-chat-nav` `#state-chat-list` `#state-chat-read` `#state-loading` `#state-empty` `#state-error`.
 *
 * 간격을 재는 테스트는 시계를 멈추고 `runFor`로만 민다. 고정 대기는 없다.
 */

assertStubServers();

const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

/** 헤더 → `/chats` → 방 1. 클라이언트 이동이라 걸어 둔 목 상태가 남는다 */
async function openRoomFromList(page: Page): Promise<void> {
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toBeVisible();
}

/** 다음 count가 반영될 때까지 30초씩 민다(흐르는 시계) */
async function nextCount(page: Page): Promise<void> {
  const before = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, before + 1);
  await settled(page, COUNT_GET);
}

test("S2-1 채팅 링크는 장바구니 왼쪽 32px(390 44px), /chats 와 /chats/1 에서 aria-current", async ({
  page,
}) => {
  await start(page, "/");
  const nav = chatNav(page);
  const cart = page
    .getByRole("banner")
    .getByRole("link", { name: /^장바구니/ });
  const wish = page.getByRole("banner").getByRole("link", { name: "찜 목록" });
  const n = await box(nav);
  expect([Math.round(n.width), Math.round(n.height)]).toEqual([32, 32]);
  expect(n.x).toBeGreaterThan((await box(wish)).x);
  expect(n.x).toBeLessThan((await box(cart)).x);
  await expect(nav).not.toHaveAttribute("aria-current");

  await nav.click();
  await expect(page).toHaveURL("/chats");
  await expect(chatNav(page)).toHaveAttribute("aria-current", "page");
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(chatNav(page)).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await box(chatNav(page));
  expect([Math.round(phone.width), Math.round(phone.height)]).toEqual([44, 44]);
});

test("S2-2 배지 3 → 이름 '채팅, 안 읽은 메시지 3개', 100 → 99+, 0 → 배지 없음 '채팅'", async ({
  page,
}) => {
  await start(page, "/");
  const seed = await navUnread(page);
  expect(seed, "시드가 3을 넘으면 이 시험이 뜻이 없다").toBeLessThanOrEqual(3);
  if (seed < 3) await incoming(page, 1, "답", { count: 3 - seed });
  await nextCount(page);
  await expect(chatNav(page)).toHaveAccessibleName("채팅, 안 읽은 메시지 3개");
  await expect(navBadge(page)).toHaveText("3");

  await incoming(page, 1, "답", { count: 97 });
  await nextCount(page);
  await expect(chatNav(page)).toHaveAccessibleName(
    "채팅, 안 읽은 메시지 100개",
  );
  await expect(navBadge(page)).toHaveText("99+");

  await chatMock(page, "reset", { empty: true });
  await nextCount(page);
  await expect(chatNav(page)).toHaveAccessibleName("채팅");
  await expect(navBadge(page)).toHaveCount(0);
});

test("S2-3 셸 진입 1회, 30초마다 1회, 숨김 60초 0회, 다시 보이면 즉시 1회", async ({
  page,
}) => {
  await start(page, "/");
  const first = await count(page, COUNT_GET);
  await pauseClock(page);

  await page.clock.runFor(29_000);
  expect(await count(page, COUNT_GET), "30초 전에는 0회").toBe(first);
  await runToNextCount(page, 2_000);

  await setVisibility(page, "hidden");
  await page.clock.runFor(60_000);
  expect(await count(page, COUNT_GET), "숨김 60초 동안 0회").toBe(first + 1);

  await setVisibility(page, "visible");
  await waitCount(page, COUNT_GET, first + 2);
});

for (const status of [401, 403] as const) {
  test(`S2-3 count ${status} → /login 이동 0, 아이콘만, 60초 요청 0, 그 뒤 방 1은 끊김 아님`, async ({
    page,
  }) => {
    const loginNavs = countLoginNavigations(page);
    await start(page, "/");
    await incoming(page, 1, "답");
    await nextCount(page);
    await expect.poll(() => navUnread(page)).toBeGreaterThan(0);

    await chatMock(page, "fail", { op: "count", status });
    await pauseClock(page);
    await runToNextCount(page, 30_000);
    await flushUntil(
      page,
      async () => (await chatNav(page).getAttribute("aria-label")) === "채팅",
    );
    await expect(navBadge(page)).toHaveCount(0);

    const stopped = await count(page, COUNT_GET);
    await page.clock.runFor(60_000);
    expect(await count(page, COUNT_GET), "멈춘 뒤 60초 요청 0회").toBe(stopped);
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.clock.runFor(100);
    expect(await count(page, COUNT_GET), "탭 복귀도 안 부른다").toBe(stopped);

    await page.clock.resume();
    expect(loginNavs()).toBe(0);
    await expect(page).toHaveURL("/");

    /* 방 세션 잠금을 안 건드렸다 — 방 1은 끊김 줄 없이 보내기가 열린다 */
    await openRoomFromList(page);
    await composer(page).fill("가나다");
    await expect(sendButton(page)).toBeEnabled();
    await expect(appAlert(page).filter({ hasText: SESSION_LOST })).toHaveCount(
      0,
    );
    expect(await count(page, COUNT_GET), "방에 와도 다시 돌지 않는다").toBe(
      stopped,
    );
    expect(loginNavs()).toBe(0);
  });
}

test("S2-3 500 연속 → 문구 0, 다음 간격 60, 120, 300초, 성공 뒤 30초", async ({
  page,
}) => {
  await start(page, "/");
  await chatMock(page, "fail", { op: "count", status: 500, times: 3 });
  await pauseClock(page);

  await runToNextCount(page, 30_000); // 1번째 실패
  await expect(chatNav(page)).toHaveAccessibleName("채팅");
  for (const gap of [60_000, 120_000, 300_000]) {
    const n = await count(page, COUNT_GET);
    await page.clock.runFor(gap - 1_000);
    expect(await count(page, COUNT_GET), `${gap / 1000}초 전에는 0회`).toBe(n);
    await runToNextCount(page, 2_000);
  }
  /* 300초 뒤 것은 성공 → 다시 30초 */
  const n = await count(page, COUNT_GET);
  await page.clock.runFor(29_000);
  expect(await count(page, COUNT_GET)).toBe(n);
  await runToNextCount(page, 2_000);

  await expect(page.getByRole("banner").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("banner")).not.toContainText(/못했어요|문제/);
});

test("S2-4 /chats 행(도매처, 한 줄, 시각, 안 읽음), 행 → ?from=/chats, 돌아가기 → /chats", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "네 내일 오전에 주문 넣어 주시면 바로 챙길게요");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(
    page.getByRole("heading", { level: 1, name: "채팅" }),
  ).toBeVisible();

  const row = roomRow(page, 1);
  await expect(row).toContainText("무드온");
  await expect(row).toContainText(
    "네 내일 오전에 주문 넣어 주시면 바로 챙길게요",
  );
  await expect(row).toContainText("14:20");
  await expect(row).toHaveAccessibleName(/안 읽은 메시지 [1-9]\d*개$/);
  await expect(row).toHaveAttribute("href", "/chats/1?from=/chats");
  /* 목록 맨 위 = 방금 답이 온 방 */
  await expect(
    roomList(page).locator("a[data-room-id]").first(),
  ).toHaveAttribute("data-room-id", "1");
  /* 목록에선 읽음을 안 보낸다 */
  expect(await count(page, READ_POST)).toBe(0);

  await row.click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  const back = page.getByRole("link", { name: "채팅 목록", exact: true });
  await expect(back).toHaveAttribute("href", "/chats");
  await back.click();
  await expect(page).toHaveURL("/chats");
  await expect(roomRow(page, 1)).toBeVisible();
});

test("S2-4 방 0개 → 빈 상태 문구", async ({ page }) => {
  await start(page, "/");
  await chatMock(page, "reset", { empty: true });
  await chatNav(page).click();
  await expect(
    page.getByText("아직 대화가 없어요", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("상품 화면에서 문의하면 여기에 쌓여요", { exact: true }),
  ).toBeVisible();
  await expect(roomList(page)).toHaveCount(0);
});

test("S2-4 rooms 500 → 오류 + 다시 시도, 누르면 1회 다시 받아 행", async ({
  page,
}) => {
  await start(page, "/");
  await chatMock(page, "fail", { op: "rooms", status: 500 });
  await chatNav(page).click();
  await expect(
    appAlert(page).filter({ hasText: "대화 목록을 불러오지 못했어요" }),
  ).toBeVisible();
  await settled(page, ROOMS_GET);
  const before = await count(page, ROOMS_GET);
  expect(before, "앱 기본 재시도가 없다").toBe(1);

  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(roomRow(page, 1)).toBeVisible();
  expect(await count(page, ROOMS_GET)).toBe(before + 1);
});

test("S2-5 읽음 1회, 도매 답 뒤 1회 더, reload 없이 배지 감소, 숨김 중 0회", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "답이에요");
  await nextCount(page);
  await expect.poll(() => navUnread(page)).toBeGreaterThan(0);
  const before = await navUnread(page);

  await openRoomFromList(page);
  await waitCount(page, READ_POST, 1);
  await settled(page, READ_POST);
  /* 읽음 성공 → count 다시 받기 → 배지 감소(30초 전, reload 없이) */
  await expect.poll(() => navUnread(page)).toBeLessThan(before);
  expect(await count(page, READ_POST), "다시 그려져도 1회").toBe(1);

  await incoming(page, 1, "하나 더요");
  await waitCount(page, READ_POST, 2);
  const [a, b] = await readBodies(page);
  expect(b?.lastReadSequence).toBeGreaterThan(a?.lastReadSequence ?? 0);

  /* 숨김 중엔 도매 답이 와도 읽음 0회. 보이면 그 위치로 1회 */
  await setVisibility(page, "hidden");
  await incoming(page, 1, "숨김 중 답");
  await page.clock.fastForward(10_000);
  expect(await count(page, READ_POST)).toBe(2);
  await setVisibility(page, "visible");
  await waitCount(page, READ_POST, 3);
});

test("S2-5 읽음 500 → 다음 polling 에 같은 lastReadSequence 다시", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "답이에요");
  await chatMock(page, "fail", { op: "read", status: 500 });
  await openRoomFromList(page);
  await waitCount(page, READ_POST, 1);
  await settled(page, READ_POST);
  expect((await requests(page, READ_POST))[0]?.status).toBe(500);

  await pauseClock(page);
  await runPolls(page, 1);
  await flushUntil(page, async () => (await count(page, READ_POST)) === 2);
  const [first, second] = await readBodies(page);
  expect(second?.lastReadSequence).toBe(first?.lastReadSequence);
  /* 화면에 실패 문구 없음 */
  await expect(appAlert(page)).toHaveCount(0);
});

test("S2-6 (가) 늦게 온 작은 읽음 응답은 아는 위치를 안 내리고 읽음을 더 안 보낸다", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "답이에요");
  await chatMock(page, "delay", { op: "read", ms: 5_000 });
  await openRoomFromList(page);
  await waitCount(page, READ_POST, 1);
  await pauseClock(page);

  /* 첫 읽음(작은 값)이 붙잡힌 사이 도매 답 2개 → polling → 큰 값 읽음, 바로 성공 */
  await incoming(page, 1, "추가 답", { count: 2 });
  await runPolls(page, 1);
  await flushUntil(page, async () => (await count(page, READ_POST)) === 2);
  await settled(page, { path: /\/chat\/rooms\/1\/messages/ });
  const [small, big] = await readBodies(page);
  expect(big?.lastReadSequence).toBe((small?.lastReadSequence ?? 0) + 2);
  await flushUntil(
    page,
    async () => (await requests(page, READ_POST))[1]?.status === 200,
  );
  await flushUntil(page, async () => (await navUnread(page)) === 0);

  /* 늦은 작은 응답 도착 → polling 몇 번 → 읽음 POST 그대로 2 */
  await page.clock.runFor(5_000);
  await settled(page, READ_POST);
  await runPolls(page, 3);
  expect(await count(page, READ_POST)).toBe(2);
  expect(await navUnread(page)).toBe(0);
});

test("S2-6 (나) 읽음 전에 떠난 늦은 count 가 사라진 배지를 되살리지 않는다", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "답이에요");
  await nextCount(page);
  await expect.poll(() => navUnread(page)).toBeGreaterThan(0);
  await chatNav(page).click();
  await expect(roomRow(page, 1)).toBeVisible();

  /* count 시작(읽기 전 숫자를 들고 5초 뒤 도착) */
  await chatMock(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const started = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, started + 1);

  /* 그 응답 전에 방을 열어 읽음 성공 → count 다시 받기 */
  await roomRow(page, 1).click();
  await flushUntil(page, async () => (await count(page, READ_POST)) === 1);
  await flushUntil(
    page,
    async () => (await count(page, COUNT_GET)) === started + 2,
  );
  await flushUntil(page, async () => (await navUnread(page)) === 0);

  /* 늦은 count(읽기 전 숫자) 도착 → 배지 없음 그대로 */
  await page.clock.runFor(5_000);
  await page.clock.runFor(100);
  await expect(chatNav(page)).toHaveAccessibleName("채팅");
  await expect(navBadge(page)).toHaveCount(0);
});

test("S2-7 읽음 401 → 주소와 쓰던 글 그대로, 보내기 잠김", async ({ page }) => {
  const loginNavs = countLoginNavigations(page);
  await start(page, "/");
  await openRoomFromList(page);
  await settled(page, READ_POST);
  await composer(page).fill("가나다");

  await chatMock(page, "fail", { op: "read", status: 401 });
  await incoming(page, 1, "답이에요");
  await expect(appAlert(page).filter({ hasText: SESSION_LOST })).toBeVisible();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toHaveValue("가나다");
  await expect(sendButton(page)).toBeDisabled();
  expect(loginNavs()).toBe(0);
});

test("S2-8 목 모드 첫 진입 — 가짜 API 에 unread-count, chat/rooms 요청 0건", async ({
  page,
}) => {
  const ours = (paths: string[]) =>
    paths.filter((p) => /unread-count|\/chat\/rooms/.test(p));
  const before = ours(await stubRequests(page));
  await start(page, "/");
  await chatNav(page).click();
  await expect(roomRow(page, 1)).toBeVisible();
  await settled(page, ROOMS_GET);
  expect(ours(await stubRequests(page))).toEqual(before);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1470, height: 900 },
]) {
  test(`S2-9 ${viewport.width}x${viewport.height} 헤더 가로 스크롤 0, 배지 중심점이 채팅 링크 안`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page, "/");
    await incoming(page, 1, "답", { count: 100 });
    await nextCount(page);
    await expect(navBadge(page)).toHaveText("99+");

    expect((await pageOverflow(page)).x).toBe(0);
    const badge = await box(navBadge(page));
    const inside = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.closest("a")?.getAttribute("href") ?? null;
      },
      { x: badge.x + badge.width / 2, y: badge.y + badge.height / 2 },
    );
    expect(inside).toBe("/chats");
  });
}
