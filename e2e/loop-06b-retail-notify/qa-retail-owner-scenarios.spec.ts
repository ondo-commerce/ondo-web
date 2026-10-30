import { expect, test, type Page } from "@playwright/test";
import { login } from "../loop-04-chat/helpers";
import {
  assertSameDay,
  assertStubServers,
  bell,
  bellBadge,
  box,
  chatMock,
  count,
  COUNT_GET,
  ASK_WHEN,
  fmtEta,
  LIST_GET,
  logoutThenLogin,
  moreButton,
  notifyMock,
  openPanel,
  orderChoice,
  orderGroups,
  panel,
  pauseClock,
  plus,
  R,
  routeAuth,
  rows,
  say,
  signIn,
  startNotify,
  tableDate,
  waitCount,
} from "./helpers";

/**
 * QA loop-06b 소매 사장 시나리오(04-qa.md "사장 시나리오", "누출", S4-3 리허설).
 * `pnpm e2e:stub`(3101 + 가짜 API 3199). (a) 리허설은 목 모드 도매 3100이 따로 떠 있어야 한다.
 * 스크린샷은 runs/loop-06b-retail-notify/qa/.
 */

assertStubServers();
test.afterAll(assertSameDay);
/* stub 미송 표는 프로세스에 하나다(02-dev 부채 4). 리허설의 eta 주입을 다른 spec reset이 덮지 않게 */
test.describe.configure({ mode: "serial" });

const SHOTS =
  "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06b-retail-notify/qa";
const WHOLESALE = "http://localhost:3100";
const OLD = plus(R, 7);
const D = plus(R, 10);

/** 방 1에서 질문 → 새 보기 묶음이 그려진 뒤 그 묶음의 9003 */
async function askAndPick(page: Page): Promise<void> {
  const groups = orderGroups(page);
  const before = await groups.count();
  await say(page, ASK_WHEN);
  await expect(groups).toHaveCount(before + 1);
  await orderChoice(groups.last(), 9003).click();
}

/** 대본(docs/12-demo-guide.md §8)의 콘솔 줄을 글자 그대로 돌린다. D만 그날 날짜로 바꾼다 */
async function consoleLine(page: Page, line: string): Promise<number> {
  return page.evaluate(async (src) => {
    const run = new Function(
      `return (async () => { const r = ${src}; return r.status; })()`,
    );
    return (await run()) as number;
  }, line);
}

test("(a) S4-3 리허설 근사: 대본 §8 콘솔 줄 그대로, 실제 시계, 탭 둘(도매 3100 목 + 소매 stub). 단계별 시간", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const res = await page.request.get(`${WHOLESALE}/login`, {
    failOnStatusCode: false,
  });
  expect(res.status(), "도매 3100 목 서버가 따로 떠 있어야 한다").toBe(200);
  const t0 = Date.now();
  const lap: Record<string, number> = {};
  const mark = (k: string) => {
    lap[k] = Math.round((Date.now() - t0) / 1000);
    console.log("QA lap", k, lap[k]);
  };

  /* 탭 B 준비: 대본 초기화 줄 */
  await signIn(page, "bombom");
  await page.goto("/");
  await expect(bell(page)).toBeVisible();
  await expect
    .poll(() =>
      consoleLine(
        page,
        `await fetch("/__mock/chat/reset",{method:"POST",body:"{}"})`,
      ),
    )
    .toBe(200);
  expect(
    await consoleLine(
      page,
      `await fetch("/__mock/notifications/reset",{method:"POST",body:JSON.stringify({empty:true})})`,
    ),
  ).toBe(200);
  expect(
    (await page.request.post("http://localhost:3199/__stub/reset")).status(),
  ).toBe(200);
  mark("초기화");

  /* 1. 도매 답 주입 → 30초 안 채팅 배지 */
  expect(
    await consoleLine(
      page,
      `await fetch("/__mock/chat/rooms/1/incoming",{method:"POST",body:JSON.stringify({body:"네 내일 오전에 주문 넣어 주시면 바로 챙길게요"})})`,
    ),
  ).toBeLessThan(300);
  await expect(
    page.getByRole("banner").getByRole("link", { name: /^채팅/ }),
  ).toHaveAccessibleName(/안 읽은 메시지/, {
    timeout: 35_000,
  });
  mark("1 채팅 배지");

  /* 2. 채팅 → 무드온 방 → 질문 → 린넨 → 옛 날짜 카드 */
  await page.getByRole("banner").getByRole("link", { name: /^채팅/ }).click();
  await page.locator('a[data-room-id="1"]').click();
  await expect(page).toHaveURL(/\/chats\/1/);
  await askAndPick(page);
  const [, om, od] = OLD.split("-").map(Number);
  await expect(page.locator("main")).toContainText(
    `도매 입고 예정 ${om}월 ${od}일`,
  );
  mark("2 옛 날짜 카드");

  /* 3. 탭 A 도매: 미송 → SKU 1-2 → D + 사유 → 안내 → 저장 */
  const wctx = await browser.newContext({
    baseURL: WHOLESALE,
    viewport: { width: 1470, height: 900 },
    locale: "ko-KR",
  });
  const w = await wctx.newPage();
  await login(w);
  await w.getByRole("link", { name: "미송", exact: true }).click();
  await expect
    .poll(() =>
      consoleLine(
        w,
        `await fetch("/__mock/chat/reset",{method:"POST",body:"{}"})`,
      ),
    )
    .toBe(200);
  await w.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  await w
    .getByRole("textbox", { name: "예상 입고일", exact: true })
    .fill(tableDate(D));
  await w
    .getByRole("textbox", { name: "변동 사유", exact: true })
    .fill("원단 수급 지연");
  await expect(w.locator('form p[data-ac~="S3-1"]')).toHaveText(
    "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요",
  );
  await w
    .locator("form")
    .first()
    .screenshot({ path: `${SHOTS}/a-wholesale-eta-before-save.png` });
  await w.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    w.getByRole("status").filter({ hasText: "저장했어요" }),
  ).toBeVisible();
  await w.screenshot({ path: `${SHOTS}/a-wholesale-saved-1470.png` });
  await wctx.close();
  mark("3 도매 저장");

  /* 4. 탭 B 홈 → 배지 없음 → 대본 주입 둘 */
  await page.getByRole("banner").locator('a[href="/"]').first().click();
  await expect(page).toHaveURL("/");
  await expect(bellBadge(page)).toHaveCount(0);
  expect(
    await consoleLine(
      page,
      `await fetch("/__mock/notifications/incoming",{method:"POST",body:JSON.stringify({type:"BACKORDER_DATE_CHANGED",variantId:3019,expectedInboundDate:"${D}",expectedInboundReason:"원단 수급 지연"})})`,
    ),
  ).toBe(200);
  const eta = await page.request.post(
    "http://localhost:3199/__stub/backorders/eta",
    {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ variantId: 3019, expectedInboundDate: D }),
    },
  );
  expect(eta.status()).toBe(200);
  mark("4 주입");

  /* 5. 실제 시계 30초 안에 종 1 */
  await expect(bellBadge(page)).toHaveText("1", { timeout: 35_000 });
  mark("5 종 1");
  await page
    .getByRole("banner")
    .screenshot({ path: `${SHOTS}/a-retail-bell-1.png` });
  await openPanel(page);
  const first = rows(page).first();
  await expect(first).toContainText("무드온 미송 입고일 변경");
  await expect(first).toContainText(
    `린넨 셋업 자켓 베이지/L 남은 2장, ${fmtEta(OLD)} → ${fmtEta(D)}`,
  );
  await expect(first).toContainText("방금");
  await page.screenshot({ path: `${SHOTS}/a-retail-panel-1470.png` });

  /* 6. 행 → 미송 화면 D, 배지 없음 */
  await first.click();
  await expect(page).toHaveURL("/backorders?wholesaler=101");
  await expect(
    page
      .locator("table")
      .first()
      .locator("tbody tr")
      .filter({ hasText: "린넨 셋업 자켓" }),
  ).toContainText(tableDate(D));
  await expect(bellBadge(page)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/a-retail-arrive-1470.png` });
  mark("6 미송 화면");

  /* 7. 다시 물음 → D 카드 */
  await page.getByRole("banner").getByRole("link", { name: /^채팅/ }).click();
  await page.locator('a[data-room-id="1"]').click();
  await expect(page).toHaveURL(/\/chats\/1/);
  await askAndPick(page);
  const [, dm, dd] = D.split("-").map(Number);
  await expect(page.locator("main")).toContainText(
    `${dm}월 ${dd}일 도매 입고 예정이에요(원단 수급 지연)`,
  );
  mark("7 새 날짜 답");
  test
    .info()
    .annotations.push({ type: "lap(s)", description: JSON.stringify(lap) });
});

test("(b) bombom 패널 연 뒤 로그아웃 → miso 로그인. 새 count 오기 전 배지 0(옛 2 아님), 패널 옛 행 0", async ({
  page,
}) => {
  await routeAuth(page);
  await startNotify(page, "/");
  await expect(bellBadge(page)).toHaveText("2");
  await openPanel(page);
  await expect(rows(page)).toHaveCount(20);
  await page.keyboard.press("Escape");
  /* 로그인 뒤 첫 count와 첫 목록을 늦춘다 — 그 사이 화면이 무엇을 보여 주는지가 이 시나리오다 */
  await chatMock(page, "delay", { op: "count", ms: 4_000 });
  await logoutThenLogin(page, "miso");
  await pauseClock(page);
  const seen: { badge: number; name: string | null }[] = [];
  for (let t = 0; t < 3_000; t += 500) {
    seen.push({
      badge: await bellBadge(page).count(),
      name: await bell(page).getAttribute("aria-label"),
    });
    await page.clock.runFor(500);
  }
  test
    .info()
    .annotations.push({
      type: "miso-window",
      description: JSON.stringify(seen),
    });
  expect(
    seen.every((s) => s.badge === 0 && s.name === "알림"),
    "miso 로그인 직후 bombom 배지 0",
  ).toBe(true);
  await notifyMock(page, "delay", { op: "list", ms: 3_000 });
  const lists = await count(page, LIST_GET);
  await openPanel(page);
  await waitCount(page, LIST_GET, lists + 1);
  await expect(rows(page)).toHaveCount(0);
  await panel(page).screenshot({ path: `${SHOTS}/b-miso-loading.png` });
});

const PHONES = [
  { width: 320, height: 640 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
] as const;

for (const vp of PHONES) {
  test(`(c) ${vp.width}: 종 누름, 계정 메뉴 찜 목록, 패널 끝 행과 더 보기 가림 0, 모두 읽음 버튼 한 줄`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await startNotify(page, "/");
    await page
      .getByRole("banner")
      .screenshot({ path: `${SHOTS}/c-header-${vp.width}.png` });
    /* 찜은 헤더에 안 보이고 계정 메뉴에 있다 */
    await expect(
      page
        .getByRole("banner")
        .getByRole("link", { name: "찜 목록", exact: true }),
    ).toBeHidden();
    await page.getByRole("button", { name: /계정 메뉴$/ }).click();
    await expect(
      page.getByRole("link", { name: "찜 목록", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await openPanel(page);
    await expect(rows(page)).toHaveCount(20);
    const p = await box(panel(page));
    const markAll = panel(page).getByRole("button", { name: /모두 읽음$/ });
    const mb = await box(markAll);
    /* 글자 줄 수 = 텍스트 Range 사각형의 서로 다른 top 개수(고정 높이 44라 상자 높이로는 두 줄을 못 본다) */
    const markAllLines = await markAll.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    const list = panel(page).locator(".overflow-y-auto");
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const more = moreButton(page);
    await expect(more).toBeInViewport();
    const last = rows(page).last();
    const hit = async (sel: "more" | "last") =>
      (sel === "more" ? more : last).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const h = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return h !== null && (h === el || el.contains(h));
      });
    const m = {
      panel: {
        left: Math.round(p.x),
        right: Math.round(vp.width - p.x - p.width),
        bottom: Math.round(p.y + p.height),
      },
      markAllH: Math.round(mb.height),
      markAllLines,
      moreHit: await hit("more"),
      lastHit: await hit("last"),
      lastBottom: Math.round((await box(last)).y + (await box(last)).height),
      scrollX: await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    };
    test
      .info()
      .annotations.push({ type: "measure", description: JSON.stringify(m) });
    await page.screenshot({ path: `${SHOTS}/c-panel-end-${vp.width}.png` });
    expect(m.panel.left).toBe(16);
    expect(m.panel.right).toBe(16);
    expect(m.panel.bottom).toBeLessThanOrEqual(vp.height);
    expect(m.moreHit && m.lastHit).toBe(true);
    expect(m.scrollX).toBe(0);
    expect(m.markAllH, "모두 읽음 버튼 44").toBe(44);
    expect(m.markAllLines, "모두 읽음 글자 한 줄(hallmark 49)").toBe(1);
  });
}

test("누출: 3003 입고일 변경 주입 뒤 목록, count JSON과 패널 DOM에 남의 수량, SKU 합계, retailerName, availableQty 0", async ({
  page,
}) => {
  await startNotify(page, "/");
  await notifyMock(page, "incoming", {
    type: "BACKORDER_DATE_CHANGED",
    variantId: 3003,
    expectedInboundDate: plus(R, 9),
  });
  const json = await page.evaluate(async () => {
    const list = await (
      await fetch("/api/retail/notifications?size=100")
    ).text();
    const cnt = await (
      await fetch("/api/retail/notifications/unread-count")
    ).text();
    return { list, cnt };
  });
  const both = json.list + json.cnt;
  const keys = ["retailerName", "availableQty", "retailerId", "retailer"];
  const found = keys.filter((k) => both.includes(`"${k}"`));
  const parsed = JSON.parse(json.list) as {
    data: { title: string; body: string | null }[];
  };
  const mine = parsed.data.find((n) => n.body?.includes("남은 6장"));
  test
    .info()
    .annotations.push({
      type: "bodies",
      description: JSON.stringify(parsed.data.slice(0, 3)),
    });
  expect(found, "금지 키").toEqual([]);
  expect(mine, "봄봄 몫 6장(9001 4 + 9006 2)").toBeDefined();
  expect(both).not.toMatch(/9장|15장|대기상회/);
  await page.clock.fastForward(30_000);
  await openPanel(page);
  await expect(rows(page).first()).toContainText("남은 6장");
  const dom = await page.evaluate(() => document.body.innerText);
  expect(dom).not.toMatch(/남은 9장|남은 15장|대기상회/);
});
