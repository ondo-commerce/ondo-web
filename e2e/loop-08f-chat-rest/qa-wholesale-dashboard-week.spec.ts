import { expect, test, type Page } from "@playwright/test";
import {
  count,
  inquiryCard,
  knob,
  requests,
  settled,
  startAt,
  STATS_GET,
  statsLog,
  T_1159,
  waitCount,
  watchStats,
  WEEK_GET,
  weekBar,
  weekFailed,
  weekLine,
} from "./helpers";

/**
 * 08f QA 재현 spec, #382에서 회귀 시험으로 커밋.
 *
 * loop-08f QA — #373 대시보드 문의 카드 최근 7일 줄. 기본 설정 wholesale(3100, MSW).
 *
 * 1. 1280, 1470: 로딩 막대, 정상 줄, 12시 경계 뒤 줄, 7일 최초 실패 한 줄 — 스크린샷과 계산값
 * 2. Codex R6 회귀: 11:59:30 성공 → 다른 탭 → 12:00을 넘김 → 대시보드로 돌아옴 → 옛 기간(10/22~10/28) GET 0
 *    (S3-5 "경계 뒤 옛 키 GET 0"). QA 때는 옛 기간 GET이 먼저 나갔다
 *
 * 스크린샷은 `.claude/harness/runs/loop-08f-chat-rest/qa/`.
 */

const SHOT = ".claude/harness/runs/loop-08f-chat-rest/qa";
const OLD_KEY = "?from=2026-10-22&to=2026-10-28";
const NEW_KEY = "?from=2026-10-23&to=2026-10-29";

function searchOf(url: string | undefined): string {
  return new URL(url ?? "http://x/?missing", "http://x").search;
}

async function poll(page: Page, ms: number): Promise<void> {
  const today = await count(page, STATS_GET);
  const week = await count(page, WEEK_GET);
  await page.clock.fastForward(ms);
  await waitCount(page, STATS_GET, today + 1);
  await waitCount(page, WEEK_GET, week + 1);
  await settled(page, STATS_GET);
  await settled(page, WEEK_GET);
}

/** 7일 줄 자리 요소 하나의 계산값(4줄과 비교용으로 바로 위 `<p>`도) */
async function measure(page: Page) {
  return inquiryCard(page).evaluate((card) => {
    const target =
      card.querySelector('[data-ac~="08f:S3-2"]') ??
      card.querySelector('[data-ac~="08f:S3-3"]');
    const ps = [...card.querySelectorAll("p")];
    const intent = ps.find((p) => p.textContent?.startsWith("판정한 것 중"));
    const s = (el: Element | null | undefined) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        ac: el.getAttribute("data-ac"),
        text: el.textContent,
        fontSize: c.fontSize,
        lineHeight: c.lineHeight,
        color: c.color,
        background: c.backgroundColor,
        radius: c.borderRadius,
        height: Math.round(b.height * 10) / 10,
        width: Math.round(b.width),
        overflow: el.scrollWidth - el.clientWidth,
      };
    };
    /* 카드 안 세로 스크롤을 받는 요소(Panel.Body 후보): overflow-y가 auto/scroll인 가장 가까운 조상 */
    let scroller: Element | null = target;
    while (scroller && scroller !== card.parentElement) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    return {
      target: s(target),
      intent: s(intent),
      cardScrolls: card.scrollHeight > card.clientHeight,
      cardOverflowY: getComputedStyle(card).overflowY,
      scroller:
        scroller && scroller !== card.parentElement
          ? {
              tag: scroller.tagName,
              overflowY: getComputedStyle(scroller).overflowY,
              scrollHeight: scroller.scrollHeight,
              clientHeight: scroller.clientHeight,
            }
          : null,
      docOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`QA 08f-3 ${viewport.width} 7일 줄: 로딩 막대 → 줄 → 12시 경계 뒤 새 기간, 스크린샷과 계산값`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await watchStats(page);
    await startAt(page, T_1159, {
      seed: "stats-v1",
      before: (p) =>
        knob(p, "delay", { op: "stats", range: "multi", ms: 3_000 }),
    });
    await expect(weekBar(page)).toHaveCount(1);
    const loading = await measure(page);
    await inquiryCard(page).screenshot({
      path: `${SHOT}/b4-week-loading-${viewport.width}.png`,
    });
    await expect(weekLine(page)).toHaveText(
      "최근 7일(10/22~10/28) 소매 메시지 13건, 자동으로 끝남 67% (6/판정 9)",
      { timeout: 8_000 },
    );
    await settled(page, WEEK_GET);
    const line = await measure(page);
    await inquiryCard(page).screenshot({
      path: `${SHOT}/b4-week-line-${viewport.width}.png`,
    });

    await poll(page, 60_000);
    await expect(weekLine(page)).toContainText("최근 7일(10/23~10/29)");
    const after = await measure(page);
    await inquiryCard(page).screenshot({
      path: `${SHOT}/b4-week-boundary-${viewport.width}.png`,
    });
    test.info().annotations.push({
      type: "7일 줄 실측",
      description: JSON.stringify({ loading, line, after }),
    });
    expect(line.target?.fontSize).toBe(line.intent?.fontSize);
    expect(line.target?.color).toBe(line.intent?.color);
    expect(line.target?.overflow ?? 1).toBeLessThanOrEqual(0);
    expect(line.docOverflow).toBeLessThanOrEqual(0);
    expect(
      Math.abs((loading.target?.height ?? 0) - (line.target?.height ?? 99)),
    ).toBeLessThanOrEqual(2);
    /* 경계 뒤 7일 요청은 새 기간 하나 */
    const week = (await requests(page, WEEK_GET)).map((r) => searchOf(r.url));
    expect(week).toEqual([OLD_KEY, NEW_KEY]);
  });

  test(`QA 08f-3 ${viewport.width} 7일 최초 실패 한 줄 스크린샷(muted, 버튼 0)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAt(page, T_1159, {
      seed: "stats-v1",
      before: (p) =>
        knob(p, "fail", { op: "stats", range: "multi", status: 500 }),
    });
    await expect(weekFailed(page)).toHaveText(
      "최근 7일 숫자를 불러오지 못했어요",
    );
    await settled(page, WEEK_GET);
    const m = await measure(page);
    await inquiryCard(page).screenshot({
      path: `${SHOT}/b4-week-failed-${viewport.width}.png`,
    });
    test.info().annotations.push({
      type: "실패 줄 실측",
      description: JSON.stringify(m),
    });
    /* 실패 줄은 4줄과 크기는 같고 색만 muted */
    expect(m.target?.fontSize).toBe(m.intent?.fontSize);
    expect(m.target?.color).not.toBe(m.intent?.color);
    await expect(inquiryCard(page).getByRole("button")).toHaveCount(0);
  });
}

test("QA 08f-R6 1280 탭 재진입: 11:59:30 성공 → 주문 탭 → 12:00을 넘김 → 대시보드 → 옛 기간 GET 0이어야 한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await watchStats(page);
  await startAt(page, T_1159, { seed: "stats-v1" });
  await expect(weekLine(page)).toContainText("최근 7일(10/22~10/28)");
  await settled(page, WEEK_GET);
  await settled(page, STATS_GET);
  const logBefore = (await statsLog(page)).length;

  await page.getByRole("link", { name: "주문", exact: true }).first().click();
  await page.waitForURL(/\/orders/);
  await page.clock.fastForward(60_000);
  const todayBefore = await count(page, STATS_GET);
  await page
    .getByRole("link", { name: "대시보드", exact: true })
    .first()
    .click();
  await page.waitForURL(/\/dashboard/);
  await waitCount(page, STATS_GET, todayBefore + 1);
  await settled(page, STATS_GET);
  await expect(weekLine(page)).toContainText("최근 7일(10/23~10/29)");
  await settled(page, WEEK_GET);

  const after = (await statsLog(page)).slice(logBefore);
  const starts = after
    .filter((e) => e.phase === "start")
    .map((e) => e.search || "(오늘)");
  test.info().annotations.push({
    type: "R6 재진입 뒤 stats 시작 순서",
    description: JSON.stringify(starts),
  });
  await page.screenshot({ path: `${SHOT}/r6-reentry-1280.png` });
  expect(starts.filter((s) => s === OLD_KEY)).toEqual([]);
});
