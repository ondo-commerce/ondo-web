import { expect, test, type Page } from "@playwright/test";
import {
  cardLines,
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
 * loop-08f #373 S3 도매 대시보드 문의 카드 `최근 7일` 줄(01-plan §4-4, §6 S3-2~S3-5).
 *
 * 7일 쿼리는 오늘 응답의 `from`(기준 영업일)에서 6일 앞까지, 오늘 쿼리가 끝날 때마다 한 번 다시 부른다.
 * 손잡이는 #371의 `fail/delay {op: "stats", range: "today" | "multi"}`. 로그인 화면에서 걸면 첫 요청부터 먹는다.
 *
 * 시각: 숫자를 정확히 보는 시험(S3-2, S3-4)은 기획 값 그대로 10/29 11:59:30. 30초 polling을 **같은 기간으로**
 * 한 번 이상 돌려야 하는 시험(S3-3 ① ② ⑤)은 10/29 11:00 — 11:59:30에서 30초를 넘기면 낮 12시를 넘어
 * 기간이 바뀐다. 11:00이면 F12(11:59)가 아직 없어 숫자가 기획 값과 달라 기간 글자와 모양만 본다.
 */

/** 서울 10/29 11:00 — 영업일 10/28, 30초를 몇 번 넘겨도 기간 10/22~10/28 그대로 */
const T_1100 = new Date("2026-10-29T11:00:00+09:00");
const STATS_V1 = "stats-v1";
const WEEK_1028 =
  "최근 7일(10/22~10/28) 소매 메시지 13건, 자동으로 끝남 67% (6/판정 9)";
const WEEK_1028_ANY =
  /^최근 7일\(10\/22~10\/28\) 소매 메시지 \d+건, 자동으로 끝남 (\d+%|-) \(\d+\/판정 \d+\)$/;
const TODAY_1028 = [
  "오늘 소매 메시지 12건",
  "자동 답 5, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1",
  "자동으로 끝남 63% (5/판정 8)",
  "판정한 것 중 재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
  "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
];

function searchOf(url: string | undefined): string {
  return new URL(url ?? "http://x/?missing", "http://x").search;
}

/** 다음 30초 polling: 오늘 GET 하나와 그 뒤 7일 GET 하나가 응답까지 */
async function nextPoll(page: Page, ms = 30_000): Promise<void> {
  const today = await count(page, STATS_GET);
  const week = await count(page, WEEK_GET);
  await page.clock.fastForward(ms);
  await waitCount(page, STATS_GET, today + 1);
  await waitCount(page, WEEK_GET, week + 1);
  await settled(page, STATS_GET);
  await settled(page, WEEK_GET);
}

test.describe("1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("S3-2 stats-v1 11:59:30 → 오늘 줄 그대로, 4줄 아래 7일 줄 글자 정확히, 오늘 GET 1 + 7일 GET 1(오늘 응답 뒤)", async ({
    page,
  }) => {
    await watchStats(page);
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(cardLines(page)).toHaveText(TODAY_1028);
    await expect(weekLine(page)).toHaveText(WEEK_1028);
    await settled(page, WEEK_GET);

    /* 자리: 4줄(판정한 것 중) 바로 다음, 기준 줄 바로 앞 */
    const order = await inquiryCard(page).evaluate((card) =>
      [...card.querySelectorAll("p")].map((p) => p.getAttribute("data-ac")),
    );
    expect(order).toEqual([
      "S2-1 S2-3 S2-4",
      "S2-1 S2-4",
      "S2-1 S2-2 S2-4",
      "S2-1 S2-4",
      "08f:S3-2",
      "S2-6",
    ]);

    const today = await requests(page, STATS_GET);
    const week = await requests(page, WEEK_GET);
    expect(today.map((r) => searchOf(r.url))).toEqual([""]);
    expect(week.map((r) => searchOf(r.url))).toEqual([
      "?from=2026-10-22&to=2026-10-28",
    ]);
    /* 7일 요청 시작이 오늘 응답 끝 뒤 */
    const log = await statsLog(page);
    const todayEnd = log.findIndex((e) => e.phase === "end" && e.search === "");
    const weekStart = log.findIndex(
      (e) => e.phase === "start" && e.search !== "",
    );
    expect(todayEnd).toBeGreaterThanOrEqual(0);
    expect(weekStart).toBeGreaterThan(todayEnd);
    expect(log.find((e) => e.phase === "end" && e.search === "")?.from).toBe(
      "2026-10-28",
    );
  });

  test("S3-3 ① 7일 최초 실패 → 오늘 숫자 그대로, 실패 한 줄(버튼 0), 같은 주기 7일 GET 1(재시도 0), 30초 뒤 1 더 → 줄 정상", async ({
    page,
  }) => {
    await startAt(page, T_1100, {
      seed: STATS_V1,
      before: (p) =>
        knob(p, "fail", { op: "stats", range: "multi", status: 500 }),
    });
    await expect(weekFailed(page)).toHaveText(
      "최근 7일 숫자를 불러오지 못했어요",
    );
    await expect(cardLines(page)).toHaveCount(5);
    await expect(cardLines(page).nth(0)).toHaveText(/^오늘 소매 메시지 \d+건$/);
    await expect(weekLine(page)).toHaveCount(0);
    await expect(weekBar(page)).toHaveCount(0);
    /* 카드의 버튼은 0 — 실패 줄에 다시 시도가 없다 */
    await expect(inquiryCard(page).getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

    /* 앱 기본 5xx 재시도는 1초, 2초 뒤다. 5초를 당겨도 7일 GET은 1 */
    await settled(page, WEEK_GET);
    await page.clock.fastForward(5_000);
    await settled(page, WEEK_GET);
    expect((await requests(page, WEEK_GET)).map((r) => r.status)).toEqual([
      500,
    ]);

    await nextPoll(page);
    expect((await requests(page, WEEK_GET)).map((r) => r.status)).toEqual([
      500, 200,
    ]);
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY);
    await expect(weekFailed(page)).toHaveCount(0);
  });

  test("S3-3 ② 7일 성공 뒤 같은 범위 재조회 실패 → 옛 숫자 그대로, 실패 줄 0", async ({
    page,
  }) => {
    await startAt(page, T_1100, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY);
    await settled(page, WEEK_GET);
    const before = await weekLine(page).textContent();

    await knob(page, "fail", { op: "stats", range: "multi", status: 500 });
    await nextPoll(page);
    const week = await requests(page, WEEK_GET);
    expect(week.map((r) => [searchOf(r.url), r.status])).toEqual([
      ["?from=2026-10-22&to=2026-10-28", 200],
      ["?from=2026-10-22&to=2026-10-28", 500],
    ]);
    await expect(weekLine(page)).toHaveText(before ?? "missing");
    await expect(weekFailed(page)).toHaveCount(0);
    await expect(weekBar(page)).toHaveCount(0);
  });

  test("S3-3 ②-b(표 2행, 08f R8) 오늘, 7일 성공 뒤 오늘만 재조회 실패 → 이전 기간으로 7일 GET 1, 숫자 갱신", async ({
    page,
  }) => {
    await startAt(page, T_1100, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY);
    await settled(page, WEEK_GET);
    await settled(page, STATS_GET);
    const weekTotal = async () =>
      Number(
        /소매 메시지 (\d+)건/.exec(
          (await weekLine(page).textContent()) ?? "",
        )?.[1] ?? NaN,
      );
    const before = await weekTotal();
    const todayText = await cardLines(page).nth(0).textContent();

    /* 새 소매 메시지 1건 → 다음 7일 응답이 +1. 오늘은 앱 기본 5xx 재시도까지 셋 다 실패 */
    await knob(page, "rooms/1/incoming", { body: "오늘 실패 중 7일 갱신" });
    await knob(page, "fail", {
      op: "stats",
      range: "today",
      status: 500,
      times: 3,
    });
    const today0 = await count(page, STATS_GET);
    const week0 = await count(page, WEEK_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, STATS_GET, today0 + 1);
    await page.clock.fastForward(1_000);
    await waitCount(page, STATS_GET, today0 + 2);
    await page.clock.fastForward(2_000);
    await waitCount(page, STATS_GET, today0 + 3);
    await settled(page, STATS_GET);
    expect(
      (await requests(page, STATS_GET)).slice(today0).map((r) => r.status),
    ).toEqual([500, 500, 500]);

    /* 오늘이 실패로 끝나도 7일은 이전 기준 영업일 기간으로 한 번 */
    await waitCount(page, WEEK_GET, week0 + 1);
    await settled(page, WEEK_GET);
    expect(
      (await requests(page, WEEK_GET))
        .slice(week0)
        .map((r) => [searchOf(r.url), r.status]),
    ).toEqual([["?from=2026-10-22&to=2026-10-28", 200]]);
    await expect(weekLine(page)).toHaveText(
      new RegExp(`소매 메시지 ${before + 1}건`),
    );
    /* 오늘 숫자는 이전 값 그대로(카드 오류 아님), 7일 실패 줄 0 */
    await expect(cardLines(page).nth(0)).toHaveText(todayText ?? "missing");
    await expect(weekFailed(page)).toHaveCount(0);
  });

  test("S3-3 ③ 오늘 최초 실패 → 카드 기존 오류, 7일 GET 0", async ({
    page,
  }) => {
    await startAt(page, T_1159, {
      seed: STATS_V1,
      /* 오늘은 앱 기본 5xx 재시도가 두 번 더 부른다 — 셋 다 실패해야 카드가 오류를 그린다 */
      before: (p) =>
        knob(p, "fail", {
          op: "stats",
          range: "today",
          status: 500,
          times: 3,
        }),
    });
    await expect(inquiryCard(page).getByRole("alert")).toContainText(
      "문의 숫자를 불러오지 못했어요",
    );
    await settled(page, STATS_GET);
    expect(await count(page, STATS_GET)).toBe(3);
    expect(await count(page, WEEK_GET)).toBe(0);
    await expect(weekLine(page)).toHaveCount(0);
    await expect(weekFailed(page)).toHaveCount(0);
    await expect(weekBar(page)).toHaveCount(0);
  });

  test("S3-3 ④ 범위 교체 중 실패: 11:59:30 성공 → 12:00:30 새 범위만 실패 → 옛 범위 숫자 0, 실패 한 줄", async ({
    page,
  }) => {
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028);
    await settled(page, WEEK_GET);

    await knob(page, "fail", { op: "stats", range: "multi", status: 500 });
    await nextPoll(page, 60_000);
    const week = await requests(page, WEEK_GET);
    expect(week.map((r) => [searchOf(r.url), r.status])).toEqual([
      ["?from=2026-10-22&to=2026-10-28", 200],
      ["?from=2026-10-23&to=2026-10-29", 500],
    ]);
    await expect(cardLines(page).nth(0)).toHaveText("오늘 소매 메시지 0건");
    await expect(weekFailed(page)).toHaveText(
      "최근 7일 숫자를 불러오지 못했어요",
    );
    await expect(weekLine(page)).toHaveCount(0);
    await expect(inquiryCard(page)).not.toContainText("10/22~10/28");
    await expect(inquiryCard(page)).not.toContainText("13건");
  });

  test("S3-3 ⑤ 7일 최초 로딩 중 막대 한 줄, 같은 범위 재조회 중 막대 0 숫자 그대로", async ({
    page,
  }) => {
    await startAt(page, T_1100, {
      seed: STATS_V1,
      before: (p) =>
        knob(p, "delay", { op: "stats", range: "multi", ms: 3_000 }),
    });
    /* 오늘 숫자가 먼저 오고 7일 자리는 막대 */
    await expect(cardLines(page)).toHaveCount(5);
    await expect(weekBar(page)).toHaveCount(1);
    await expect(weekLine(page)).toHaveCount(0);
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, { timeout: 8_000 });
    await expect(weekBar(page)).toHaveCount(0);
    await settled(page, WEEK_GET);
    const before = await weekLine(page).textContent();

    await knob(page, "delay", { op: "stats", range: "multi", ms: 3_000 });
    const week = await count(page, WEEK_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, WEEK_GET, week + 1);
    /* 늦는 7일 응답이 아직 안 왔다 — 그동안 막대 0, 숫자 그대로 */
    expect((await requests(page, WEEK_GET)).at(-1)?.status).toBeNull();
    await expect(weekBar(page)).toHaveCount(0);
    await expect(weekLine(page)).toHaveText(before ?? "missing");
    await settled(page, WEEK_GET);
    expect((await requests(page, WEEK_GET)).at(-1)?.status).toBe(200);
    await expect(weekBar(page)).toHaveCount(0);
  });

  test("S3-3 ⑥ 7일 응답이 30초보다 느려도(08f R7, delay 35초 계속) 진행 중 요청을 끊지 않고 도착하면 숫자가 바뀐다", async ({
    page,
  }) => {
    await startAt(page, T_1100, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY);
    await settled(page, WEEK_GET);
    const weekTotal = async () =>
      Number(
        /소매 메시지 (\d+)건/.exec(
          (await weekLine(page).textContent()) ?? "",
        )?.[1] ?? NaN,
      );
    const before = await weekTotal();
    expect(before).toBeGreaterThan(0);

    /* 새 소매 메시지 1건(10/29 11:00 = 영업일 10/28 안). 목은 요청 시점 값을 돌려주니 다음 7일 응답이 +1이다 */
    await knob(page, "rooms/1/incoming", { body: "7일 줄 갱신 확인" });
    /* 7일 응답마다 35초 — 오늘 polling(30초)보다 느리다. 기본 refetch면 30초마다 취소, 재시작이 반복된다 */
    await knob(page, "delay", {
      op: "stats",
      range: "multi",
      ms: 35_000,
      times: 100,
    });
    const week0 = await count(page, WEEK_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, WEEK_GET, week0 + 1);
    const today1 = await count(page, STATS_GET);
    await page.clock.fastForward(30_000);
    await waitCount(page, STATS_GET, today1 + 1);
    await settled(page, STATS_GET);
    /* 두 번째 오늘 응답 뒤에도 7일 요청은 처음 것 하나 그대로(끊고 다시 보내지 않았다) */
    expect(await count(page, WEEK_GET)).toBe(week0 + 1);
    await expect(weekLine(page)).toHaveText(
      new RegExp(`소매 메시지 ${before}건`),
    );

    await page.clock.fastForward(5_000);
    await expect(weekLine(page)).toHaveText(
      new RegExp(`소매 메시지 ${before + 1}건`),
    );
    expect(
      (await requests(page, WEEK_GET)).slice(week0).map((r) => r.status),
    ).toEqual([200]);
  });

  test("S3-5 12시 경계: 11:59:30 → 60초 polling → 오늘 응답 from 10/29, 7일 from=2026-10-23&to=2026-10-29, 기간 글자 (10/23~10/29), 옛 키 GET 0", async ({
    page,
  }) => {
    await watchStats(page);
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028);
    await settled(page, WEEK_GET);
    const oldKey = "?from=2026-10-22&to=2026-10-28";
    const oldBefore = (await requests(page, WEEK_GET)).filter(
      (r) => searchOf(r.url) === oldKey,
    ).length;
    expect(oldBefore).toBe(1);
    const logBefore = (await statsLog(page)).length;

    await nextPoll(page, 60_000);
    const after = (await statsLog(page)).slice(logBefore);
    expect(after.find((e) => e.phase === "end" && e.search === "")?.from).toBe(
      "2026-10-29",
    );
    const week = await requests(page, WEEK_GET);
    expect(week.map((r) => searchOf(r.url))).toEqual([
      oldKey,
      "?from=2026-10-23&to=2026-10-29",
    ]);
    /* 옛 키는 경계를 넘은 뒤 한 번도 안 나갔다 */
    expect(
      after.filter((e) => e.phase === "start" && e.search === oldKey),
    ).toEqual([]);
    await expect(weekLine(page)).toContainText("최근 7일(10/23~10/29)");
  });

  test("S3-5 탭 재진입(08f R6): 11:59:30 성공 → 주문 탭 → 60초 → 대시보드 → 7일 GET은 오늘 응답 뒤 새 범위 1회만, 옛 범위 0", async ({
    page,
  }) => {
    await watchStats(page);
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028);
    await settled(page, WEEK_GET);
    await settled(page, STATS_GET);
    const logBefore = (await statsLog(page)).length;

    await page.getByRole("link", { name: "주문", exact: true }).first().click();
    await page.waitForURL(/\/orders/);
    await page.clock.fastForward(60_000);
    await page
      .getByRole("link", { name: "대시보드", exact: true })
      .first()
      .click();
    await page.waitForURL(/\/dashboard/);
    await expect(weekLine(page)).toContainText("최근 7일(10/23~10/29)");
    await settled(page, STATS_GET);
    await settled(page, WEEK_GET);

    const after = (await statsLog(page)).slice(logBefore);
    const weekStarts = after.filter(
      (e) => e.phase === "start" && e.search !== "",
    );
    expect(weekStarts.map((e) => e.search)).toEqual([
      "?from=2026-10-23&to=2026-10-29",
    ]);
    /* 그 한 번은 오늘 응답(from 10/29)이 끝난 뒤 */
    const todayEnd = after.findIndex(
      (e) => e.phase === "end" && e.search === "" && e.from === "2026-10-29",
    );
    expect(todayEnd).toBeGreaterThanOrEqual(0);
    expect(
      after.indexOf(weekStarts[0] as (typeof after)[number]),
    ).toBeGreaterThan(todayEnd);
  });
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`S3-4 ${viewport.width}: 7일 줄 글자 = 4줄(크기, 줄 높이, 색), 패널 안, 가로 넘침 0, 넘치면 패널 세로 스크롤, 막대 높이 = 줄 높이 ± 2`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAt(page, T_1159, {
      seed: STATS_V1,
      before: (p) =>
        knob(p, "delay", { op: "stats", range: "multi", ms: 1_500 }),
    });
    await expect(weekBar(page)).toHaveCount(1);
    const barHeight = (await weekBar(page).boundingBox())?.height ?? -1;
    await expect(weekLine(page)).toHaveText(WEEK_1028, { timeout: 6_000 });

    const m = await inquiryCard(page).evaluate((card) => {
      const week = card.querySelector('p[data-ac~="08f:S3-2"]');
      const ps = [...card.querySelectorAll("p")];
      const intent = ps[ps.indexOf(week as HTMLParagraphElement) - 1];
      const style = (el: Element | undefined) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          color: s.color,
        };
      };
      const box = (el: Element | null | undefined) => {
        const b = el?.getBoundingClientRect();
        return b && { left: b.left, right: b.right, height: b.height };
      };
      return {
        week: style(week ?? undefined),
        intent: style(intent),
        intentText: intent?.textContent,
        weekBox: box(week),
        cardBox: box(card),
        weekOverflow: week ? week.scrollWidth - week.clientWidth : -1,
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        cardScroll: card.scrollHeight > card.clientHeight,
        cardOverflowY: getComputedStyle(card).overflowY,
      };
    });
    expect(m.intentText).toMatch(/^판정한 것 중/);
    expect(m.week).not.toBeNull();
    expect(m.week).toEqual(m.intent);
    expect(m.weekBox?.left ?? -1).toBeGreaterThanOrEqual(m.cardBox?.left ?? 0);
    expect(m.weekBox?.right ?? Infinity).toBeLessThanOrEqual(
      m.cardBox?.right ?? 0,
    );
    expect(m.weekOverflow).toBeLessThanOrEqual(0);
    expect(m.docOverflow).toBeLessThanOrEqual(0);
    if (m.cardScroll) expect(["auto", "scroll"]).toContain(m.cardOverflowY);
    const lineHeight = m.weekBox?.height ?? -100;
    expect(Math.abs(barHeight - lineHeight)).toBeLessThanOrEqual(2);
  });
}
