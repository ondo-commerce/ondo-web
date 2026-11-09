import { expect, test, type Page } from "@playwright/test";

/**
 * wire-01-live-server (#420) — 로컬 실서버(도매 :8081, 소매 :8080)에 붙은 웹 두 앱으로 시연 장면 1~3을 돈다.
 *
 * **실서버 설정으로만 돈다**: `LIVE_PW=<시드 비밀번호> pnpm e2e:live`(`playwright.live.config.ts`). 그 설정이 웹 두 앱을
 * `NEXT_PUBLIC_API_MOCK=0`, `API_ORIGIN` 도매 :8081 / 소매 :8080 으로 3200/3201 에 띄우고 `LIVE_W`·`LIVE_R`을 채운다.
 * 기본·stub 설정은 이 폴더를 testIgnore 한다. 서버 두 대는 먼저 떠 있어야 하고 CI에선 안 돈다.
 *
 * 시드 계정 moodon(도매처 101) / bombom(소매 1). 비밀번호는 시드 SQL 주석(여기 적지 않는다 — `LIVE_PW`로 넘긴다).
 * 서버 상태를 바꾼다(방 1 메시지, 장바구니, 주문). 되돌리지 않는다.
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
  const bellBefore = await w
    .getByRole("button", { name: /알림/ })
    .getAttribute("aria-label");

  await loginRetail(r);
  await r.goto(`${R}/products/2001`);
  await r.getByRole("button", { name: "문의하기" }).click();
  await r.waitForURL(/\/chats\/\d+/);
  await expectNoMock(r);

  await r
    .getByRole("textbox", { name: "메시지" })
    .fill("이거 레드 M 재고 있어요?");
  await r.keyboard.press("Enter");
  const card = r.getByText("레드 M은 10~49장 있어요", { exact: false }).last();
  await expect(card).toBeVisible({ timeout: 10_000 });

  await r.getByRole("textbox", { name: "레드 / M 수량" }).last().fill("3");
  await r.getByRole("button", { name: "장바구니에 담기" }).last().click();
  await expect(
    r.getByRole("status").filter({ hasText: "장바구니에 담았어요" }),
  ).toBeVisible();

  await r.goto(`${R}/cart`);
  await r.getByRole("link", { name: "주문하기" }).click();
  await r.waitForURL(/\/checkout/);
  await r.getByRole("button", { name: "주문 접수하기" }).click();
  await r.waitForURL(/\/checkout\/complete/);

  /* 도매 헤더 배지 polling 30초 — 실측 28초 */
  await expect
    .poll(
      async () =>
        w.getByRole("button", { name: /알림/ }).getAttribute("aria-label"),
      { timeout: 45_000 },
    )
    .not.toBe(bellBefore);
  await w.getByRole("button", { name: /알림/ }).click();
  await expect(
    w
      .getByRole("dialog", { name: "알림" })
      .getByRole("link", { name: /봄봄상회 새 주문/ })
      .first(),
  ).toBeVisible();

  expect(apiRequests.every((url) => url.startsWith(`${R}/api/`))).toBe(true);
  await retail.close();
  await wholesale.close();
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

  /* 방 1은 실서버라 앞 실행의 칩 묶음이 남아 있다(이미 고른 칩은 disabled). `.last()`가 새 답이 오기 전에
     옛 묶음을 잡으면 disabled 버튼을 눌러 시간 초과로 멈춘다 — 묶음 수가 하나 늘 때까지 기다린다 */
  const chipGroups = r.getByRole("group", { name: "주문 고르기" });
  await r.waitForLoadState("networkidle"); // 이전 대화를 다 받은 뒤에 센다
  const groupsBefore = await chipGroups.count();
  await box.fill("지난주 주문한 거 언제 와요?");
  await r.keyboard.press("Enter");
  await expect(chipGroups).toHaveCount(groupsBefore + 1, { timeout: 10_000 });
  const chips = chipGroups.last();
  await expect(chips).toBeVisible();
  /* 소매가 보는 번호는 소매 orderId(#6001) — 골든셋의 도매 번호(#7001)가 아니다(contract-check 3절) */
  await expect(chips.getByRole("button").first()).toHaveText(/주문 #6001/);
  await chips.getByRole("button").first().click();
  await expect(
    r.getByText("도매 입고 예정이에요", { exact: false }).last(),
  ).toBeVisible({ timeout: 10_000 });
  await r.getByRole("link", { name: "미송 대기 현황 보기" }).last().click();
  await r.waitForURL(/\/backorders\?wholesaler=101/);

  await r.goto(`${R}/chats/1`);
  await box.fill("지금 미수 얼마예요?");
  await r.keyboard.press("Enter");
  await expect(r.getByText("지금 갚을 돈은 없어요").last()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    r.getByRole("link", { name: "정산 화면에서 보기" }).last(),
  ).toHaveAttribute("href", "/settlements?wholesaler=101");

  await box.fill("사장님이랑 통화할게요");
  await r.keyboard.press("Enter");
  await expect(
    r.getByRole("note").filter({ hasText: "사장님께 전달했어요" }).last(),
  ).toBeVisible({ timeout: 10_000 });
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
