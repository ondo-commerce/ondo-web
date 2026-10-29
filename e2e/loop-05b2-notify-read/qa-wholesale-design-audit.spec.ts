import { expect, test } from "@playwright/test";
import {
  bell,
  chatLink,
  markAllButton,
  moreButton,
  notify,
  openPanel,
  panel,
  rows,
  start,
} from "./helpers";

/**
 * QA loop-05b2-notify-read — 디자인 audit. 와이어프레임 `19_wholesale-notifications/_base.css`의 수치와
 * 디자인 결정 28~37을 getComputedStyle 로 잰다. 스크린샷은 `.claude/harness/runs/loop-05b2-notify-read/qa/`.
 */

const SHOTS = ".claude/harness/runs/loop-05b2-notify-read/qa";

for (const viewport of [
  { width: 1470, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`디자인 ${viewport.width} — 배지 알약, 패널 자리, 행 치수, 끝 행 가림`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page);
    await page.screenshot({ path: `${SHOTS}/badge-${viewport.width}.png` });

    /* 결정 29: 아이콘 오른쪽 위(top −3, right −5) primary 알약 h-4 text-xs, card 2px 고리 */
    const badge = await bell(page).evaluate((btn) => {
      const pill = btn.querySelector('[aria-hidden="true"][data-ac]');
      if (!(pill instanceof HTMLElement)) return null;
      const b = btn.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      const cs = getComputedStyle(pill);
      const root = getComputedStyle(document.documentElement);
      return {
        btn: Math.round(b.width),
        top: Math.round(p.top - b.top),
        right: Math.round(b.right - p.right),
        height: Math.round(p.height),
        fontSize: cs.fontSize,
        bg: cs.backgroundColor,
        primary: root.getPropertyValue("--color-primary").trim(),
        ring: cs.boxShadow,
      };
    });
    console.log("QA badge", viewport.width, JSON.stringify(badge));
    expect(badge).not.toBeNull();
    expect(badge?.btn).toBe(32);
    expect(badge?.top).toBe(-3);
    expect(badge?.right).toBe(-5);
    expect(badge?.height).toBe(16);
    expect(badge?.fontSize).toBe("12px");
    const chatPill = await chatLink(page).evaluate((a) => {
      const pill = a.querySelector('[aria-hidden="true"][data-ac]');
      const r = a.getBoundingClientRect();
      const p = pill?.getBoundingClientRect();
      return p
        ? {
            top: Math.round(p.top - r.top),
            right: Math.round(r.right - p.right),
            w: Math.round(r.width),
          }
        : null;
    });
    expect(chatPill).toEqual({ top: -3, right: -5, w: 32 });

    await openPanel(page);
    /* 색 전환(transition)이 끝난 뒤 잰다 */
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/panel-${viewport.width}.png` });

    /* 결정 28: 폭 360, 종 오른쪽 끝에 맞춤, 종 아래 6, 최대 높이 화면 − 70 */
    const place = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label^="알림"]');
      const dlg = document.querySelector('[role="dialog"]');
      if (!btn || !dlg) return null;
      const b = btn.getBoundingClientRect();
      const d = dlg.getBoundingClientRect();
      const cs = getComputedStyle(btn);
      return {
        width: Math.round(d.width),
        rightGap: Math.round(b.right - d.right),
        offset: Math.round(d.top - b.bottom),
        maxH: getComputedStyle(dlg).maxHeight,
        bottom: Math.round(d.bottom),
        openBg: cs.backgroundColor,
        secondary: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-secondary")
          .trim(),
        accent: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim(),
      };
    });
    console.log("QA place", viewport.width, JSON.stringify(place));
    expect(place?.width).toBe(360);
    expect(Math.abs(place?.rightGap ?? 99)).toBeLessThanOrEqual(1);
    /* sideOffset 6 + 반올림 1 */
    expect(Math.abs((place?.offset ?? 99) - 6)).toBeLessThanOrEqual(1);
    expect(place?.bottom ?? 9999).toBeLessThanOrEqual(viewport.height);

    /* 결정 30: 행 치수(와이어프레임 .nrow padding 10 12 10 8, 점 8, title 14, 시각 12, body 13) */
    const row = await rows(page)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        const kids = [...el.children].map((c) => {
          const s = getComputedStyle(c);
          return {
            fs: s.fontSize,
            fw: s.fontWeight,
            w: Math.round(c.getBoundingClientRect().width),
          };
        });
        return {
          padding: cs.padding,
          height: Math.round(el.getBoundingClientRect().height),
          radius: cs.borderRadius,
          kids,
        };
      });
    console.log("QA row", viewport.width, JSON.stringify(row));
    expect(row.kids[0]?.w).toBe(8);
    expect(row.kids[1]?.fs).toBe("14px");
    expect(row.kids[1]?.fw).toBe("500");
    expect(row.kids[2]?.fs).toBe("12px");
    expect(row.kids[3]?.fs).toBe("13px");

    /* 끝 행 가림: 더 보기로 25개 → 맨 아래로 → 마지막 행 중심이 그 행 */
    await moreButton(page).click();
    await expect(rows(page)).toHaveCount(25);
    const last = await panel(page)
      .locator(".overflow-y-auto")
      .evaluate((box) => {
        box.scrollTop = box.scrollHeight;
        const items = box.querySelectorAll("[data-id]");
        const el = items[items.length - 1] as HTMLElement;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return {
          hit: el === hit || el.contains(hit),
          bottom: Math.round(r.bottom),
          boxBottom: Math.round(box.getBoundingClientRect().bottom),
          pageScroll: document.documentElement.scrollHeight - innerHeight,
          wide: document.documentElement.scrollWidth - innerWidth,
        };
      });
    console.log("QA last", viewport.width, JSON.stringify(last));
    expect(last.hit).toBe(true);
    expect(last.bottom).toBeLessThanOrEqual(last.boxBottom);
    expect(last.pageScroll).toBe(0);
    expect(last.wide).toBe(0);
    await page.screenshot({
      path: `${SHOTS}/panel-bottom-${viewport.width}.png`,
    });
  });
}

test("디자인 — 409 안내와 모두 읽음 500 오류 한 줄의 색, 크기", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await markAllButton(page).click();
  const notice = panel(page).getByRole("status");
  await expect(notice).toBeVisible();
  const n = await notice.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      padding: cs.padding,
      fs: cs.fontSize,
    };
  });
  console.log("QA notice", JSON.stringify(n));
  await page.screenshot({ path: `${SHOTS}/panel-409-1470.png` });

  await notify(page, "fail", { op: "read", status: 500 });
  await markAllButton(page).click();
  const err = panel(page).getByRole("alert");
  await expect(err).toBeVisible();
  const e = await err.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, fs: cs.fontSize };
  });
  console.log("QA markFailed", JSON.stringify(e));
  await page.screenshot({ path: `${SHOTS}/panel-500-1470.png` });
});
