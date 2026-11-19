import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  composer,
  enterRoom,
  inquiryButton,
  log,
  openProduct,
  openRoom,
  signIn,
  watchRequests,
} from "./helpers";

const QA = ".claude/harness/runs/loop-05a-retail-chat/qa";
assertStubServers();
test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await signIn(page);
});

test("measure 1470", async ({ page }) => {
  await openRoom(page, "/chats/1?from=/products/11");
  const out = await page.evaluate(() => {
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const root = getComputedStyle(document.documentElement);
    const tok = (n: string) => root.getPropertyValue(n).trim();
    const pick = (sel: string) => {
      const el = document.querySelector(sel);
      const s = cs(el);
      if (!el || !s) return null;
      const r = el.getBoundingClientRect();
      return {
        bg: s.backgroundColor,
        color: s.color,
        border: s.borderTopColor,
        bw: s.borderTopWidth,
        radius: s.borderTopLeftRadius,
        pad: s.padding,
        font: s.fontSize,
        lh: s.lineHeight,
        w: r.width,
        h: r.height,
        maxW: s.maxWidth,
        gap: s.gap,
        minH: s.minHeight,
        mb: s.marginBottom,
      };
    };
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (v: string) => {
      probe.style.color = v;
      return getComputedStyle(probe).color;
    };
    const tokens = Object.fromEntries(
      [
        "--color-primary",
        "--color-primary-foreground",
        "--color-secondary",
        "--color-card",
        "--color-border",
        "--color-border-strong",
        "--color-destructive",
        "--color-destructive-strong",
        "--color-muted",
        "--color-muted-foreground",
        "--color-secondary-foreground",
        "--color-foreground",
      ].map((t) => [t, resolve(`var(${t})`)]),
    );
    const logEl = document.querySelector('[role="log"]');
    return {
      tokens,
      radiusControl: tok("--radius-control"),
      me: pick('[data-sender="RETAILER"] > div'),
      meWrap: pick('[data-sender="RETAILER"]'),
      them: pick('[data-sender="WHOLESALER"][data-kind="TEXT"] > div'),
      auto: pick('[data-kind="AUTO_REPLY"] > div'),
      seen: pick('[data-kind="AUTO_REPLY"] [data-ac~="S5-6"]'),
      sys: pick('[role="note"]'),
      log: pick('[role="log"]'),
      logW: logEl?.clientWidth,
      h1: pick("h1"),
      headRow: pick('[data-ac="S5-5 S5-13 S5-15"]'),
      back: pick('[data-ac="S5-13"]'),
      textarea: pick("textarea"),
      composerBox: pick('[data-ac="S5-9"]'),
      send: pick('[data-ac="S6-3"]'),
      region: pick('[role="region"]'),
      header: pick("header"),
      headerPos: cs(document.querySelector("header"))?.position,
      pageScroll:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
    };
  });
  writeFileSync(`${QA}/measure-1470.json`, JSON.stringify(out, null, 2));
  await page.screenshot({ path: `${QA}/room-1470.png` });
});

test("measure entry 1470 + 390", async ({ page }) => {
  await openProduct(page, 11);
  await page.screenshot({ path: `${QA}/entry-product-1470.png` });
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (
        (init?.method ?? "GET") === "POST" &&
        String(input).endsWith("/api/retail/chat/rooms")
      )
        return new Response(
          JSON.stringify({ code: "INTERNAL", message: "x" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      return original(input, init);
    };
  });
  await inquiryButton(page).click();
  const err = page.locator('p[data-ac="S5-4"]');
  await expect(err).toBeVisible();
  const e = await err.evaluate((el) => {
    const s = getComputedStyle(el);
    return { font: s.fontSize, color: s.color, lh: s.lineHeight };
  });
  const btn = await inquiryButton(page).evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      h: r.height,
      font: s.fontSize,
      bg: s.backgroundColor,
      border: s.borderTopColor,
    };
  });
  await page.screenshot({ path: `${QA}/entry-error-1470.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products/31");
  await expect(inquiryButton(page)).toBeVisible();
  const phone = await inquiryButton(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const card = el
      .closest("div.ml-auto")
      ?.parentElement?.getBoundingClientRect();
    return {
      h: r.height,
      right: r.right,
      cardRight: card?.right,
      vw: innerWidth,
      scrollX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await page.screenshot({ path: `${QA}/entry-product-390-longname.png` });
  writeFileSync(
    `${QA}/measure-entry.json`,
    JSON.stringify({ err: e, btn, phone }, null, 2),
  );
});

test("measure 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProduct(page, 31);
  await enterRoom(page, 34, "/products/31");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const head = await page.evaluate(() => {
    const h1 = document.querySelector("h1")!;
    const a = document.querySelector('[data-ac="S5-13"]')!;
    const r = a.getBoundingClientRect();
    return {
      h1W: h1.clientWidth,
      h1SW: h1.scrollWidth,
      h1H: h1.getBoundingClientRect().height,
      linkH: r.height,
      linkW: r.width,
      linkRects: a.getClientRects().length,
    };
  });
  await page.screenshot({ path: `${QA}/room-390-longname.png` });
  await page.goto("/chats/1");
  await expect(log(page)).toBeVisible();
  const bubble = await page.evaluate(() => {
    const m = document.querySelector('[data-sender="RETAILER"]')!;
    const s = getComputedStyle(m);
    return {
      maxW: s.maxWidth,
      logW: document.querySelector('[role="log"]')!.clientWidth,
      minH: getComputedStyle(document.querySelector("textarea")!).minHeight,
    };
  });
  await composer(page).fill("가".repeat(1001));
  const over = page.getByText("1,000자까지 보낼 수 있어요 (1,001/1,000)");
  await expect(over).toBeVisible();
  const overM = await over.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const send = [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "보내기")!
      .getBoundingClientRect();
    return {
      h: r.height,
      lh: getComputedStyle(el).lineHeight,
      sendBottom: send.bottom,
      vh: innerHeight,
      pageY: document.documentElement.scrollHeight - innerHeight,
    };
  });
  await page.screenshot({ path: `${QA}/room-390-over1001.png` });
  await page.setViewportSize({ width: 390, height: 544 });
  await composer(page).fill("레드 M 몇 장 있어요?");
  await composer(page).focus();
  const kb = await page.evaluate(() => {
    const t = document.querySelector("textarea")!.getBoundingClientRect();
    const send = [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "보내기")!
      .getBoundingClientRect();
    const region = document
      .querySelector('[role="region"]')!
      .getBoundingClientRect();
    return {
      taTop: t.top,
      taBottom: t.bottom,
      sendBottom: send.bottom,
      vh: innerHeight,
      block: region.height,
      pageY:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
      scrollY,
    };
  });
  await page.screenshot({ path: `${QA}/room-390x544-keyboard.png` });
  await page.setViewportSize({ width: 390, height: 480 });
  const low = await page.evaluate(() => ({
    block: document.querySelector('[role="region"]')!.getBoundingClientRect()
      .height,
    pageY:
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  }));
  await page.screenshot({ path: `${QA}/room-390x480.png` });
  writeFileSync(
    `${QA}/measure-390.json`,
    JSON.stringify(
      { head, bubble, overM, kb, low, n: await bubbles(page).count() },
      null,
      2,
    ),
  );
});
