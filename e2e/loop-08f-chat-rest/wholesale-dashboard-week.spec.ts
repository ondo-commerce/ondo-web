import { expect, test, type Page } from "@playwright/test";
import {
  count,
  expectCard,
  inquiryCard,
  knob,
  openDetail,
  requests,
  settled,
  SHOWN,
  startAt,
  STATS_GET,
  statsLog,
  T_1159,
  todayRow,
  todayTotal,
  waitCount,
  watchStats,
  WEEK_GET,
  weekBar,
  weekFailed,
  weekLine,
  weekTotal,
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
 *
 * 2026-11-18 디자인에서 7일 줄은 문의 표의 둘째 줄(`최근 7일` 머리 칸 아래 기간, 소매 메시지 칸, 처리율 칸)이 됐다.
 * 글자는 `SHOWN`(innerText)으로 읽어 `최근 7일 10/22~10/28 13건 67% 판정 9건 중 6건`처럼 비교한다.
 */

/** 서울 10/29 11:00 — 영업일 10/28, 30초를 몇 번 넘겨도 기간 10/22~10/28 그대로 */
const T_1100 = new Date("2026-10-29T11:00:00+09:00");
const STATS_V1 = "stats-v1";
const WEEK_1028 = "최근 7일 10/22~10/28 13건 67% 판정 9건 중 6건";
/* 정규식엔 공백 정리가 안 걸려 칸 사이를 \s+로 쓴다 */
const WEEK_1028_ANY =
  /^최근 7일\s+10\/22~10\/28\s+\d+건\s+(\d+%|-)\s+판정 \d+건 중 \d+건$/;
const TODAY_1028 = {
  today: "오늘 12건 63% 판정 8건 중 5건",
  outcomes: [
    "자동 답 5건",
    "답+확인 1건",
    "넘김 2건",
    "되묻기 3건",
    "결과 없음 1건",
  ],
  intents: ["재고 4건", "미송 1건", "미수 1건", "기타 0건", "미분류 2건"],
  basis: "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
};

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
    await expectCard(page, TODAY_1028);
    await expect(weekLine(page)).toHaveText(WEEK_1028, SHOWN);
    await settled(page, WEEK_GET);

    /* 자리: 같은 표에서 `오늘` 줄 바로 아래(기준 줄은 표 뒤 상세 안) */
    await expect(inquiryCard(page).locator('tbody th[scope="row"]')).toHaveText(
      ["오늘", "최근 7일 10/22~10/28"],
      SHOWN,
    );

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
    await expect(todayRow(page)).toHaveCount(1);
    await expect(todayTotal(page)).toHaveText(/^\d+건$/);
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
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, SHOWN);
    await expect(weekFailed(page)).toHaveCount(0);
  });

  test("S3-3 ② 7일 성공 뒤 같은 범위 재조회 실패 → 옛 숫자 그대로, 실패 줄 0", async ({
    page,
  }) => {
    await startAt(page, T_1100, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, SHOWN);
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
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, SHOWN);
    await settled(page, WEEK_GET);
    await settled(page, STATS_GET);
    const before = Number(
      /^(\d+)건$/.exec(await weekTotal(page).innerText())?.[1],
    );
    const todayText = await todayTotal(page).textContent();

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
    await expect(weekTotal(page)).toHaveText(`${before + 1}건`);
    /* 오늘 숫자는 이전 값 그대로(카드 오류 아님), 7일 실패 줄 0 */
    await expect(todayTotal(page)).toHaveText(todayText ?? "missing");
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
    await expect(weekLine(page)).toHaveText(WEEK_1028, SHOWN);
    await settled(page, WEEK_GET);

    await knob(page, "fail", { op: "stats", range: "multi", status: 500 });
    await nextPoll(page, 60_000);
    const week = await requests(page, WEEK_GET);
    expect(week.map((r) => [searchOf(r.url), r.status])).toEqual([
      ["?from=2026-10-22&to=2026-10-28", 200],
      ["?from=2026-10-23&to=2026-10-29", 500],
    ]);
    await expect(todayTotal(page)).toHaveText("0건");
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
    await expect(todayRow(page)).toHaveCount(1);
    await expect(weekBar(page)).toHaveCount(1);
    await expect(weekLine(page)).toHaveCount(0);
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, {
      ...SHOWN,
      timeout: 8_000,
    });
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
    await expect(weekLine(page)).toHaveText(WEEK_1028_ANY, SHOWN);
    await settled(page, WEEK_GET);
    const before = Number(
      /^(\d+)건$/.exec(await weekTotal(page).innerText())?.[1],
    );
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
    await expect(weekTotal(page)).toHaveText(`${before}건`);

    await page.clock.fastForward(5_000);
    await expect(weekTotal(page)).toHaveText(`${before + 1}건`);
    expect(
      (await requests(page, WEEK_GET)).slice(week0).map((r) => r.status),
    ).toEqual([200]);
  });

  test("S3-5 12시 경계: 11:59:30 → 60초 polling → 오늘 응답 from 10/29, 7일 from=2026-10-23&to=2026-10-29, 기간 글자 (10/23~10/29), 옛 키 GET 0", async ({
    page,
  }) => {
    await watchStats(page);
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028, SHOWN);
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
    await expect(weekLine(page)).toContainText("최근 7일 10/23~10/29", SHOWN);
  });

  test("S3-5 탭 재진입(08f R6): 11:59:30 성공 → 주문 탭 → 60초 → 대시보드 → 7일 GET은 오늘 응답 뒤 새 범위 1회만, 옛 범위 0", async ({
    page,
  }) => {
    await watchStats(page);
    await startAt(page, T_1159, { seed: STATS_V1 });
    await expect(weekLine(page)).toHaveText(WEEK_1028, SHOWN);
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
    await expect(weekLine(page)).toContainText("최근 7일 10/23~10/29", SHOWN);
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

/**
 * S3-4 측정 하나. 7일 줄과 같은 표 `오늘` 줄 머리 칸의 계산값, 상자, 가로 넘침, 그리고 세로:
 * 카드 안 넘침(`scrollHeight − clientHeight`), 카드 아래가 화면 안인지, 7일 줄에서 가장 가까운 overflow-y auto/scroll 조상.
 * 옛 비교 대상 4줄(판정한 것 중)은 2026-11-18 디자인에서 접힌 상세로 들어가 표의 `오늘` 머리 칸과 비교한다
 */
function measureWeek(page: Page) {
  return inquiryCard(page).evaluate((card) => {
    const week = card.querySelector('td[data-ac~="08f:S3-2"]');
    const row = week?.closest("tr") ?? null;
    const today = card.querySelector('tbody th[scope="row"]');
    const style = (el: Element | null | undefined) => {
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
    /* 세로 스크롤을 받는 요소: 7일 줄에서 위로 올라가며 overflow-y가 auto/scroll인 첫 조상 */
    let scroller: Element | null = row?.parentElement ?? null;
    while (scroller && scroller !== document.documentElement) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    const found = scroller !== null && scroller !== document.documentElement;
    return {
      week: style(week),
      today: style(today),
      todayText: today?.textContent,
      weekBox: box(row),
      cardBox: box(card),
      weekOverflow: week ? week.scrollWidth - week.clientWidth : -1,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      docOverflowY: document.documentElement.scrollHeight - window.innerHeight,
      cardInnerOverflowY: card.scrollHeight - card.clientHeight,
      cardBottomPastViewport:
        card.getBoundingClientRect().bottom - window.innerHeight,
      scroller: found
        ? {
            overflowY: getComputedStyle(scroller as Element).overflowY,
            scrollHeight: (scroller as Element).scrollHeight,
            clientHeight: (scroller as Element).clientHeight,
          }
        : null,
    };
  });
}

/** 7일 줄이 막대(delay 1.5초) 뒤 도착할 때까지 */
async function openWeekWithBar(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await startAt(page, T_1159, {
    seed: STATS_V1,
    before: (p) => knob(p, "delay", { op: "stats", range: "multi", ms: 1_500 }),
  });
  await expect(weekBar(page)).toHaveCount(1);
  await expect(weekLine(page)).toHaveText(WEEK_1028, {
    ...SHOWN,
    timeout: 6_000,
  });
}

/*
 * 08f Q1: 예전엔 "넘치면 세로 스크롤"이 `if (넘침)` 안에 있어 두 폭 다 넘침이 없어 한 번도 안 돌았다.
 * 이제 AC 두 폭에서는 세로 단언을 조건 없이 둔다 — 카드 안 넘침 0, 카드 아래가 화면 안, 문서 세로 넘침 0.
 * 넘침이 실제로 나는 높이(1280×400) 시험은 아래에 따로 있다.
 * "막대 높이 = 줄 높이 ± 2"는 뺐다 — 2026-11-18 디자인의 막대는 h-4이고 7일 줄은 처리율 아래 판정 내역이 둘째 줄이다
 */
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`S3-4 ${viewport.width}: 7일 줄 글자 = 오늘 줄(크기, 줄 높이, 색), 패널 안, 가로 넘침 0, 카드 세로 넘침 0이고 화면 안`, async ({
    page,
  }) => {
    await openWeekWithBar(page, viewport);
    const m = await measureWeek(page);
    expect(m.todayText).toBe("오늘");
    expect(m.week).not.toBeNull();
    expect(m.week).toEqual(m.today);
    expect(m.weekBox?.left ?? -1).toBeGreaterThanOrEqual(m.cardBox?.left ?? 0);
    expect(m.weekBox?.right ?? Infinity).toBeLessThanOrEqual(
      m.cardBox?.right ?? 0,
    );
    expect(m.weekOverflow).toBeLessThanOrEqual(0);
    expect(m.docOverflow).toBeLessThanOrEqual(0);
    expect(m.docOverflowY).toBeLessThanOrEqual(0);
    expect(m.cardInnerOverflowY).toBeLessThanOrEqual(0);
    expect(m.cardBottomPastViewport).toBeLessThanOrEqual(0);
  });
}

/*
 * 08f Q1 원래 조건: 넘치면 `Panel.Body`가 세로로 받는다. 1280×400에서 문의 카드는 `shrink-0`(디자인 결정 49 —
 * 높이가 모자라면 주의 패널만 준다)이라 오른쪽 열 아래로 밀려나고 body `overflow: hidden`에 잘린다. 카드와 조상 중
 * overflow-y auto는 없다(QA 08f 측정과 같다). 시험만으로 고칠 수 없는 레이아웃이라 원래 조건을 test.fail로 남긴다
 * (brief-dev 규칙 7). 넘침이 실제로 났는지는 test.fail 앞에서 일반 단언으로 본다 — 넘침이 안 나면 일반 실패다
 */
test("S3-4 1280×400 원래 조건: 카드가 화면 아래로 넘치면 7일 줄 위 세로 스크롤 요소가 받는다", async ({
  page,
}) => {
  await openWeekWithBar(page, { width: 1280, height: 400 });
  /* 2026-11-18 디자인은 상세가 접혀 있어 카드가 짧다(접힌 채로는 화면 안). 펼쳐 카드가 가장 긴 상태로 잰다 */
  await openDetail(page);
  const m = await measureWeek(page);
  expect(m.cardBottomPastViewport, "넘침이 실제로 난다").toBeGreaterThan(0);
  expect(m.docOverflow).toBeLessThanOrEqual(0);

  test.fail(
    true,
    "08f Q1: 문의 카드가 shrink-0이라 낮은 화면에서 잘리고, 받는 스크롤 요소가 없다(레이아웃 결정 49, 시험 밖)",
  );
  expect(m.scroller, "7일 줄 위 세로 스크롤 요소").not.toBeNull();
  expect(["auto", "scroll"]).toContain(m.scroller?.overflowY);
  expect(m.scroller?.scrollHeight ?? 0).toBeGreaterThan(
    m.scroller?.clientHeight ?? Infinity,
  );
});
