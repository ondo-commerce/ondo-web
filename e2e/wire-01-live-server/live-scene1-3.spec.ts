import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * wire-01-live-server (#420) — 로컬 실서버(도매 :8081, 소매 :8080)에 붙은 웹 두 앱으로 시연 장면 1~3을 돈다.
 *
 * **실서버 설정으로만 돈다**: `LIVE_PW=<시드 비밀번호> pnpm e2e:live`(`playwright.live.config.ts`). 그 설정이 웹 두 앱을
 * `NEXT_PUBLIC_API_MOCK=0`, `API_ORIGIN` 도매 :8081 / 소매 :8080 으로 3200/3201 에 띄우고 `LIVE_W`·`LIVE_R`을 채운다.
 * 기본·stub 설정은 이 폴더를 testIgnore 한다. 서버 두 대는 먼저 떠 있어야 하고 CI에선 안 돈다.
 *
 * 시드 계정 moodon(도매처 101) / bombom(소매 1). 비밀번호는 시드 SQL 주석(여기 적지 않는다 — `LIVE_PW`로 넘긴다).
 * 서버 상태를 바꾼다(방 1 메시지와 사장 답, 장바구니, 주문). 되돌리지 않는다.
 */
const W = process.env.LIVE_W ?? "http://localhost:3000";
const R = process.env.LIVE_R ?? "http://localhost:3001";
const PW = process.env.LIVE_PW ?? "";

async function loginWholesale(page: Page): Promise<void> {
  await page.goto(`${W}/login`);
  await page.getByLabel("이메일").fill("moodon@ondo.test");
  await page.getByLabel("비밀번호").fill(PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/dashboard/);
}

async function loginRetail(page: Page): Promise<void> {
  await page.goto(`${R}/login`);
  await page.getByLabel("이메일").fill("bombom@ondo.test");
  await page.getByLabel("비밀번호").fill(PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((url) => !/\/login/.test(url.toString()));
}

/** 목이 없고(`window.msw`·service worker 0) 요청이 같은 origin `/api/…` 프록시로만 나가는지 */
async function expectNoMock(page: Page): Promise<void> {
  const probe = await page.evaluate(async () => ({
    msw: "msw" in window,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(probe).toEqual({ msw: false, workers: 0 });
}

/** 보내기 응답(`ChatSendResult`) 중 이 시험이 읽는 칸만 */
type SentMessage = {
  sequence: number;
  kind: string;
  autoReply: { replyToSequence: number } | null;
};
type SendResult = { message: SentMessage; generatedMessages: SentMessage[] };

const SEND_PATH = /\/api\/retail\/chat\/rooms\/\d+\/messages$/;

/**
 * `act`(Enter, 칩 누름)가 내보낸 보내기의 응답을 받는다. 방 1에는 앞 실행의 답이 남아 있어 화면 글자만 보면
 * 이번 보내기가 실패해도 옛 답으로 통과한다(#422) — 이번 답을 응답에서 특정하려고 받는다. 대기는 act 전에 건다.
 */
async function sendAndWait(
  page: Page,
  act: () => Promise<void>,
): Promise<SendResult> {
  const response = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      SEND_PATH.test(new URL(res.url()).pathname),
  );
  await act();
  const res = await response;
  expect(res.ok(), `보내기 응답 ${res.status()}`).toBe(true);
  const body = (await res.json()) as { data: SendResult };
  return body.data;
}

/**
 * 이번 보내기에 붙은 자동 답(`replyToSequence` = 내 글 sequence)의 말풍선. 응답에 없으면 그 자리에서 실패한다.
 * 말풍선 요소는 `data-sequence`를 단다(`ChatMessageItem`). 재고 카드, 칩 줄, 링크가 전부 그 안에 그려진다.
 */
function replyBubble(page: Page, sent: SendResult): Locator {
  const reply = sent.generatedMessages.find(
    (m) => m.autoReply?.replyToSequence === sent.message.sequence,
  );
  if (reply === undefined)
    throw new Error(
      `${sent.message.sequence}번 글에 대한 자동 답이 보내기 응답에 없다`,
    );
  return page.locator(
    `[data-sequence="${reply.sequence}"][data-kind="${reply.kind}"]`,
  );
}

/** 알림 목록·안 읽은 수 응답(도매, 소매 공통) 중 이 시험이 읽는 칸만 */
type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  target: { kind: string; id?: number; wholesalerId?: number };
};
type UnreadCount = {
  notifications: number;
  latestNotificationId?: number | null;
};

/**
 * 서버 응답을 웹 프록시(`${base}/api/...`)로 받는다. 그 컨텍스트의 세션 쿠키가 실린다. 화면 라벨이 아니라
 * 서버 값을 기준으로 삼아야 로그인 직후 아직 안 실린 라벨(#439 전 장면 1)을 기준값으로 잡지 않는다.
 */
async function getData<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url);
  expect(res.ok(), `${url} 응답 ${res.status()}`).toBe(true);
  return ((await res.json()) as { data: T }).data;
}

/** 첫 장 100개(서버 상한)의 id. 새 알림은 첫 장 앞에 붙으므로 이 집합에 없는 id가 이번 실행 뒤에 생긴 것이다 */
async function notificationIds(page: Page, url: string): Promise<Set<number>> {
  const rows = await getData<NotificationRow[]>(page, `${url}?size=100`);
  return new Set(rows.map((n) => n.id));
}

/**
 * 기준 시점 뒤에 생긴(`idsBefore`에 없는) 알림 중 `pick`에 맞는 행이 나타날 때까지 첫 장 100개를 다시 읽는다.
 * 한 번만 읽으면 다른 알림이 먼저 와 대기가 끝나고 이번 행이 조금 늦을 때 정상인데 실패한다(S4-6).
 * 개수가 정확히 1인지는 호출부가 본다
 */
async function pollFresh(
  page: Page,
  url: string,
  idsBefore: Set<number>,
  pick: (n: NotificationRow) => boolean,
): Promise<NotificationRow[]> {
  let fresh: NotificationRow[] = [];
  await expect
    .poll(
      async () => {
        const all = await getData<NotificationRow[]>(page, `${url}?size=100`);
        fresh = all.filter((n) => !idsBefore.has(n.id) && pick(n));
        return fresh.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return fresh;
}

/** 헤더 종 라벨(`알림, 안 읽음 N개` / `알림`)의 안 읽은 수 */
async function bellCount(page: Page): Promise<number> {
  const label = await page
    .getByRole("banner")
    .getByRole("button", { name: /^알림/ })
    .getAttribute("aria-label");
  const m = (label ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * 화면 종이 서버 값을 실은 뒤의 수. 로그인 직후엔 아직 첫 응답 전이라 라벨에 수가 없을 수 있다 — 서버 값과
 * 같아질 때까지 기다린 값을 화면 기준으로 쓴다
 */
async function settledBellCount(page: Page, server: number): Promise<number> {
  await expect.poll(() => bellCount(page), { timeout: 45_000 }).toBe(server);
  return server;
}

test.describe.configure({ mode: "serial" });

test("장면 1 — 소매 재고 문의 → 자동 답 → 장바구니 → 주문 → 도매 종 배지", async ({
  browser,
}) => {
  test.skip(PW === "", "LIVE_PW(시드 비밀번호)가 없다");
  const retail = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
  });
  const wholesale = await browser.newContext({
    viewport: { width: 1470, height: 900 },
    locale: "ko-KR",
  });
  const r = await retail.newPage();
  const w = await wholesale.newPage();
  const apiRequests: string[] = [];
  r.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });

  await loginWholesale(w);

  await loginRetail(r);
  await r.goto(`${R}/products/2001`);
  await r.getByRole("button", { name: "문의하기" }).click();
  await r.waitForURL(/\/chats\/\d+/);
  await expectNoMock(r);

  await r
    .getByRole("textbox", { name: "메시지" })
    .fill("이거 레드 M 재고 있어요?");
  const stock = replyBubble(
    r,
    await sendAndWait(r, () => r.keyboard.press("Enter")),
  );
  await expect(
    stock.getByText("레드 M은 10~49장 있어요", { exact: false }),
  ).toBeVisible({ timeout: 10_000 });

  await stock.getByRole("textbox", { name: "레드 / M 수량" }).fill("3");
  await stock.getByRole("button", { name: "장바구니에 담기" }).click();
  await expect(
    r.getByRole("status").filter({ hasText: "장바구니에 담았어요" }),
  ).toBeVisible();

  await r.goto(`${R}/cart`);
  await r.getByRole("link", { name: "주문하기" }).click();
  await r.waitForURL(/\/checkout/);

  /* 기준값은 주문 직전 서버 응답에서 읽는다. 앞 실행의 알림이 남은 DB라 "라벨이 바뀌었다", "봄봄상회 새 주문이
     하나라도 있다"로는 이번 주문 알림이 안 와도 통과한다(#439) */
  const W_UNREAD = `${W}/api/wholesale/notifications/unread-count`;
  const W_LIST = `${W}/api/wholesale/notifications`;
  const countBefore = await getData<UnreadCount>(w, W_UNREAD);
  const idsBefore = await notificationIds(w, W_LIST);
  const bellBefore = await settledBellCount(w, countBefore.notifications);

  const placed = r.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      new URL(res.url()).pathname === "/api/retail/orders",
  );
  await r.getByRole("button", { name: "주문 접수하기" }).click();
  const placedRes = await placed;
  expect(placedRes.status(), "주문 접수 응답").toBe(201);
  const order = (
    (await placedRes.json()) as {
      data: {
        results: {
          wholesalerId: number;
          isAccepted: boolean;
          wholesaleOrderId: number | null;
        }[];
      };
    }
  ).data;
  /* 이번 주문 = 이 응답의 무드온(101) 도매 주문 id. 도매 알림 target.id가 이 값이다 */
  const wholesaleOrderId = order.results.find(
    (x) => x.wholesalerId === 101 && x.isAccepted,
  )?.wholesaleOrderId;
  expect(wholesaleOrderId, "무드온 도매 주문 id").toEqual(expect.any(Number));
  await r.waitForURL(/\/checkout\/complete/);

  /* 이번 주문의 알림 행: 주문 전에 없던 id + NEW_ORDER + 대상 도매 주문이 이번 주문 */
  const fresh = await pollFresh(
    w,
    W_LIST,
    idsBefore,
    (n) => n.type === "NEW_ORDER" && n.target.id === wholesaleOrderId,
  );
  expect(fresh, "이번 주문의 도매 알림").toHaveLength(1);
  const thisAlert = fresh[0]!;

  /* 서버: 최근 알림 id가 이번 주문 알림 행의 id다(S4-1, S4-9). 격리된 로컬 DB라 주문 뒤 이 도매처에 다른 알림이
     끼지 않는다는 전제다. 이번 행을 찾은 직후에 읽어 아래 배지 대기 동안 값이 바뀌는 것과 섞이지 않게 한다.
     id는 계약상 순서 뜻이 없어 크기로 비교하지 않는다 */
  const latestAfter = (await getData<UnreadCount>(w, W_UNREAD))
    .latestNotificationId;
  expect(latestAfter, "주문 뒤 최근 알림 id = 이번 주문 알림").toBe(
    thisAlert.id,
  );

  /* 화면: 도매 헤더 배지 polling 30초 — 실측 28초 */
  await expect
    .poll(() => bellCount(w), { timeout: 45_000 })
    .toBeGreaterThan(bellBefore);
  await w.getByRole("banner").getByRole("button", { name: /^알림/ }).click();
  const row = w
    .getByRole("dialog", { name: "알림" })
    .locator(`[data-id="${thisAlert.id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("봄봄상회 새 주문");
  await expect(row).toHaveAttribute(
    "href",
    `/orders?order=${wholesaleOrderId}`,
  );

  expect(apiRequests.every((url) => url.startsWith(`${R}/api/`))).toBe(true);
  await retail.close();
  await wholesale.close();
});

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 서울 오늘(UTC 자정 Date로 둔다 — 아래 날짜 계산을 전부 UTC getter로 해 달, 해 넘김을 Date가 맡는다) */
function seoulToday(): Date {
  const now = new Date(Date.now() + 9 * 3600_000);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function toInput(d: Date): string {
  return `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`;
}

/**
 * 새 입고일 = 서울 오늘 +30일과 +31일 중 지금 저장값과 다른 쪽. 같은 날짜를 다시 저장하면 알림이 안 생기고,
 * "저장값 하루 뒤"로 잡으면 실행마다 끝없이 밀린다(#439 S4-8). 이 둘이면 늘 미래이고 범위 안에 머문다.
 */
function nextEta(saved: string): Date {
  const today = seoulToday();
  const plus = (n: number) =>
    new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + n,
      ),
    );
  const d30 = plus(30);
  return toInput(d30) === saved.trim() ? plus(31) : d30;
}

/**
 * 알림 본문의 날짜 글자에서 요일 앞까지(`M/D(`, 해가 다르면 `YYYY/M/D(`). 서버 `BackorderDateChangeText.etaLabel`
 * 규칙이다. 요일 글자는 정규식이 `[^)]+`로 받는다. `baseYear`는 서버가 본문을 쓴 때의 서울 연도다(S4-10)
 */
function etaLabelHead(d: Date, baseYear: number): string {
  const head = d.getUTCFullYear() === baseYear ? "" : `${d.getUTCFullYear()}/`;
  return `${head}${d.getUTCMonth() + 1}/${d.getUTCDate()}(`;
}

/** 입력칸 값(`YYYY.MM.DD` 또는 빈칸)을 본문 옛 날짜 정규식 조각으로. 빈칸이면 서버가 `입고일 미정`을 쓴다 */
function oldEtaPattern(saved: string, baseYear: number): string {
  const m = saved.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return "입고일 미정";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${escapeRe(etaLabelHead(d, baseYear))}[^)]+\\)`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * #439 — 도매가 미송 입고일을 바꾸면 그 SKU에 열린 미송이 있는 소매처(봄봄상회)에 알림이 가고 소매 미송 화면 날짜가 바뀐다.
 * 시드: 옵션 3003 = 상품 1 SKU 1-3 = 빈티지 플라워 셔츠 레드 L, 열린 미송 소매처 2곳. 서버 입고일을 되돌리지 않는다.
 * 시드가 바뀌면(3003 SKU 표기, 봄봄상회 미송 해소) 기능이 정상이어도 실패한다. 전제 확인은 따로 두지 않는다(S4-7 accept).
 *
 * 장면 2·3보다 앞에 둔다: 장면 2·3은 주문 #6001(옵션 3003)의 입고일이 미래여야 `도매 입고 예정이에요`를 받는다.
 * 시드 입고일은 2026-11-20이라 그 뒤 새 DB에서는 이 시험이 먼저 날짜를 미래(오늘 +30/+31일)로 옮겨 줘야 한다.
 */
test("입고일 — 도매 미송 입고일 변경 → 소매 알림과 미송 화면 날짜", async ({
  browser,
}) => {
  test.skip(PW === "", "LIVE_PW(시드 비밀번호)가 없다");
  const wholesale = await browser.newContext({
    viewport: { width: 1470, height: 900 },
    locale: "ko-KR",
  });
  const retail = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
  });
  const w = await wholesale.newPage();
  const r = await retail.newPage();

  await loginWholesale(w);
  await w.getByRole("link", { name: "미송", exact: true }).click();
  await w.waitForURL(/\/backorders/);
  await w.getByRole("button", { name: "SKU 1-3 펼치기" }).click();
  const eta = w.getByRole("textbox", { name: "예상 입고일" });
  await expect(eta).toBeVisible();

  await loginRetail(r);
  await r.goto(`${R}/`);
  await expectNoMock(r);

  const R_UNREAD = `${R}/api/retail/notifications/unread-count`;
  const R_LIST = `${R}/api/retail/notifications`;
  const countBefore = await getData<UnreadCount>(r, R_UNREAD);
  const idsBefore = await notificationIds(r, R_LIST);
  const bellBefore = await settledBellCount(r, countBefore.notifications);

  const saved = await eta.inputValue();
  const next = nextEta(saved);
  const nextInput = toInput(next);
  await eta.fill(nextInput);
  const put = w.waitForResponse(
    (res) =>
      res.request().method() === "PUT" &&
      new URL(res.url()).pathname ===
        "/api/wholesale/variants/3003/expected-inbound",
  );
  await w.getByRole("button", { name: "저장", exact: true }).click();
  expect((await put).status(), "입고일 저장 응답").toBe(200);
  /* 본문 날짜 글자의 기준 연도. 서버는 알림을 저장과 같은 트랜잭션에서 쓰니 단정 시점이 아니라 응답 직후에 잡는다.
     서울 연말 자정을 넘겨 단정해도 정상 본문을 거부하지 않는다(S4-10) */
  const baseYear = seoulToday().getUTCFullYear();
  await expect(
    w.getByRole("status").filter({ hasText: "저장했어요" }),
  ).toBeVisible();

  /* 서버: 안 읽은 수 정확히 +1, 최근 알림 id가 저장 전에 없던 id. 격리된 로컬 DB를 전제로 한 정확히 +1이다 —
     한 번 저장에 알림이 두 번 가는 결함을 잡으려고 "1 이상"으로 풀지 않는다(S4-5 accept) */
  await expect
    .poll(
      async () => {
        const now = await getData<UnreadCount>(r, R_UNREAD);
        return (
          now.notifications === countBefore.notifications + 1 &&
          typeof now.latestNotificationId === "number" &&
          !idsBefore.has(now.latestNotificationId)
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  /* 이번 알림 행: 저장 전에 없던 id + BACKORDER_DATE_CHANGED + 무드온(101) 미송 + 본문이 이 SKU(상품, 옵션)의
     옛 날짜 → 새 날짜. 같은 도매처 다른 SKU 알림으로 통과하지 않게 본문을 통째로 본다(S4-2) */
  const newHead = etaLabelHead(next, baseYear);
  const bodyRe = new RegExp(
    `^빈티지 플라워 셔츠 레드/L 남은 \\d+장, ${oldEtaPattern(saved, baseYear)} → ${escapeRe(newHead)}`,
  );
  const fresh = await pollFresh(
    r,
    R_LIST,
    idsBefore,
    (n) =>
      n.type === "BACKORDER_DATE_CHANGED" &&
      n.target.kind === "BACKORDERS" &&
      n.target.wholesalerId === 101 &&
      bodyRe.test(n.body ?? ""),
  );
  expect(fresh, "이번 입고일 변경 알림").toHaveLength(1);
  const thisAlert = fresh[0]!;

  /* 화면: 소매 헤더 배지 polling 30초 */
  await expect
    .poll(() => bellCount(r), { timeout: 45_000 })
    .toBe(bellBefore + 1);
  await r.getByRole("banner").getByRole("button", { name: /^알림/ }).click();
  const row = r
    .getByRole("dialog", { name: "알림" })
    .locator(`[data-id="${thisAlert.id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("무드온 미송 입고일 변경");
  await expect(row).toContainText(thisAlert.body ?? "");
  expect(
    (await r.locator("body").innerText()).match(/Invalid Date|NaN/),
  ).toBeNull();
  await r.keyboard.press("Escape");

  /* 소매 미송 화면: 무드온 빈티지 플라워 셔츠 레드 · L 줄의 예상 입고일 칸(6번째 열)이 전부 새 날짜. 행 전체로 보면
     주문일이 우연히 같을 때 통과한다(S4-3). 칸 글자가 정확히 날짜여야 `지연` 배지도 걸러진다 */
  await r.goto(`${R}/backorders?wholesaler=101`);
  const table = r.getByRole("table", { name: "미송 대기 목록" });
  await expect(table.getByRole("columnheader").nth(5)).toHaveText(
    "예상 입고일",
  );
  const lines = table
    .getByRole("row")
    .filter({ hasText: "빈티지 플라워 셔츠" })
    .filter({ hasText: "무드온" })
    .filter({ hasText: "레드 · L" });
  await expect(lines.first()).toBeVisible();
  const lineCount = await lines.count();
  for (let i = 0; i < lineCount; i++)
    await expect(lines.nth(i).getByRole("cell").nth(5)).toHaveText(nextInput);
  expect(
    (await r.locator("body").innerText()).match(/Invalid Date|NaN/),
  ).toBeNull();
  await expectNoMock(r);

  await wholesale.close();
  await retail.close();
});

test("장면 2·3 — 미송 되묻기 칩(소매 주문 번호) · 미수 답 · 사람 넘김", async ({
  browser,
}) => {
  test.skip(PW === "", "LIVE_PW(시드 비밀번호)가 없다");
  const retail = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
  });
  const r = await retail.newPage();
  await loginRetail(r);
  await r.goto(`${R}/chats/1`);
  const box = r.getByRole("textbox", { name: "메시지" });

  /* 방 1은 실서버라 앞 실행의 칩 묶음이 남아 있다(이미 고른 칩은 disabled). 묶음 수가 하나 늘었는지 보고,
     고르는 칩은 이번 되묻기 말풍선 안에서 찾는다 — 옛 묶음의 disabled 버튼을 누르지 않게 */
  const chipGroups = r.getByRole("group", { name: "주문 고르기" });
  await r.waitForLoadState("networkidle"); // 이전 대화를 다 받은 뒤에 센다
  const groupsBefore = await chipGroups.count();
  await box.fill("지난주 주문한 거 언제 와요?");
  const clarify = replyBubble(
    r,
    await sendAndWait(r, () => r.keyboard.press("Enter")),
  );
  await expect(chipGroups).toHaveCount(groupsBefore + 1, { timeout: 10_000 });
  const chips = clarify.getByRole("group", { name: "주문 고르기" });
  await expect(chips).toBeVisible();
  /* 소매가 보는 번호는 소매 orderId(#6001) — 골든셋의 도매 번호(#7001)가 아니다(contract-check 3절) */
  await expect(chips.getByRole("button").first()).toHaveText(/주문 #6001/);
  const backorder = replyBubble(
    r,
    await sendAndWait(r, () => chips.getByRole("button").first().click()),
  );
  await expect(
    backorder.getByText("도매 입고 예정이에요", { exact: false }),
  ).toBeVisible({ timeout: 10_000 });
  await backorder.getByRole("link", { name: "미송 대기 현황 보기" }).click();
  await r.waitForURL(/\/backorders\?wholesaler=101/);

  await r.goto(`${R}/chats/1`);
  /* 무드온 미수는 앞 실행과 다른 작업이 남긴 출고로 바뀐다(11-19 로컬 DB 135,000원). 기대 답을 시드 값(0원)으로
     박지 않고, 묻기 직전 서버의 지금 잔액으로 고른다. 문구 꼴은 서버 자동 답과 같다(목 `receivable.ts`가 따라 쓴다) */
  const settlements = (await (
    await r.request.get(`${R}/api/retail/settlements`)
  ).json()) as {
    data: {
      wholesalerId: number;
      balance: number;
      overdue: { count: number };
    }[];
  };
  const moodon = settlements.data.find((row) => row.wholesalerId === 101);
  const expectedReceivable =
    moodon === undefined || moodon.balance === 0
      ? "지금 갚을 돈은 없어요"
      : `갚을 돈은 ${moodon.balance.toLocaleString("ko-KR")}원이에요`;
  await box.fill("지금 미수 얼마예요?");
  const receivable = replyBubble(
    r,
    await sendAndWait(r, () => r.keyboard.press("Enter")),
  );
  await expect(
    receivable.getByText(expectedReceivable, { exact: false }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    receivable.getByRole("link", { name: "정산 화면에서 보기" }),
  ).toHaveAttribute("href", "/settlements?wholesaler=101");

  /* 서버는 같은 이유의 넘김이 열려 있으면 새 넘김 줄을 붙이지 않는다(ondo-api `InquiryLines.toAppend`). 사장이
     직접 쓴 글이 있어야 닫힌다 — 앞 실행이 남긴 열린 넘김을 사장 답으로 닫아야 이번 넘김 줄이 생긴다(#422 전엔
     2회째부터 옛 줄을 `.last()`로 잡아 통과했다) */
  const wholesale = await browser.newContext({
    viewport: { width: 1470, height: 900 },
    locale: "ko-KR",
  });
  const w = await wholesale.newPage();
  await loginWholesale(w);
  await w.goto(`${W}/chats?room=1`);
  await w.getByRole("textbox", { name: "메시지" }).fill("확인했어요");
  const ownerReplyResponse = w.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /\/api\/wholesale\/chat\/rooms\/1\/messages$/.test(
        new URL(res.url()).pathname,
      ),
    { timeout: 10_000 },
  );
  await w.keyboard.press("Enter");
  const ownerReply = await ownerReplyResponse;
  expect(ownerReply.ok(), `사장 답 응답 ${ownerReply.status()}`).toBe(true);
  await wholesale.close();

  /* 넘김 줄(HANDOFF)은 `data-sequence`가 없는 시스템 줄이다(앱 코드는 이 회차에서 안 바꾼다). 응답에 HANDOFF가
     있는지 보고, 화면에선 보내기 전보다 한 줄 늘었는지로 이번 줄을 센다 */
  const handoffNotes = r
    .getByRole("note")
    .filter({ hasText: "사장님께 전달했어요" });
  const notesBefore = await handoffNotes.count();
  await box.fill("사장님이랑 통화할게요");
  const handoff = await sendAndWait(r, () => r.keyboard.press("Enter"));
  expect(handoff.generatedMessages.map((m) => m.kind)).toContain("HANDOFF");
  await expect(handoffNotes).toHaveCount(notesBefore + 1, { timeout: 10_000 });
  await expect(handoffNotes.nth(notesBefore)).toBeVisible();
  expect(
    (await r.locator("body").innerText()).match(/Invalid Date|NaN/),
  ).toBeNull();
  await retail.close();
});

/**
 * W1-1 회귀. 서버 `GET /api/retail/settlements`의 `bank`는 `{bankName, accountNo, holder}`다. 웹이 다른 칸 이름
 * (`bankAccountNo`)을 읽으면 계좌가 있는데 "계좌 미등록"이 선다 — 같은 계좌를 주문서는 제대로 보여 사장이 정산 화면만
 * 틀린 줄 모른다. 시드: 무드온(101) 주계좌 국민은행 101-0101-0001 김무드.
 */
test("정산 — 소매 정산 화면 입금 계좌가 서버 주계좌와 같다(W1-1)", async ({
  browser,
}) => {
  test.skip(PW === "", "LIVE_PW(시드 비밀번호)가 없다");
  const retail = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
  });
  const r = await retail.newPage();
  await loginRetail(r);
  await r.goto(`${R}/settlements?wholesaler=101`);

  await expect(r.getByText("국민은행 101-0101-0001")).toBeVisible();
  await expect(r.getByText("예금주 김무드")).toBeVisible();
  await expect(
    r.getByRole("button", { name: "김무드 입금 계좌 복사" }),
  ).toBeVisible();
  await expect(r.getByText("계좌 미등록")).toHaveCount(0);
  await retail.close();
});
