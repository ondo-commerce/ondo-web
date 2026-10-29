import { expect, test, type Page } from "@playwright/test";
import {
  bell,
  chatLink,
  chatMock,
  composer,
  COUNT_GET,
  count,
  countLoginNavigations,
  expandedOrder,
  flushUntil,
  LIST_GET,
  markAllButton,
  moreButton,
  notify,
  openPanel,
  orderCard,
  panel,
  pauseClock,
  READ_POST,
  readBodies,
  rowById,
  rowIds,
  rows,
  runToNextCount,
  setVisibility,
  settled,
  start,
  unreadRows,
  waitCount,
} from "./helpers";

/**
 * QA loop-05b2-notify-read — 사장 시나리오 (a)~(f). 개발 e2e 와 다른 길로 같은 규칙을 다시 본다.
 * 목(MSW) 모드. 다음 회차가 그대로 돌린다. 텍스트 locator 는 exact 또는 앵커 정규식만 쓴다.
 */

const NEW_ID = 1026;
const NEW_ORDER = 7006;

/** 발표 대본 7절의 콘솔 한 줄 그대로(Content-Type 없음) */
async function consoleIncoming(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const r = await fetch("/__mock/notifications/incoming", {
      method: "POST",
      body: JSON.stringify({ type: "NEW_ORDER" }),
    });
    return r.status;
  });
}

async function incomingMany(page: Page, n: number): Promise<void> {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++)
      await fetch("/__mock/notifications/incoming", {
        method: "POST",
        body: JSON.stringify({ type: "NEW_ORDER" }),
      });
  }, n);
}

/** 목 저장소의 실제 안 읽음 수(화면 캐시가 아니라 서버 값) */
async function serverUnread(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const r = await fetch("/api/wholesale/notifications/unread-count");
    const j = (await r.json()) as { data: { notifications: number } };
    return j.data.notifications;
  });
}

test("(a) 장면 1 도매 절반 — /inventory 에서 콘솔 주입, 30초 안 배지 +1, 종 → 행 → 그 주문 펼침", async ({
  page,
}) => {
  await start(page, "/inventory");
  await pauseClock(page);
  expect(await consoleIncoming(page)).toBe(201);

  /* 1초씩 밀며 count 가 나간 시점을 잰다 */
  const before = await count(page, COUNT_GET);
  let waited = 0;
  while ((await count(page, COUNT_GET)) === before && waited <= 31_000) {
    await page.clock.runFor(1_000);
    waited += 1_000;
  }
  expect(waited, "주입 뒤 30초 안에 count").toBeLessThanOrEqual(30_000);
  await settled(page, COUNT_GET);
  await page.clock.runFor(50);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await page.clock.resume();

  await openPanel(page);
  expect((await rowIds(page))[0], "새 주문이 맨 위").toBe(NEW_ID);
  await expect(rows(page).first()).toContainText("봄봄상회 새 주문");
  await rows(page).first().click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
  await expect(orderCard(page)).toContainText("신규 주문");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});

test("(b) 주문 30개 몰림 → 더 보기를 끝까지, 사이에 5개 더 와도 중복 0 누락 0", async ({
  page,
}) => {
  await start(page);
  await incomingMany(page, 30);
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 33개");
  await openPanel(page);
  await expect(rows(page)).toHaveCount(20);
  const firstPage = await rowIds(page);
  expect(firstPage[0]).toBe(1055);

  /* 첫 장을 받은 뒤 5개 더 */
  await incomingMany(page, 5);
  while ((await moreButton(page).count()) > 0) {
    const before = (await rowIds(page)).length;
    await moreButton(page).click();
    await expect
      .poll(async () => (await rowIds(page)).length)
      .toBeGreaterThan(before);
  }
  const ids = await rowIds(page);
  expect(new Set(ids).size, "중복 0").toBe(ids.length);
  const expected = Array.from({ length: 55 }, (_, i) => 1001 + i);
  expect(
    [...ids].sort((a, b) => a - b),
    "누락 0 (1001~1055)",
  ).toEqual(expected);
  for (const late of [1056, 1057, 1058, 1059, 1060])
    expect(ids).not.toContain(late);

  /* 다음 polling 에 "새 알림 5개 보기" → 첫 장만 다시 */
  await page.clock.fastForward(30_000);
  const newer = panel(page).getByRole("button", {
    name: "새 알림 5개 보기",
    exact: true,
  });
  await expect(newer).toBeVisible();
  await newer.click();
  await expect(rows(page).first()).toHaveAttribute("data-id", "1060");
  await expect(rows(page)).toHaveCount(20);
});

test("(c-1) 패널 열어 두고 자리 비움 → 그 사이 새 알림 → 복귀 직후 count 가 먼저 와서 버튼 N 갱신", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");
  const lists = await count(page, LIST_GET);

  await setVisibility(page, "hidden");
  await page.clock.fastForward(10 * 60_000);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  await setVisibility(page, "visible");
  await waitCount(page, COUNT_GET, counts + 1);

  /* 목록은 그대로, 버튼과 새 알림 줄만 바뀐다(열린 동안 안 바뀜 규칙) */
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 4개 모두 읽음");
  await expect(
    panel(page).getByRole("button", { name: "새 알림 1개 보기", exact: true }),
  ).toBeVisible();
  expect(await count(page, LIST_GET)).toBe(lists);
  expect(await rowIds(page)).not.toContain(NEW_ID);
});

test("(c-2) 자리 비운 뒤 모두 읽음, 누르기 직전 새 알림 → 409 안내, 서버 안 읽음 그대로", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await setVisibility(page, "hidden");
  await page.clock.fastForward(10 * 60_000);
  await setVisibility(page, "visible");
  await page.clock.runFor(200);
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");

  /* polling 전에 새 알림 */
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await markAllButton(page).click();
  await expect(panel(page).getByRole("status")).toHaveText(
    "그 사이 알림이 바뀌었어요. 확인하고 다시 눌러 주세요",
  );
  expect(await readBodies(page)).toEqual([{ all: true, expectedUnread: 3 }]);
  expect(await serverUnread(page), "아무것도 안 지움").toBe(4);
  await expect(unreadRows(page)).toHaveCount(3);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 4개 모두 읽음");
});

test("(d-1) 응답 역순 — 늦은 count 가 모두 읽음 뒤 배지를 되살리지 않는다", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await notify(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const before = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, before + 1);

  await markAllButton(page).click();
  await waitCount(page, READ_POST, 1);
  await flushUntil(
    page,
    async () => (await bell(page).getAttribute("aria-label")) === "알림",
  );
  /* 늦은 count(3) 도착. 한 번에 5초를 밀고 바로 단언하면 늦은 응답이 그려지기 전에 통과한다
     (QA 변이 a 에서 실측: 그 단언은 통과, 0.6초 뒤 배지 3 부활). 100ms 씩 밀며 매번 본다 */
  for (let i = 0; i < 60; i++) {
    await page.clock.runFor(100);
    await page.waitForTimeout(20);
    expect(await bell(page).getAttribute("aria-label")).toBe("알림");
  }
  await expect(unreadRows(page)).toHaveCount(0);
  await runToNextCount(page, 30_000);
  await expect(bell(page)).toHaveAccessibleName("알림");
});

test("(d-2) 응답 역순 — 늦은 count 가 답 보내기 뒤 채팅 배지를 되살리지 않는다", async ({
  page,
}) => {
  await start(page, "/chats?room=1");
  const label = await chatLink(page).getAttribute("aria-label");
  const needs = Number(/답 필요 (\d+)건/.exec(label ?? "")?.[1]);
  expect(needs).toBeGreaterThan(0);
  const after = needs - 1 > 0 ? `채팅, 답 필요 ${needs - 1}건` : "채팅";

  await notify(page, "delay", { op: "count", ms: 5_000 });
  await pauseClock(page);
  const before = await count(page, COUNT_GET);
  await page.clock.runFor(30_000);
  await waitCount(page, COUNT_GET, before + 1);

  await composer(page).fill("네 있어요");
  await composer(page).press("Enter");
  /* 보내기 목은 300ms 늦게 답한다. 멈춘 시계라 100ms 씩 민다 */
  await expect
    .poll(
      async () => {
        await page.clock.runFor(100);
        return chatLink(page).getAttribute("aria-label");
      },
      { intervals: [100], timeout: 10_000 },
    )
    .toBe(after);
  await page.clock.runFor(5_100);
  await expect(chatLink(page)).toHaveAccessibleName(after);
});

test("(e) 헤더 401 셋(count 아닌 list, read) — 쓰던 답 보존, /login 이동 0", async ({
  page,
}) => {
  await start(page, "/chats?room=1");
  const loginNavs = countLoginNavigations(page);
  await composer(page).fill("가나다");

  /* 패널 목록 401 */
  await notify(page, "fail", { op: "list", status: 401 });
  await bell(page).click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "알림을 불러오지 못했어요",
  );
  await page.keyboard.press("Escape");

  /* 모두 읽음 401 */
  await notify(page, "fail", { op: "read", status: 401 });
  await openPanel(page);
  await markAllButton(page).click();
  await expect(panel(page).getByRole("alert")).toHaveText(
    "읽음으로 바꾸지 못했어요. 다시 눌러 주세요",
  );
  await page.keyboard.press("Escape");

  expect(loginNavs()).toBe(0);
  await expect(page).toHaveURL(/\/chats\?room=1$/);
  await expect(composer(page)).toHaveValue("가나다");
});

/* F2 재현(QA). 고친 뒤 test.fail 을 뗐다 */
test("(e-2) count 401 로 멈춘 배지는 로그아웃 → 다시 로그인하면 다시 돈다", async ({
  page,
}) => {
  await start(page);
  await notify(page, "fail", { op: "count", status: 401 });
  await page.clock.fastForward(30_000);
  await expect(bell(page)).toHaveAccessibleName("알림");

  /* 클라이언트 이동만으로 로그아웃 → 로그인(목 저장소 유지) */
  await page.getByRole("button", { name: /계정 메뉴$|^계정$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("이메일", { exact: true }).fill("e2e@ondo.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("ondo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const after = await count(page, COUNT_GET);
  await page.clock.fastForward(31_000);
  await page.clock.runFor(500);
  const evidence = await bell(page).evaluate((el) => ({
    tag: el.tagName,
    label: el.getAttribute("aria-label"),
    url: location.pathname,
  }));
  console.log(
    "QA evidence e-2",
    JSON.stringify(evidence),
    "count GET",
    after,
    "->",
    await count(page, COUNT_GET),
  );
  expect(
    await count(page, COUNT_GET),
    "다시 로그인한 뒤 count 요청이 나간다",
  ).toBeGreaterThan(after);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});

test("(f) 검색어 + 상태 필터 + 정산 필터 + 다른 주문 펼침 상태에서 알림 진입", async ({
  page,
}) => {
  await start(page, "/orders");
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const search = page.getByLabel("거래처·품명 검색", { exact: true });
  await search.fill("라온");
  await page
    .getByRole("radiogroup", { name: "주문 상태 필터", exact: true })
    .getByRole("radio", { name: /^주문 확정/ })
    .click();
  await page
    .getByRole("radiogroup", { name: "정산 상태 필터", exact: true })
    .getByRole("radio", { name: /^미결제/ })
    .click();

  await openPanel(page);
  await rowById(page, NEW_ID).click();
  await expect(search).toHaveValue("");
  for (const group of ["주문 상태 필터", "정산 상태 필터"])
    await expect(
      page
        .getByRole("radiogroup", { name: group, exact: true })
        .getByRole("radio", { name: /^전체/ }),
    ).toHaveAttribute("aria-checked", "true");
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
  await expect(orderCard(page)).not.toContainText("현재 목록 조건에 없는 주문");
  await expect(page).toHaveURL(/\/orders$/);

  /* 같은 주문 알림을 한 번 더 — 이미 펼친 그 주문이 접히지 않는다 */
  await openPanel(page);
  await rowById(page, NEW_ID).click();
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
});

/* 03-review R1 브라우저 재현(QA). 고친 뒤 test.fail 을 뗐다 */
test("(R1) 목록 요청이 늦는 동안 모두 읽음 성공 → 늦은 목록이 점을 되살리지 않는다", async ({
  page,
}) => {
  await start(page);
  await notify(page, "delay", { op: "list", ms: 3_000 });
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");
  await markAllButton(page).click();
  await expect(bell(page)).toHaveAccessibleName("알림");
  await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });
  const evidence = await unreadRows(page).evaluateAll((nodes) =>
    nodes.map((n) => ({
      tag: n.tagName,
      id: (n as HTMLElement).dataset.id,
      unread: (n as HTMLElement).dataset.unread,
    })),
  );
  console.log(
    "QA evidence R1",
    JSON.stringify(evidence),
    await bell(page).getAttribute("aria-label"),
  );
  await expect(unreadRows(page)).toHaveCount(0);
});

/* F3 재현(QA): 기준이 연 때 count 면 그 사이 다른 기기가 하나 읽을 때 새 알림 1개가 줄 없이 묻힌다. 고친 뒤 test.fail 을 뗐다 */
test("(g) 패널 연 뒤 다른 기기가 1개 읽고 새 알림 1개 → '새 알림 1개 보기'가 떠야 한다", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  /* 다른 기기(같은 사업체)가 1025 를 읽음 — 읽음은 사업체 단위(§5-3 2) */
  await page.evaluate(() =>
    fetch("/api/wholesale/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1025] }),
    }),
  );
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, counts + 1);
  await expect(markAllButton(page)).toHaveText("안 읽은 알림 3개 모두 읽음");
  const evidence = {
    url: page.url(),
    rowsHaveNew: (await rowIds(page)).includes(NEW_ID),
    newbar: await panel(page)
      .getByRole("button", { name: /^새 알림 \d+개 보기$/ })
      .count(),
  };
  console.log("QA evidence g", JSON.stringify(evidence));
  await expect(
    panel(page).getByRole("button", { name: "새 알림 1개 보기", exact: true }),
  ).toBeVisible({ timeout: 2_000 });
});

test("(h) '새 알림 N개 보기' 같은 틱 2연타 → 목록 GET 몇 번", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await page.clock.fastForward(30_000);
  const newer = panel(page).getByRole("button", {
    name: "새 알림 1개 보기",
    exact: true,
  });
  await expect(newer).toBeVisible();
  const lists = await count(page, LIST_GET);
  await newer.evaluate((el) => {
    (el as HTMLElement).click();
    (el as HTMLElement).click();
  });
  await expect(newer).toHaveCount(0);
  await page.clock.runFor(500);
  const n = (await count(page, LIST_GET)) - lists;
  console.log("QA newbar double click list GET", n);
  expect(new Set(await rowIds(page)).size).toBe(20);
  await expect(rows(page).first()).toHaveAttribute("data-id", String(NEW_ID));
});
