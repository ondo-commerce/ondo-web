import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "../loop-04-chat/helpers";
import {
  ASK_WHEN,
  assertSameDay,
  assertStubServers,
  bell,
  bellBadge,
  chatNav,
  count,
  COUNT_GET,
  fmtEta,
  incoming,
  log,
  navUnread,
  notifyMock,
  orderCards,
  orderChoice,
  orderGroups,
  openPanel,
  openRoomFromList,
  plus,
  R,
  R_1420,
  roomRow,
  rows,
  say,
  startNotify,
  stubEta,
  tableDate,
  waitCount,
} from "./helpers";

/**
 * #300 S4-2 — 시연 장면 2 전체(01-plan §2-1 1~11, 화면 계약 시연). 와이어프레임 06a `18_retail-chat` `#state-scene2`,
 * 06b `20_retail-notifications` `#state-eta-notice` `#state-arrive`. 알림 생성 연동의 증거가 아니다 — 도매 탭과
 * 소매 탭은 목 저장소가 따로라(05b-2 §3 out 8) 도매 PUT이 소매 알림을 만들지 않는다. 소매 쪽은 주입 둘(MSW
 * `notifications/incoming` + stub `backorders/eta`)로 같은 결과를 세운다.
 *
 * 탭 둘: 소매는 이 설정(`pnpm e2e:stub`, 3101 + 가짜 API 3199), 도매는 **목 모드 도매 서버 3100**이 따로 떠 있어야
 * 한다(stub 설정은 도매를 안 띄운다). 없으면 beforeAll이 실패한다 — 먼저
 * `NEXT_PUBLIC_API_MOCK=1 pnpm --filter wholesale exec next dev -p 3100`.
 *
 * 시계(§5-4 6): 기준일 R = 서울 실제 날짜, 두 탭 다 R 14:20에 고정한 뒤 reset. 3019 옛 입고일 R+7, 새 입고일 D = R+10.
 */

/* stub 미송 표는 가짜 API 프로세스에 하나다(02-dev 부채 4). 다른 spec의 `/__stub/reset`이 eta 주입을 덮지 않게
   이 파일은 직렬로, 실행은 `--workers=1`로 한다 */
test.describe.configure({ mode: "serial" });

assertStubServers();
test.afterAll(assertSameDay);

const WHOLESALE_ORIGIN = "http://localhost:3100";
const OLD = plus(R, 7);
const D = plus(R, 10);
const REASON = "원단 수급 지연";

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${WHOLESALE_ORIGIN}/login`, {
    failOnStatusCode: false,
  });
  expect(
    res.status(),
    `도매 서버(${WHOLESALE_ORIGIN}, 목 모드)가 없다 — NEXT_PUBLIC_API_MOCK=1 pnpm --filter wholesale exec next dev -p 3100`,
  ).toBe(200);
});

/** `YYYY-MM-DD` → 채팅 답 표기 `11월 8일`(R과 다른 해면 `2027년 1월 5일`) */
function koreanDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return date.slice(0, 4) === R.slice(0, 4)
    ? `${m}월 ${d}일`
    : `${y}년 ${m}월 ${d}일`;
}

/** 도매 탭 7~8: 3019 펼침 → D 입력 → 안내 "1곳" → 저장 → PUT 본문 D */
async function wholesaleSaves(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    baseURL: WHOLESALE_ORIGIN,
    viewport: { width: 1470, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  try {
    await page.clock.install({ time: R_1420 });
    await login(page);
    await page.getByRole("link", { name: "미송", exact: true }).click();
    await expect(page).toHaveURL(/\/backorders/);
    await resetWholesaleMock(page);

    await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
    const eta = page.getByRole("textbox", { name: "예상 입고일" });
    await expect(eta).toHaveValue(tableDate(OLD));

    // 7. D 입력 → 안내 줄
    await eta.fill(tableDate(D));
    await page.getByRole("textbox", { name: "변동 사유" }).fill(REASON);
    await expect(page.locator('form p[data-ac~="S3-1"]')).toHaveText(
      "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요",
    );

    // 8. 저장 → PUT 본문 D, "저장했어요"
    const put = page.waitForRequest(
      (r) =>
        /\/api\/wholesale\/variants\/3019\/expected-inbound$/.test(r.url()) &&
        r.method() === "PUT",
    );
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await put).postDataJSON()).toEqual({
      expectedInboundDate: D,
      expectedInboundReason: REASON,
    });
    await expect(
      page.getByRole("status").filter({ hasText: "저장했어요" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
}

async function resetWholesaleMock(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
  expect(status, "도매 목 reset(미송 목 포함)").toBe(200);
}

/** 방 1에서 장면 질문 → 칩 9003 → 마지막 답 카드 */
async function askAndPick(page: Page): Promise<void> {
  const groupsBefore = await orderGroups(page).count();
  await say(page, ASK_WHEN);
  await expect(orderGroups(page)).toHaveCount(groupsBefore + 1);
  const group = orderGroups(page).last();
  await expect(group.locator("button[data-backorder-id]")).toHaveCount(4);
  await orderChoice(group, 9003).click();
}

test("S4-2 장면 2 전체 — 도매 탭 입고일 저장(PUT D) + 소매 탭 06a 1~5 → 주입 둘 → 종 1 → 패널 행 → /backorders D → 채팅 다시 물음 D", async ({
  browser,
  page,
}) => {
  await test.step("도매 탭 7~8", () => wholesaleSaves(browser));

  // 소매 탭: R 14:20, 채팅 목 reset + 알림 `reset {empty}` + stub reset
  await startNotify(page, "/", { empty: true });
  await expect(bellBadge(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");

  await test.step("소매 06a 1~5(옛 날짜)", async () => {
    const seed = await navUnread(page);
    // 1. 도매 답 → 30초 안에 채팅 배지 +1
    await incoming(page, 1, "네 내일 오전에 주문 넣어 주시면 바로 챙길게요");
    const n = await count(page, COUNT_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, COUNT_GET, n + 1);
    await expect.poll(() => navUnread(page)).toBe(seed + 1);
    // 2~3. /chats → 무드온 방 → 배지 시드 값
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await roomRow(page, 1).click();
    await expect(page).toHaveURL("/chats/1?from=/chats");
    await expect.poll(() => navUnread(page)).toBe(seed);
    // 4~5. 질문 → 보기 4 → 9003 → 옛 날짜 카드
    await askAndPick(page);
    await expect(orderCards(page, 9003).last()).toContainText(
      `도매 입고 예정 ${koreanDate(OLD)}`,
    );
  });

  await test.step("소매 9: 홈 → 주입 둘 → 30초 → 종 배지 1", async () => {
    /* 클라이언트 이동이어야 한다 — `page.goto`면 페이지 안 목(MSW)이 시드로 돌아간다 */
    await page.getByRole("banner").locator('a[href="/"]').first().click();
    await expect(page).toHaveURL("/");
    await expect(bellBadge(page)).toHaveCount(0);
    await notifyMock(page, "incoming", {
      type: "BACKORDER_DATE_CHANGED",
      variantId: 3019,
      expectedInboundDate: D,
      expectedInboundReason: REASON,
    });
    await stubEta(page, 3019, D);
    const n = await count(page, COUNT_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, COUNT_GET, n + 1);
    await expect(bellBadge(page)).toHaveText("1");
    await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 1개");
  });

  await test.step("소매 10~11: 패널 첫 행 → /backorders D, 배지 없음", async () => {
    await openPanel(page);
    await expect(rows(page)).toHaveCount(1);
    const first = rows(page).first();
    await expect(first).toContainText("무드온 미송 입고일 변경");
    await expect(first).toContainText(
      `린넨 셋업 자켓 베이지/L 남은 2장, ${fmtEta(OLD)} → ${fmtEta(D)}`,
    );
    await expect(first).toContainText("방금");
    await expect(first).toHaveAttribute("data-unread", "true");

    await first.click();
    await expect(page).toHaveURL("/backorders?wholesaler=101");
    await expect(
      page.getByRole("link", { name: "무드온", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    const linen = page.locator("table").first().locator("tbody tr").filter({
      hasText: "린넨 셋업 자켓",
    });
    await expect(linen).toContainText(tableDate(D));
    await expect(linen).not.toContainText(tableDate(OLD));
    await expect(bellBadge(page)).toHaveCount(0);
  });

  await test.step("소매: /chats/1 다시 물음 → 카드 D", async () => {
    await openRoomFromList(page);
    await askAndPick(page);
    await expect(orderCards(page, 9003).last()).toContainText(
      `도매 입고 예정 ${koreanDate(D)}`,
    );
    await expect(
      log(page).locator('[data-kind="AUTO_REPLY"]').last(),
    ).toContainText(
      `남은 미송 2장은 ${koreanDate(D)} 도매 입고 예정이에요(${REASON})`,
    );
  });
});
