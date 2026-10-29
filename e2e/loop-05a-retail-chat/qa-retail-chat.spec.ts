import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  box,
  bubbles,
  composer,
  CREATE_POST,
  enterRoom,
  inquiryButton,
  log,
  mock,
  openProduct,
  openRoom,
  pageOverflow,
  requests,
  signIn,
  stubRequests,
  watchRequests,
} from "./helpers";

/**
 * loop-05a QA — 소매 사장 시나리오 5개(a~e), 390 상태, 디자인 토큰 대조, 정확 수량 문자열.
 * 실행: `pnpm e2e:stub`(stub 3199 + retail 3101 목 모드. 채팅은 브라우저 MSW, 서버 쪽은 가짜 API)
 * #285 기능을 보는 것은 `qa-retail-chat-send.spec.ts`에 있다.
 *
 * F4 F5 테스트는 처음엔 `test.fail`(알려진 결함)이었다. review-fix(같은 커밋)에서 고쳐 표시를 지웠다.
 */

const QA = ".claude/harness/runs/loop-05a-retail-chat/qa";

assertStubServers();

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await signIn(page);
});

test("(a) 새 브라우저에서 상품 상세 직행 → 바로 문의하기 → POST 1회, worker가 응답, 가짜 API에 /chat/ 0건", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: "ko-KR",
  });
  const page = await context.newPage();
  // worker 등록을 1.2초 늦춘다 — 로컬에선 worker가 버튼보다 먼저 떠서 대기 여부가 안 드러난다
  await page.addInitScript(() => {
    const c = navigator.serviceWorker;
    const register = c.register.bind(c);
    c.register = (url, options) =>
      new Promise((r) => setTimeout(r, 1200)).then(() =>
        register(url, options),
      );
  });
  await signIn(page);
  const creates: { status: number; sw: boolean }[] = [];
  page.on("response", (r) => {
    if (
      r.request().method() === "POST" &&
      /\/api\/retail\/chat\/rooms$/.test(r.url())
    )
      creates.push({ status: r.status(), sw: r.fromServiceWorker() });
  });
  const before = (await stubRequests(page)).filter((r) => r.includes("/chat/"));
  await page.goto("/products/11");
  await inquiryButton(page).click();
  await expect(page).toHaveURL("/chats/1?from=/products/11");
  await expect(
    page.getByRole("heading", { level: 1, name: "무드온" }),
  ).toBeVisible();
  expect(creates).toEqual([{ status: 200, sw: true }]);
  const after = (await stubRequests(page)).filter((r) => r.includes("/chat/"));
  expect(after).toEqual(before);
  await page.screenshot({ path: `${QA}/a-room-after-entry.png` });
  await context.close();
});

/* (b) 낭독, (e) (e2) 세션 끊김, 390 세션 끊김 두 줄, F3 긴 대화는 #285 기능(polling, 세션 어댑터)을
   봐서 `qa-retail-chat-send.spec.ts`(#285 커밋)로 옮겼다 */

test("(c) 두 도매처에 문의 → 각자 방을 다시 열면 각자 글만 있다", async ({
  page,
}) => {
  await openProduct(page, 11);
  await enterRoom(page, 1, "/products/11");
  await composer(page).fill("무드온에 묻는 글");
  await composer(page).press("Enter");
  const a = bubbles(page).filter({
    has: page.getByText("무드온에 묻는 글", { exact: true }),
  });
  await expect(a).toHaveCount(1);

  // 전부 클라이언트 이동 — 목 상태가 페이지 안에 있다
  await page.getByRole("link", { name: /도마켓/ }).click();
  await page.getByRole("link", { name: "린넨 팬츠", exact: true }).click();
  await expect(page).toHaveURL("/products/21");
  await enterRoom(page, 33, "/products/21");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("라온");
  await composer(page).fill("라온에 묻는 글");
  await composer(page).press("Enter");
  const b = bubbles(page).filter({
    has: page.getByText("라온에 묻는 글", { exact: true }),
  });
  await expect(b).toHaveCount(1);
  await expect(a).toHaveCount(0);

  await page.getByRole("link", { name: /도마켓/ }).click();
  await page.getByRole("link", { name: "코튼 셔츠", exact: true }).click();
  await enterRoom(page, 1, "/products/11");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("무드온");
  await expect(a).toHaveCount(1);
  await expect(b).toHaveCount(0);

  await page.getByRole("link", { name: /도마켓/ }).click();
  await page.getByRole("link", { name: "린넨 팬츠", exact: true }).click();
  await enterRoom(page, 33, "/products/21");
  await expect(b).toHaveCount(1);
  await expect(a).toHaveCount(0);
  const posts = await requests(page, CREATE_POST);
  expect(posts.map((p) => p.status)).toEqual([200, 200, 200, 200]);
});

test("(d) 방에서 상품으로 돌아가기 → 보던 상품(/products/11, 코튼 셔츠)", async ({
  page,
}) => {
  await openProduct(page, 11);
  await enterRoom(page, 1, "/products/11");
  await page
    .getByRole("link", { name: "상품으로 돌아가기", exact: true })
    .click();
  await expect(page).toHaveURL("/products/11");
  await expect(
    page.getByRole("heading", { level: 1, name: "코튼 셔츠" }),
  ).toBeVisible();
  await expect(inquiryButton(page)).toBeEnabled();
});

test.describe("390", () => {
  test("30자 상호 방 머리 한 줄, 링크 한 줄", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProduct(page, 31);
    await enterRoom(page, 34, "/products/31");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    const m = await h1.evaluate((el) => ({
      truncated: el.scrollWidth > el.clientWidth,
      height: el.getBoundingClientRect().height,
    }));
    expect(m).toEqual({ truncated: true, height: 28 });
    expect((await pageOverflow(page)).x).toBeLessThanOrEqual(0);
  });

  test("F4 방 머리 돌아가기 링크 높이 44(와이어프레임 ≤640 .rtitle .home min-height)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoom(page, "/chats/1?from=/products/11");
    const link = page.getByRole("link", {
      name: "상품으로 돌아가기",
      exact: true,
    });
    expect(Math.round((await box(link)).height)).toBeGreaterThanOrEqual(44);
  });

  test("390x480 하한 448", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await openRoom(page, "/chats/1");
    const block = await box(page.getByRole("region", { name: "무드온 대화" }));
    expect(Math.round(block.height)).toBe(448);
  });
});

test.describe("디자인 토큰(와이어프레임 _base.css 대조)", () => {
  test("말풍선, 방 머리, 입력창, 블록 높이, sticky 헤더", async ({ page }) => {
    await openRoom(page, "/chats/1?from=/products/11");
    const m = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.append(probe);
      const token = (name: string) => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      const s = (sel: string) => getComputedStyle(document.querySelector(sel)!);
      const me = s('[data-sender="RETAILER"] > div');
      const them = s('[data-sender="WHOLESALER"][data-kind="TEXT"] > div');
      const auto = s('[data-kind="AUTO_REPLY"] > div');
      const seen = s('[data-kind="AUTO_REPLY"] [data-ac~="S5-6"]');
      return {
        me: [
          me.backgroundColor === token("--color-primary"),
          me.color === token("--color-primary-foreground"),
          me.borderTopLeftRadius,
          me.padding,
          me.fontSize,
          me.lineHeight,
        ],
        them: [
          them.backgroundColor === token("--color-secondary"),
          them.color === token("--color-foreground"),
        ],
        auto: [
          auto.backgroundColor === token("--color-card"),
          auto.borderTopColor === token("--color-border"),
          auto.borderTopWidth,
        ],
        seen: [seen.color === token("--color-muted-foreground"), seen.fontSize],
        wrapMax: s('[data-sender="RETAILER"]').maxWidth,
        logGap: s('[role="log"]').rowGap,
        h1: [s("h1").fontSize, s("h1").lineHeight],
        headMb: s('[data-ac="S5-5 S5-13 S5-15"]').marginBottom,
        back: [
          s('[data-ac="S5-13"]').fontSize,
          s('[data-ac="S5-13"]').color === token("--color-muted-foreground"),
        ],
        taMin: s("textarea").minHeight,
        composerTop: [
          s('[data-ac="S5-9"]').paddingTop,
          s('[data-ac="S5-9"]').borderTopColor === token("--color-border"),
        ],
        header: s("header").position,
        block: document
          .querySelector('[role="region"]')!
          .getBoundingClientRect().height,
        vh: innerHeight,
      };
    });
    expect(m).toEqual({
      me: [true, true, "8px", "8px 12px", "14px", "20px"],
      them: [true, true],
      auto: [true, true, "1px"],
      seen: [true, "12px"],
      wrapMax: "70%",
      logGap: "12px",
      h1: ["20px", "28px"],
      headMb: "16px",
      back: ["13px", true],
      taMin: "84px",
      composerTop: ["12px", true],
      header: "sticky",
      block: m.vh - 73,
      vh: 900,
    });
  });

  test("390: 말풍선 85%, 입력창 최소 66, 문의하기 높이 44", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProduct(page, 31);
    expect(Math.round((await box(inquiryButton(page))).height)).toBe(44);
    await page.goto("/chats/1");
    await expect(log(page)).toBeVisible();
    const m = await page.evaluate(() => ({
      wrap: getComputedStyle(
        document.querySelector('[data-sender="RETAILER"]')!,
      ).maxWidth,
      ta: getComputedStyle(document.querySelector("textarea")!).minHeight,
    }));
    expect(m).toEqual({ wrap: "85%", ta: "66px" });
  });

  test("F5 입구 실패 한 줄 13px(디자인 결정 3, 와이어프레임 .err = --text-body)", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await mock(page, "fail", { op: "create", status: 500 });
    await inquiryButton(page).click();
    const err = page.locator('p[data-ac="S5-4"]');
    await expect(err).toHaveText("대화방을 열지 못했어요. 다시 눌러 주세요");
    await page.screenshot({ path: `${QA}/F5-entry-error.png` });
    expect(await err.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "13px",
    );
  });
});

test("정확 재고 수량 문자열 0: 방 1(시드 재고 35), 방 33 화면 글에 '35장' 없음, DOM에 availableQty 없음", async ({
  page,
}) => {
  await openRoom(page, "/chats/1");
  await expect(bubbles(page)).toHaveCount(7);
  const room1 = await page.locator("main").innerText();
  expect(room1).toContain("10~49장");
  expect(room1).not.toMatch(/35\s*장/);
  expect(await page.content()).not.toContain("availableQty");
  await page.goto("/products/21");
  await resetAndEnter33(page);
  const room33 = await page.locator("main").innerText();
  expect(room33).not.toContain("availableQty");
  await expect(log(page).getByRole("note")).toContainText(
    "사장님께 전달했어요",
  );
});

async function resetAndEnter33(page: Page) {
  await expect(inquiryButton(page)).toBeVisible();
  await enterRoom(page, 33, "/products/21");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("라온");
}
