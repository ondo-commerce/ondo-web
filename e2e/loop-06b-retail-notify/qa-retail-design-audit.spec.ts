import { expect, test } from "@playwright/test";
import {
  assertSameDay,
  assertStubServers,
  bell,
  bellBadge,
  injectEta,
  markAllButton,
  newerButton,
  openPanel,
  panel,
  pauseClock,
  plus,
  R,
  rowById,
  rows,
  runToNextCount,
  startNotify,
} from "./helpers";

/**
 * QA loop-06b 소매 디자인 audit(04-qa.md "디자인 audit"). 와이어프레임 `20_retail-notifications`와 디자인 결정 47~59의
 * 수치를 getComputedStyle 로 잰다. 값은 annotation 으로 남긴다. 스크린샷 runs/loop-06b-retail-notify/qa/.
 */

assertStubServers();
test.afterAll(assertSameDay);

const SHOTS =
  "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06b-retail-notify/qa";

test("1470 결정 47 50 52 57 59: 종 32, 배지 = 장바구니 카운터, 패널 360 + shadow-dropdown, 행 토큰, 열린 종 secondary", async ({
  page,
}) => {
  await startNotify(page, "/");
  const m1 = await page.evaluate(() => {
    const css = (el: Element | null, keys: string[]) => {
      if (el === null) return null;
      const cs = getComputedStyle(el);
      return Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(k)]));
    };
    const header = document.querySelector("header")!;
    const bellBtn = header.querySelector('button[aria-label^="알림"]');
    const badge =
      bellBtn?.querySelector('[aria-hidden="true"][data-ac~="S2-2"]') ?? null;
    const cart = header.querySelector('a[aria-label^="장바구니"]');
    const cartBadge = cart
      ? ([...cart.querySelectorAll("span")].find((s) =>
          /^\d+$/.test(s.textContent ?? ""),
        ) ?? null)
      : null;
    const keys = [
      "background-color",
      "color",
      "height",
      "min-width",
      "font-size",
      "border-radius",
      "top",
      "right",
    ];
    return {
      bell: {
        w: bellBtn?.getBoundingClientRect().width,
        h: bellBtn?.getBoundingClientRect().height,
      },
      badge: css(badge, keys),
      cartBadge: css(cartBadge, keys),
      cartBadgeFound: cartBadge !== null,
    };
  });
  test
    .info()
    .annotations.push({ type: "bell", description: JSON.stringify(m1) });
  expect(m1.bell).toEqual({ w: 32, h: 32 });
  if (m1.cartBadgeFound) expect(m1.badge).toEqual(m1.cartBadge);
  expect(m1.badge?.height).toBe("16px");

  await openPanel(page);
  await expect(rows(page)).toHaveCount(20);
  await expect(bell(page)).toHaveAttribute("aria-expanded", "true");
  /* 마우스가 종 위에 있으면 hover 면이 덮는다. 열린 면만 보려고 치운다 */
  await page.mouse.move(5, 300);
  /* transition-colors 가 끝날 때까지(투명 → secondary 사이 값을 읽지 않게) */
  await expect
    .poll(() => bell(page).evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 3_000 })
    .not.toMatch(/\/ 0\.\d+\)$|rgba\(0, 0, 0, 0\)/);
  const m2 = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const probe = document.createElement("div");
    probe.style.boxShadow = "var(--shadow-dropdown)";
    document.body.append(probe);
    const dropdown = getComputedStyle(probe).boxShadow;
    probe.style.boxShadow = "var(--shadow-float)";
    const float = getComputedStyle(probe).boxShadow;
    probe.style.backgroundColor = "var(--color-secondary)";
    const secondary = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = "var(--color-primary)";
    const primary = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = "var(--color-accent)";
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const row = dialog.querySelector(
      '[data-id][data-unread="true"]',
    ) as HTMLElement;
    const readRow = dialog.querySelector(
      '[data-id][data-unread="false"]',
    ) as HTMLElement;
    const spans = (r: HTMLElement) =>
      [...r.children].map((c) => {
        const cs = getComputedStyle(c);
        return {
          size: cs.fontSize,
          weight: cs.fontWeight,
          color: cs.color,
          bg: cs.backgroundColor,
          w: c.getBoundingClientRect().width,
          clamp: cs.webkitLineClamp,
        };
      });
    const bellBtn = document.querySelector(
      'header button[aria-label^="알림"]',
    ) as HTMLElement;
    const title = dialog.querySelector("h2") as HTMLElement;
    return {
      width: dialog.getBoundingClientRect().width,
      right: Math.round(dialog.getBoundingClientRect().right),
      bellRight: Math.round(bellBtn.getBoundingClientRect().right),
      shadow: getComputedStyle(dialog).boxShadow,
      dropdown,
      float,
      openBellBg: getComputedStyle(bellBtn).backgroundColor,
      secondary,
      primary,
      accent,
      title: {
        size: getComputedStyle(title).fontSize,
        weight: getComputedStyle(title).fontWeight,
      },
      unread: spans(row),
      read: spans(readRow),
      rowH: row.getBoundingClientRect().height,
      raw: root.getPropertyValue("--shadow-dropdown").trim(),
    };
  });
  test
    .info()
    .annotations.push({ type: "panel", description: JSON.stringify(m2) });
  await page.screenshot({ path: `${SHOTS}/design-panel-1470.png` });
  expect(m2.width).toBe(360);
  expect(m2.right).toBe(m2.bellRight);
  /* Tailwind는 ring 자리 빈 그림자 4겹을 앞에 붙인다. 마지막 겹이 토큰 값이어야 한다 */
  expect(m2.shadow.endsWith(m2.dropdown)).toBe(true);
  expect(m2.shadow.endsWith(m2.float)).toBe(false);
  expect(m2.openBellBg).toBe(m2.secondary);
  expect(m2.title).toEqual({ size: "16px", weight: "500" });
  /* 점 8 primary, 제목 14 500(안 읽음)/400(읽음), 시각 12, 본문 두 줄 */
  const [dot, t, time, body] = m2.unread;
  expect(dot?.w).toBe(8);
  expect(dot?.bg).toBe(m2.primary);
  expect([t?.size, t?.weight]).toEqual(["14px", "500"]);
  expect(time?.size).toBe("12px");
  expect(body?.clamp).toBe("2");
  expect(m2.read[1]?.weight).toBe("400");
});

test("390 결정 50 53: 폰 폭 패널 행 ≥ 44, 새 알림 줄 accent 44 '새 알림 보기'(수 없음), 패널 높이 화면 안", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startNotify(page, "/");
  await openPanel(page);
  await expect(rows(page)).toHaveCount(20);
  await injectEta(page, plus(R, 10));
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await expect(newerButton(page)).toBeVisible();
  const m = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const newer = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "새 알림 보기",
    ) as HTMLElement;
    const rowHeights = [...dialog.querySelectorAll("[data-id]")].map((r) =>
      Math.round(r.getBoundingClientRect().height),
    );
    return {
      newerH: newer.getBoundingClientRect().height,
      newerBg: getComputedStyle(newer).backgroundColor,
      accent,
      minRowH: Math.min(...rowHeights),
      dialogBottom: dialog.getBoundingClientRect().bottom,
      dialogTop: dialog.getBoundingClientRect().top,
    };
  });
  test
    .info()
    .annotations.push({ type: "phone", description: JSON.stringify(m) });
  await page.screenshot({ path: `${SHOTS}/design-panel-newer-390.png` });
  expect(m.newerH).toBe(44);
  expect(m.newerBg).toBe(m.accent);
  expect(m.minRowH).toBeGreaterThanOrEqual(44);
  expect(m.dialogBottom).toBeLessThanOrEqual(844 - 16);
  await expect(markAllButton(page)).toBeVisible();
  await expect(rowById(page, 2022)).toBeVisible();
  await expect(bellBadge(page)).toHaveText("3");
});
