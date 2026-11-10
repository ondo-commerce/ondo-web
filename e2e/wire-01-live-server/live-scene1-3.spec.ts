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
  await box.fill("지금 미수 얼마예요?");
  const receivable = replyBubble(
    r,
    await sendAndWait(r, () => r.keyboard.press("Enter")),
  );
  await expect(receivable.getByText("지금 갚을 돈은 없어요")).toBeVisible({
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
