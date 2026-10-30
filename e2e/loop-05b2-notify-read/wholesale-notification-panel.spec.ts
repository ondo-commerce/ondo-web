import { expect, test } from "@playwright/test";
import {
  bell,
  COUNT_GET,
  count,
  expandedOrder,
  historyLength,
  LIST_GET,
  markAllButton,
  moreButton,
  notify,
  openPanel,
  orderCard,
  panel,
  READ_POST,
  readBodies,
  rowById,
  rowIds,
  rows,
  start,
  unreadRows,
  waitCount,
} from "./helpers";

/**
 * #295 S11 알림 패널 — 목록과 상태(S11-4), 행 누름(S11-5, S11-16), 모두 읽음(S11-8, S11-9),
 * 열린 동안 안 바뀜(S11-10), 가려진 `더 보기`(S11-11). 와이어프레임 `#state-panel` `#state-loading`
 * `#state-empty` `#state-error` `#state-more` `#state-new` `#state-mark-all` `#state-409` `#state-types`.
 *
 * 시계는 흐른다. polling 이 필요하면 `fastForward(30_000)`.
 */

/** 시드 첫 장의 안 읽은 행 2개(1, 2번째)와 둘째 장의 안 읽은 행(22번째) */
const SEED_FIRST_UNREAD = 1025;
const SEED_SECOND_PAGE_UNREAD = 1004;
/** 시드 12번째 — 모르는 type `PAYMENT_RECEIVED`(읽음) */
const SEED_UNKNOWN = 1014;
/** 시드 8번째 — ORDER_CANCELLED, 주문 7003 */
const SEED_CANCELLED = 1018;
/** 첫 incoming 알림 id 와 주문 */
const NEW_ID = 1026;
const NEW_ORDER = 7006;

test.beforeEach(async ({ page }) => {
  await start(page);
});

test("S11-4 열 때만 목록 GET 1회, 첫 행, 빈 상태, 실패와 다시 시도, Esc 포커스 복귀", async ({
  page,
}) => {
  expect(await count(page, LIST_GET), "닫혀 있을 땐 0회").toBe(0);
  await notify(page, "incoming", { type: "NEW_ORDER" });

  await openPanel(page);
  expect(await count(page, LIST_GET)).toBe(1);
  const first = rows(page).first();
  await expect(first).toContainText("봄봄상회 새 주문");
  await expect(first).toContainText("빈티지 플라워 셔츠 레드 / M");
  await expect(first).toContainText("방금");
  await expect(first).toHaveAttribute("data-unread", "true");
  await expect(
    panel(page).getByRole("heading", { name: "알림" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();

  /* 빈 상태 — count 0 이라 모두 읽음 버튼도 없다 */
  await notify(page, "reset", { empty: true });
  await bell(page).click();
  await expect(panel(page)).toContainText("새 알림이 없어요");
  await expect(panel(page)).toContainText("주문이 들어오면 여기에 쌓여요");
  await page.keyboard.press("Escape");

  /* 실패 → 다시 시도 1회 */
  await notify(page, "reset");
  await notify(page, "fail", { op: "list", status: 500 });
  const lists = await count(page, LIST_GET);
  await bell(page).click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "알림을 불러오지 못했어요",
  );
  await panel(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(rows(page).first()).toBeVisible();
  expect(await count(page, LIST_GET)).toBe(lists + 2);
});

test("S11-5 안 읽은 행 같은 틱 3연타 → read 1회, 이동 1회, 그 주문 펼침, 배지 −1", async ({
  page,
}) => {
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await openPanel(page);

  const history = await historyLength(page);
  await rowById(page, NEW_ID).evaluate((el) => {
    (el as HTMLElement).click();
    (el as HTMLElement).click();
    (el as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/orders$/);
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
  await expect(orderCard(page)).toContainText("신규 주문");
  await expect(orderCard(page)).toContainText("봄봄상회");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");

  expect(await readBodies(page)).toEqual([{ ids: [NEW_ID] }]);
  expect(await historyLength(page), "push 1번(+ replace)").toBe(history + 1);
});

test("S11-5 read 500 → 이동은 하고 배지 그대로, 문구 0. 읽은 행 → POST 0", async ({
  page,
}) => {
  await notify(page, "fail", { op: "read", status: 500 });
  await openPanel(page);
  await rowById(page, SEED_FIRST_UNREAD).click();
  await expect(page).toHaveURL(/\/orders$/);
  await waitCount(page, READ_POST, 1);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
  /* Next 의 route announcer(role=alert)는 빼고 셸 안만 본다 */
  await expect(page.locator("header, main").getByRole("alert")).toHaveCount(0);

  /* 읽은 행(3번째) → POST 없이 이동 */
  await openPanel(page);
  const third = rows(page).nth(2);
  await expect(third).toHaveAttribute("data-unread", "false");
  await third.click();
  await expect(panel(page)).toBeHidden();
  expect(await count(page, READ_POST)).toBe(1);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});

test("S11-16 모르는 type 은 title 만, 누르면 이동 0. ORDER_CANCELLED → 그 주문", async ({
  page,
}) => {
  await openPanel(page);
  const unknown = rowById(page, SEED_UNKNOWN);
  await expect(unknown).toHaveJSProperty("tagName", "BUTTON");
  await expect(unknown).toContainText("입금이 확인됐어요");
  await unknown.click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(panel(page)).toBeVisible();
  /* 시드의 모르는 행은 읽은 행이라 POST 도 없다 */
  expect(await count(page, READ_POST)).toBe(0);

  const cancelled = rowById(page, SEED_CANCELLED);
  await expect(cancelled).toContainText("주문 취소");
  await cancelled.click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(expandedOrder(page, 7003)).toBeVisible();
});

test("S11-8 모두 읽음 — N 은 count 기준, 3연타 POST 1회, 둘째 장도 읽음", async ({
  page,
}) => {
  await openPanel(page);
  await expect(unreadRows(page), "첫 장 안 읽음은 2개").toHaveCount(2);
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");

  await notify(page, "delay", { op: "read", ms: 1_500 });
  await markAllButton(page).evaluate((el) => {
    (el as HTMLElement).click();
    (el as HTMLElement).click();
    (el as HTMLElement).click();
  });
  await expect(markAllButton(page)).toHaveText("처리 중");
  await expect(markAllButton(page)).toBeDisabled();

  await expect(markAllButton(page)).toHaveCount(0);
  expect(await readBodies(page)).toEqual([{ all: true, expectedUnread: 3 }]);
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");

  await moreButton(page).click();
  await expect(rows(page)).toHaveCount(25);
  await expect(rowById(page, SEED_SECOND_PAGE_UNREAD)).toHaveAttribute(
    "data-unread",
    "false",
  );
});

test("S11-8 모두 읽음 500 → 오류 한 줄, 점 그대로", async ({ page }) => {
  await openPanel(page);
  await notify(page, "fail", { op: "read", status: 500 });
  await markAllButton(page).click();
  await expect(panel(page).getByRole("alert")).toHaveText(
    "읽음으로 바꾸지 못했어요. 다시 눌러 주세요",
  );
  await expect(unreadRows(page)).toHaveCount(2);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});

test("S11-9 그 사이 새 알림 → 409 안내, 점 그대로, 첫 행 새 주문, N 4, 다시 누르면 0", async ({
  page,
}) => {
  await openPanel(page);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await markAllButton(page).click();

  await expect(panel(page).getByRole("status")).toHaveText(
    "그 사이 알림이 바뀌었어요. 확인하고 다시 눌러 주세요",
  );
  await expect(rows(page).first()).toHaveAttribute("data-id", String(NEW_ID));
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 4개 모두 읽음");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await expect(unreadRows(page)).toHaveCount(3);

  await markAllButton(page).click();
  await expect(markAllButton(page)).toHaveCount(0);
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(panel(page).getByRole("status")).toHaveCount(0);
});

/**
 * 05b-2 F3. 03-review M1 M2로 엿보기를 뺐고, loop-06b #306이 count `latestNotificationId` 비교로 줄을 띄운다
 * (목록 GET 0 그대로). 모두 읽음은 수가 같아 409가 안 나므로, 줄이 떠 있으면 POST 없이 첫 장을 다시 받는다
 * (loop-06b F2, 소매 S2-6과 같은 규칙). 그전 기대값(줄이 뜬 채 POST 200, 새 행은 화면에 없이 읽힘)을 F2가 바꿨다.
 * 확인한 뒤 다시 누르면 계약대로 POST 1회 200
 */
test("F3: 연 뒤 다른 기기가 1개 읽고 새 1개(count 같음) → '새 알림 1개 보기', 목록 GET 0, 모두 읽음 → POST 0 + 첫 장 다시, 다시 누르면 POST 1회 200", async ({
  page,
}) => {
  await openPanel(page);
  /* 다른 기기 흉내: 같은 사업체가 1025 를 읽는다(읽음 범위는 사업체) */
  await page.evaluate(() =>
    fetch("/api/wholesale/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1025] }),
    }),
  );
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  const lists = await count(page, LIST_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, counts + 1);

  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");
  await expect(
    panel(page).getByRole("button", { name: "새 알림 1개 보기", exact: true }),
  ).toBeVisible();
  expect(await count(page, LIST_GET), "count 뒤 목록 GET 0(§4-1⑤)").toBe(lists);

  /* 줄이 떠 있다 → POST 0, 안내 한 줄, 첫 장 다시(새 행이 맨 위), 줄 0 */
  await markAllButton(page).click();
  await expect(panel(page).getByRole("status")).toHaveText(
    "새 알림이 왔어요. 확인하고 다시 눌러 주세요",
  );
  await waitCount(page, LIST_GET, lists + 1);
  await expect(rows(page).first()).toHaveAttribute("data-id", String(NEW_ID));
  await expect(
    panel(page).getByRole("button", { name: "새 알림 1개 보기", exact: true }),
  ).toHaveCount(0);
  expect(await readBodies(page)).toEqual([{ ids: [1025] }]);

  /* 확인한 뒤 다시 누름 → 계약대로 POST 1회 200 */
  await markAllButton(page).click();
  await expect(markAllButton(page)).toHaveCount(0);
  expect(await readBodies(page)).toEqual([
    { ids: [1025] },
    { all: true, expectedUnread: 3 },
  ]);
  await expect(panel(page).getByRole("status")).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(rowById(page, NEW_ID)).toHaveAttribute("data-unread", "false");
});

test("S11-16 안 읽은 모르는 type → read {ids} 1회, 이동 0, 점 사라짐, 배지 −1(03-review M3)", async ({
  page,
}) => {
  const created = (await notify(page, "incoming", {
    type: "PAYMENT_RECEIVED",
  })) as { data: { notification: { id: number } } };
  const id = created.data.notification.id;
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await openPanel(page);

  const unknown = rowById(page, id);
  await expect(unknown).toHaveJSProperty("tagName", "BUTTON");
  await expect(unknown).toHaveAttribute("data-unread", "true");
  await expect(unknown).toContainText("입금이 확인됐어요");
  const history = await historyLength(page);
  await unknown.click();

  await expect(unknown).toHaveAttribute("data-unread", "false");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
  expect(await readBodies(page)).toEqual([{ ids: [id] }]);
  await expect(page).toHaveURL(/\/products$/);
  await expect(panel(page)).toBeVisible();
  expect(await historyLength(page), "이동 0").toBe(history);
});

test("S11-10 열린 패널은 저절로 안 바뀌고 '새 알림 1개 보기'로만 첫 장 다시", async ({
  page,
}) => {
  await openPanel(page);
  await moreButton(page).click();
  await expect(rows(page)).toHaveCount(25);
  const list = panel(page).locator(".overflow-y-auto");
  await list.evaluate((el) => (el.scrollTop = 200));
  const before = await rowIds(page);
  const lists = await count(page, LIST_GET);

  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, counts + 1);
  const newer = panel(page).getByRole("button", { name: "새 알림 1개 보기" });
  await expect(newer).toBeVisible();
  expect(await rowIds(page)).toEqual(before);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(200);
  expect(await count(page, LIST_GET), "목록을 저절로 다시 받지 않는다").toBe(
    lists,
  );

  await newer.click();
  await expect(rows(page).first()).toHaveAttribute("data-id", String(NEW_ID));
  await expect(newer).toHaveCount(0);
  const after = await rowIds(page);
  expect(after, "이어 받은 장은 버린다").toHaveLength(20);
  expect(new Set(after).size).toBe(after.length);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
});

for (const viewport of [
  { width: 1470, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`S11-11 ${viewport.width}x${viewport.height} 패널 안 맨 아래 더 보기가 눌리고 페이지 스크롤 0`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openPanel(page);
    const list = panel(page).locator(".overflow-y-auto");
    await list.evaluate((el) => (el.scrollTop = el.scrollHeight));

    const more = moreButton(page);
    const hit = await more.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return el === top || el.contains(top);
    });
    expect(hit, "더 보기 중심점이 그 버튼").toBe(true);
    const page_ = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight - window.innerHeight,
      wide: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(page_).toEqual({ scroll: 0, wide: 0 });

    await more.click();
    await expect(rows(page)).toHaveCount(25);
    const ids = await rowIds(page);
    expect(new Set(ids).size).toBe(25);
    await expect(more).toHaveCount(0);
  });
}
