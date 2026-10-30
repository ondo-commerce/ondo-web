import { expect, test, type Page } from "@playwright/test";
import {
  appAlert,
  assertSameDay,
  assertStubServers,
  bell,
  bellBadge,
  box,
  chatMock,
  chatNav,
  composer,
  count,
  COUNT_GET,
  countLoginNavigations,
  fmtEta,
  flushUntil,
  incoming,
  injectEta,
  LIST_GET,
  logoutThenLogin,
  markAllButton,
  moreButton,
  navBadge,
  navUnread,
  newerButton,
  notificationReads,
  notifyMock,
  NREAD_POST,
  openPanel,
  openRoomFromList,
  panel,
  pauseClock,
  plus,
  R,
  requests,
  routeAuth,
  rowById,
  rowIds,
  rows,
  runToNextCount,
  settled,
  startNotify,
  stubEta,
  stubRequests,
  tableDate,
  unreadRows,
  waitCount,
} from "./helpers";

/**
 * #305 S2 — 소매 헤더 종과 알림 패널. 와이어프레임 `20_retail-notifications/00_index.html`
 * `#state-bell` `#state-panel` `#state-loading` `#state-empty` `#state-error` `#state-more` `#state-new`
 * `#state-mark-all` `#state-409` `#state-row` `#state-arrive`. 셀렉터는 role과 그 문서의 `data-ac` 그대로.
 *
 * 시드(알림 목): 22개, 안 읽음 2(첫 행 2022 린넨 입고일 변경, 21번째 2002), 모르는 type 2011(읽음),
 * 2번째 2021 무드온 주문 확정(읽음, /orders/7001). 시각은 reset 시각 − 24시간부터라 첫 행이 "M/D 14:20".
 *
 * 간격, 늦은 응답은 시계를 멈추고 `runFor`로만 민다. 늦은 응답 단언은 요청 기록으로 도착을 본 뒤 잘게 밀며
 * 매 단계 본다(05b-2 F4). 고정 대기는 없다.
 */

assertStubServers();
test.afterAll(assertSameDay);

const SEED_FIRST = 2022;
const SEED_SECOND_PAGE_UNREAD = 2002;
const SEED_ORDER_READ = 2021;
const SEED_UNKNOWN = 2011;

/** 어제 14:20 — 시드 첫 행 시각(R 14:20 − 24시간) */
const YESTERDAY_1420 = (() => {
  const [, m, d] = plus(R, -1).split("-").map(Number);
  return `${m}/${d} 14:20`;
})();

/** 같은 틱에 세 번 누른다 — 렌더가 끼어들 틈 없이 */
async function tripleClick(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el === null) throw new Error(`${sel} 없음`);
    el.click();
    el.click();
    el.click();
  }, selector);
}

/** 패널 안 첫 장이 다 그려질 때까지 */
async function firstPageShown(page: Page): Promise<void> {
  await expect(rows(page)).toHaveCount(20);
  await settled(page, LIST_GET);
}

test("S2-1 종은 채팅 오른쪽 장바구니 왼쪽 32px(390 44px), 2 → '알림, 안 읽음 2개', count 1회로 두 배지", async ({
  page,
}) => {
  await startNotify(page, "/");
  const cart = page
    .getByRole("banner")
    .getByRole("link", { name: /^장바구니/ });
  const b = await box(bell(page));
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([32, 32]);
  expect(b.x).toBeGreaterThan((await box(chatNav(page))).x);
  expect(b.x).toBeLessThan((await box(cart)).x);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 2개");
  await expect(bellBadge(page)).toHaveText("2");
  await expect(bell(page)).toHaveAttribute("aria-haspopup", "dialog");
  await expect(bell(page)).toHaveAttribute("aria-expanded", "false");

  /* 채팅 1 + 알림 1을 같이 넣고 30초 — count 요청 1회에 두 배지가 같이 바뀐다 */
  const chatBefore = await navUnread(page);
  await incoming(page, 1, "답이에요");
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  const before = await count(page, COUNT_GET);
  await page.clock.runFor(29_000);
  expect(await count(page, COUNT_GET), "30초 전엔 0회").toBe(before);
  await runToNextCount(page, 2_000);
  expect(await count(page, COUNT_GET), "30초에 1회(2회 0)").toBe(before + 1);
  await expect(bellBadge(page)).toHaveText("3");
  await expect(navBadge(page)).toHaveText(String(chatBefore + 1));
  expect(await navUnread(page)).toBe(chatBefore + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await box(bell(page));
  expect([Math.round(phone.width), Math.round(phone.height)]).toEqual([44, 44]);
});

test("S2-1 0 → 배지 없음 '알림', 100 → 99+", async ({ page }) => {
  await startNotify(page, "/", { empty: true });
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(bellBadge(page)).toHaveCount(0);

  for (let i = 0; i < 100; i += 1)
    await notifyMock(page, "incoming", {
      type: "ORDER_CONFIRMED",
      orderId: 7001,
    });
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 100개");
  await expect(bellBadge(page)).toHaveText("99+");
});

test("S2-2 / 에서 입고일 변경 주입 → 30초 → 배지 2 → 3", async ({ page }) => {
  await startNotify(page, "/");
  await expect(bellBadge(page)).toHaveText("2");
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(bellBadge(page)).toHaveText("3");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});

for (const status of [401, 403] as const) {
  test(`S2-3 count ${status} → 아이콘만, /login 이동 0. 로그아웃 → 같은 탭 로그인 → 31초 안에 다시 돌아 배지 2`, async ({
    page,
  }) => {
    const loginNavs = countLoginNavigations(page);
    await routeAuth(page);
    await startNotify(page, "/");
    await chatMock(page, "fail", { op: "count", status });
    await pauseClock(page);
    await runToNextCount(page, 30_000);
    await page.clock.resume();
    await expect(bell(page)).toHaveAccessibleName("알림");
    await expect(bellBadge(page)).toHaveCount(0);
    expect(loginNavs(), "count 401/403 이 /login 으로 보내지 않는다").toBe(0);

    await logoutThenLogin(page, "bombom");
    /* 로그인한 셸이 붙자마자 1회 — 31초를 넘기지 않는다 */
    await page.clock.fastForward(31_000);
    await expect(bellBadge(page)).toHaveText("2");
    await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 2개");
  });
}

test("S2-3 패널을 연 뒤 로그아웃 → miso 로그인 + 목록 지연 3초 → 그 3초 동안 옛 행 0, 막대 3줄", async ({
  page,
}) => {
  await routeAuth(page);
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await page.keyboard.press("Escape");

  await logoutThenLogin(page, "miso");
  await notifyMock(page, "delay", { op: "list", ms: 3_000 });
  await pauseClock(page);
  const lists = await count(page, LIST_GET);
  await openPanel(page);
  await waitCount(page, LIST_GET, lists + 1);
  for (let t = 0; t < 2_500; t += 500) {
    await expect(
      panel(page).getByRole("status", { name: "불러오는 중" }),
    ).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await page.clock.runFor(500);
  }
  await page.clock.runFor(1_000);
  await flushUntil(page, async () => (await rows(page).count()) === 20);
});

test("S2-3 /chats/1 에서 '가나다' 쓰는 중 목록 401 → 패널 안 '로그인이 끊겼어요', 이동 0, 글 그대로", async ({
  page,
}) => {
  const loginNavs = countLoginNavigations(page);
  await startNotify(page, "/");
  await openRoomFromList(page);
  await composer(page).fill("가나다");
  await notifyMock(page, "fail", { op: "list", status: 401 });
  await openPanel(page);
  const lost = panel(page)
    .getByRole("alert")
    .filter({ hasText: "로그인이 끊겼어요" });
  await expect(lost).toContainText("다시 로그인하면 알림을 볼 수 있어요");
  await expect(
    panel(page).getByRole("button", { name: "다시 시도" }),
  ).toHaveCount(0);
  await expect(markAllButton(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toHaveValue("가나다");
  expect(loginNavs()).toBe(0);
});

test("S2-3 /chats/1 에서 모두 읽음 401 → 오류 한 줄, 이동 0, 글 그대로, 점 그대로", async ({
  page,
}) => {
  const loginNavs = countLoginNavigations(page);
  await startNotify(page, "/");
  await openRoomFromList(page);
  await composer(page).fill("가나다");
  await openPanel(page);
  await firstPageShown(page);
  await notifyMock(page, "fail", { op: "read", status: 401 });
  await markAllButton(page).click();
  await expect(
    appAlert(page).filter({
      hasText: "로그인이 끊겼어요. 다시 로그인한 뒤 눌러 주세요",
    }),
  ).toBeVisible();
  await expect(rowById(page, SEED_FIRST)).toHaveAttribute(
    "data-unread",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toHaveValue("가나다");
  expect(loginNavs()).toBe(0);
});

/* 03-review R1. 읽음 401이 count를 멈출 때 진행 중 count를 취소하지 않으면, 그 count가 늦게 성공해 `stopped`를 `ok`로
   덮고 배지 2가 되살아나며 polling이 다시 돈다. `stopHeaderCounts`의 취소와 울타리를 빼면 이 테스트가 실패한다 */
test("S2-3 늦은 count(지연 5초) 중 모두 읽음 401 → 배지 0, 늦은 count 도착 뒤에도 0, 그 뒤 60초 count 요청 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await chatMock(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const counts = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, counts + 1);

  await notifyMock(page, "fail", { op: "read", status: 401 });
  await markAllButton(page).click();
  await expect(
    appAlert(page).filter({
      hasText: "로그인이 끊겼어요. 다시 로그인한 뒤 눌러 주세요",
    }),
  ).toBeVisible();
  await expect(bellBadge(page)).toHaveCount(0);
  for (let t = 0; t <= 6_000; t += 500) {
    await expect(bellBadge(page)).toHaveCount(0);
    await page.clock.runFor(500);
  }
  const late = (await requests(page, COUNT_GET))[counts];
  expect(late?.status, "늦은 count가 도착했다").not.toBeNull();
  await expect(bell(page)).toHaveAccessibleName("알림");

  const after = await count(page, COUNT_GET);
  await page.clock.runFor(60_000);
  expect(await count(page, COUNT_GET), "멈춘 뒤 count 요청 0").toBe(after);
  await expect(bellBadge(page)).toHaveCount(0);
});

test("S2-4 닫혀 있으면 목록 0, 열면 1회. 첫 행 title, body, 어제 시각, 점. 더 보기 22개 중복 0. Esc → 종으로 포커스", async ({
  page,
}) => {
  await startNotify(page, "/");
  await page.clock.fastForward(60_000);
  expect(await count(page, LIST_GET), "닫혀 있는 동안 0").toBe(0);

  await openPanel(page);
  await firstPageShown(page);
  expect(await count(page, LIST_GET)).toBe(1);
  await expect(
    panel(page).getByRole("heading", { name: "알림" }),
  ).toBeFocused();
  const first = rows(page).first();
  await expect(first).toHaveAttribute("data-id", String(SEED_FIRST));
  await expect(first).toHaveAttribute("data-unread", "true");
  await expect(first).toContainText("무드온 미송 입고일 변경");
  await expect(first).toContainText(
    `린넨 셋업 자켓 베이지/L 남은 2장, ${fmtEta(plus(R, 5))} → ${fmtEta(plus(R, 7))}`,
  );
  await expect(first).toContainText(YESTERDAY_1420);

  await moreButton(page).click();
  await expect(rows(page)).toHaveCount(22);
  const ids = await rowIds(page);
  expect(new Set(ids).size).toBe(22);
  await expect(moreButton(page)).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(bell(page)).toBeFocused();
});

test("S2-4 빈 상태 문구, 목록 500 → 실패 + 다시 시도 1회 재요청", async ({
  page,
}) => {
  await startNotify(page, "/", { empty: true });
  await openPanel(page);
  await expect(panel(page)).toContainText("새 알림이 없어요");
  await expect(panel(page)).toContainText("미송 입고일이 바뀌면 여기에 쌓여요");
  await expect(markAllButton(page)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await notifyMock(page, "reset");
  await notifyMock(page, "fail", { op: "list", status: 500 });
  const lists = await count(page, LIST_GET);
  await openPanel(page);
  await expect(
    panel(page)
      .getByRole("alert")
      .filter({ hasText: "알림을 불러오지 못했어요" }),
  ).toBeVisible();
  await panel(page).getByRole("button", { name: "다시 시도" }).click();
  await firstPageShown(page);
  expect(await count(page, LIST_GET)).toBe(lists + 2);
});

test("S2-5 안 읽은 BACKORDERS 행 같은 틱 3연타 → read 1회 {ids}, 이동 1회 /backorders?wholesaler=101, 무드온 칩, 배지 −1", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  const history = await page.evaluate(() => history.length);
  await tripleClick(page, `[role="dialog"] [data-id="${SEED_FIRST}"]`);
  await expect(page).toHaveURL("/backorders?wholesaler=101");
  await settled(page, NREAD_POST);
  expect(await count(page, NREAD_POST)).toBe(1);
  expect(await notificationReads(page)).toEqual([{ ids: [SEED_FIRST] }]);
  expect(await page.evaluate(() => history.length)).toBe(history + 1);
  await expect(
    page.getByRole("link", { name: "무드온", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(bellBadge(page)).toHaveText("1");
  await expect(panel(page)).toHaveCount(0);
});

test("S2-5 ORDER 행 → /orders/7001, 읽은 행 POST 0, 모르는 type → button 이동 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  const unknown = rowById(page, SEED_UNKNOWN);
  await expect(unknown).toHaveJSProperty("tagName", "BUTTON");
  await expect(unknown).toHaveText(/결제 기한이 다가와요/);
  await unknown.click();
  await expect(page).toHaveURL("/");
  await expect(panel(page)).toBeVisible();

  await rowById(page, SEED_ORDER_READ).click();
  await expect(page).toHaveURL("/orders/7001");
  expect(await count(page, NREAD_POST), "읽은 행은 POST 0").toBe(0);
});

test("S2-5 read 500 → 이동은 하고 배지 그대로, 문구 0", async ({ page }) => {
  await startNotify(page, "/");
  await notifyMock(page, "fail", { op: "read", status: 500 });
  await openPanel(page);
  await firstPageShown(page);
  await rowById(page, SEED_FIRST).click();
  await expect(page).toHaveURL("/backorders?wholesaler=101");
  await settled(page, NREAD_POST);
  await expect(bellBadge(page)).toHaveText("2");
  await expect(appAlert(page).filter({ hasText: /읽음|알림/ })).toHaveCount(0);
});

test("S2-5 같은 SKU 두 번 바꿈 → 행 2개, 옛 행 본문 그대로, 옛 행 → 지금 날짜. 같은 주소에서 누르면 다시 그림", async ({
  page,
}) => {
  await startNotify(page, "/");
  await injectEta(page, plus(R, 8));
  await injectEta(page, plus(R, 10));
  await stubEta(page, 3019, plus(R, 10));
  await openPanel(page);
  await firstPageShown(page);
  const [newest, older] = await rowIds(page);
  await expect(rows(page).first()).toContainText(
    `${fmtEta(plus(R, 8))} → ${fmtEta(plus(R, 10))}`,
  );
  const old = rowById(page, older ?? 0);
  await expect(old).toContainText(
    `${fmtEta(plus(R, 7))} → ${fmtEta(plus(R, 8))}`,
  );
  expect(newest).toBeGreaterThan(older ?? 0);

  await old.click();
  await expect(page).toHaveURL("/backorders?wholesaler=101");
  const linen = page.locator("table").first().locator("tbody tr").filter({
    hasText: "린넨 셋업 자켓",
  });
  await expect(linen).toContainText(tableDate(plus(R, 10)));

  /* 같은 주소: stub 날짜를 바꾸고 새 행을 누르면 새로고침 없이 서버 화면이 다시 그려진다 */
  await stubEta(page, 3019, plus(R, 12));
  await openPanel(page);
  await firstPageShown(page);
  const history = await page.evaluate(() => history.length);
  await rowById(page, newest ?? 0).click();
  await expect(linen).toContainText(tableDate(plus(R, 12)));
  await expect(page).toHaveURL("/backorders?wholesaler=101");
  expect(await page.evaluate(() => history.length)).toBe(history);
});

test("S2-6 '안 읽은 알림 2개 모두 읽음'(첫 장 안 읽음 1개여도 2), 3연타 POST 1회 → 점 0, 배지 없음, 더 보기 뒤 21번째도 점 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await expect(unreadRows(page)).toHaveCount(1);
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 2개 모두 읽음");
  await tripleClick(page, '[role="dialog"] [data-ac="S2-6"]');
  await settled(page, NREAD_POST);
  expect(await notificationReads(page)).toEqual([
    { all: true, expectedUnread: 2 },
  ]);
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(bellBadge(page)).toHaveCount(0);
  await expect(markAllButton(page)).toHaveCount(0);
  await moreButton(page).click();
  await expect(rows(page)).toHaveCount(22);
  await expect(rowById(page, SEED_SECOND_PAGE_UNREAD)).toHaveAttribute(
    "data-unread",
    "false",
  );
});

test("S2-6 409(연 뒤 주입) → 안내 + 버튼 '3개', 500 → 오류 한 줄", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await injectEta(page, plus(R, 10));
  await markAllButton(page).click();
  await expect(
    panel(page).getByRole("status").filter({
      hasText: "그 사이 알림이 바뀌었어요. 확인하고 다시 눌러 주세요",
    }),
  ).toBeVisible();
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");
  await expect(rows(page).first()).toContainText(`→ ${fmtEta(plus(R, 10))}`);

  await notifyMock(page, "fail", { op: "read", status: 500 });
  await markAllButton(page).click();
  await expect(
    appAlert(page).filter({
      hasText: "읽음으로 바꾸지 못했어요. 다시 눌러 주세요",
    }),
  ).toBeVisible();
  await expect(unreadRows(page)).toHaveCount(2);
});

test("S2-6 '새 알림 보기' 줄이 뜬 채 모두 읽음 → POST 0, 안내 + 첫 장 다시", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(newerButton(page)).toBeVisible();
  const lists = await count(page, LIST_GET);
  await markAllButton(page).click();
  await expect(
    panel(page)
      .getByRole("status")
      .filter({ hasText: "새 알림이 왔어요. 확인하고 다시 눌러 주세요" }),
  ).toBeVisible();
  await waitCount(page, LIST_GET, lists + 1);
  expect(await count(page, NREAD_POST)).toBe(0);
  await flushUntil(page, async () => (await newerButton(page).count()) === 0);
});

test("S2-6 R1 목록 지연 3초 중 모두 읽음 → 늦은 목록 도착(요청 기록) 뒤에도 점 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await notifyMock(page, "delay", { op: "list", ms: 3_000 });
  await pauseClock(page);
  await openPanel(page);
  await waitCount(page, LIST_GET, 1);
  await markAllButton(page).click();
  await waitCount(page, NREAD_POST, 1);
  await settled(page, NREAD_POST);
  /* 다시 받은 목록(지연 1회는 이미 씀)이 그려진다 */
  await flushUntil(page, async () => (await rows(page).count()) === 20);
  for (let t = 0; t <= 3_500; t += 500) {
    await expect(unreadRows(page)).toHaveCount(0);
    await page.clock.runFor(500);
  }
  const first = (await requests(page, LIST_GET))[0];
  expect(first?.status, "늦은 첫 목록이 도착했다").not.toBeNull();
  await expect(unreadRows(page)).toHaveCount(0);
});

test("S2-7 연 뒤 주입 → 30초 → 행 수, 첫 행, 스크롤 그대로 + '새 알림 보기'. 누르면 첫 행이 새 알림, 중복 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  const list = panel(page).locator(".overflow-y-auto");
  await list.evaluate((el) => el.scrollTo({ top: 200 }));
  const top = await list.evaluate((el) => el.scrollTop);
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(newerButton(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(20);
  await expect(rows(page).first()).toHaveAttribute(
    "data-id",
    String(SEED_FIRST),
  );
  expect(await list.evaluate((el) => el.scrollTop)).toBe(top);

  await page.clock.resume();
  await newerButton(page).click();
  await expect(newerButton(page)).toHaveCount(0);
  await expect(rows(page).first()).not.toHaveAttribute(
    "data-id",
    String(SEED_FIRST),
  );
  await expect(rows(page).first()).toContainText(`→ ${fmtEta(plus(R, 10))}`);
  const ids = await rowIds(page);
  expect(new Set(ids).size).toBe(ids.length);
});

test("S2-7 F3: 연 뒤 다른 곳에서 1개 읽음 + 새 1개(수는 2 그대로) → 30초 → 줄이 뜬다", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  const status = await page.evaluate(async (id) => {
    const res = await fetch("/api/retail/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    return res.status;
  }, SEED_FIRST);
  expect(status).toBe(200);
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(bellBadge(page)).toHaveText("2");
  await expect(newerButton(page)).toBeVisible();
});

test("S2-7 패널 열기 전에 떠난 count(지연 5초)가 옛 id 를 늦게 줘도 줄 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await chatMock(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const counts = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, counts + 1);
  /* 그 count는 latestNotificationId = 2022 를 들고 기다린다. 그 사이 새 알림 → 패널 첫 행은 새 id */
  await injectEta(page, plus(R, 10));
  await openPanel(page);
  await flushUntil(page, async () => (await rows(page).count()) === 20);
  await expect(rows(page).first()).not.toHaveAttribute(
    "data-id",
    String(SEED_FIRST),
  );
  for (let t = 0; t <= 5_500; t += 500) {
    await expect(newerButton(page)).toHaveCount(0);
    await page.clock.runFor(500);
  }
  await settled(page, COUNT_GET);
  await expect(newerButton(page)).toHaveCount(0);
});

test("S2-9 늦은 count(지연 5초) 중 안 읽은 행 누름 → read 응답 배지 1 → 늦은 count(2) 도착 구간에서 매 단계 1", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await chatMock(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const counts = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, counts + 1);

  await rowById(page, SEED_FIRST).click();
  await flushUntil(page, async () => (await count(page, NREAD_POST)) === 1);
  await settled(page, NREAD_POST);
  await flushUntil(
    page,
    async () => (await bellBadge(page).textContent()) === "1",
  );
  for (let t = 0; t <= 6_000; t += 500) {
    await expect(bellBadge(page)).toHaveText("1");
    await page.clock.runFor(500);
  }
  const late = (await requests(page, COUNT_GET))[counts];
  expect(late?.status, "늦은 count가 도착했다").not.toBeNull();
  await expect(bellBadge(page)).toHaveText("1");
});

test("S2-10 목 모드 첫 진입과 패널 — 가짜 API 에 notifications 요청 0건", async ({
  page,
}) => {
  const ours = (paths: string[]) =>
    paths.filter((p) => /notifications/.test(p));
  const before = ours(await stubRequests(page));
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await rowById(page, SEED_FIRST).click();
  await settled(page, NREAD_POST);
  expect(ours(await stubRequests(page))).toEqual(before);
});

test("S2-11 ① 더 보기 지연 중 첫 장 안 읽은 행 누름 → 배지는 read 응답 값, 다시 열면 누른 행 읽음, 둘째 장 안 읽은 행은 서버 값", async ({
  page,
}) => {
  await startNotify(page, "/");
  await openPanel(page);
  await firstPageShown(page);
  await notifyMock(page, "delay", { op: "list", ms: 3_000 });
  await pauseClock(page);
  await moreButton(page).click();
  await waitCount(page, LIST_GET, 2);
  await rowById(page, SEED_FIRST).click();
  await flushUntil(page, async () => (await count(page, NREAD_POST)) === 1);
  await settled(page, NREAD_POST);
  for (let t = 0; t <= 3_500; t += 500) {
    await page.clock.runFor(500);
    await expect(bellBadge(page)).toHaveText("1");
  }
  const late = (await requests(page, LIST_GET))[1];
  expect(late?.status, "늦은 둘째 장이 도착했다").not.toBeNull();

  await page.clock.resume();
  await openPanel(page);
  await firstPageShown(page);
  await expect(rowById(page, SEED_FIRST)).toHaveAttribute(
    "data-unread",
    "false",
  );
  await moreButton(page).click();
  await expect(rowById(page, SEED_SECOND_PAGE_UNREAD)).toHaveAttribute(
    "data-unread",
    "true",
  );
});

test("S2-11 ② read 지연 3초 중 패널 닫고 다시 엶 → 그 사이 목록이 먼저 와도 read 도착 뒤 누른 행 점 0", async ({
  page,
}) => {
  await startNotify(page, "/backorders?wholesaler=101");
  await openPanel(page);
  await firstPageShown(page);
  await notifyMock(page, "delay", { op: "read", ms: 3_000 });
  await pauseClock(page);
  /* 같은 주소 행이라 이동 없이 패널만 닫힌다 */
  await rowById(page, SEED_FIRST).click();
  await waitCount(page, NREAD_POST, 1);
  const lists = await count(page, LIST_GET);
  await openPanel(page);
  await waitCount(page, LIST_GET, lists + 1);
  await flushUntil(page, async () => (await rows(page).count()) === 20);
  for (let t = 0; t <= 3_500; t += 500) {
    await page.clock.runFor(500);
    if ((await requests(page, NREAD_POST))[0]?.status != null)
      await expect(rowById(page, SEED_FIRST)).toHaveAttribute(
        "data-unread",
        "false",
      );
  }
  await settled(page, NREAD_POST);
  await expect(rowById(page, SEED_FIRST)).toHaveAttribute(
    "data-unread",
    "false",
  );
  await expect(bellBadge(page)).toHaveText("1");
});
