import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bubbles,
  cardLines,
  composer,
  count,
  inquiryCard,
  installClock,
  knob,
  log,
  login,
  MESSAGES_GET,
  openChats,
  settled,
  startAt,
  STATS_GET,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * loop-08 QA(도매). 기본 설정 wholesale 프로젝트(3100, MSW, mock 모드). 개발 spec과 겹치지 않는 경우만 둔다.
 *
 * - 사장 시나리오 (a) 카드 숫자를 기획 §5-4 2 fixture 표에서 손으로 센 값과 대조, 그리고 **polling 중** 낮 12시를 넘는 순간
 * - 증빙 문서(`runs/loop-08-chat-polish/qa/stats-evidence.md`)의 원본 JSON이 op가 실제로 내는 값과 같은가
 * - 사장 시나리오 (d) 숫자를 그린 뒤 polling이 실패해도 카드는 앞 숫자 그대로, 다른 칸도 그대로
 * - 사장 시나리오 (b) 연달아 보낸 내 글 중 맨 아래 하나에만 `읽음`
 * - 디자인 audit: 카드와 `오늘` 패널의 토큰, 읽음 색 = secondary-foreground
 *
 * 손으로 센 값(기획 §5-4 2 표, 10/28 영업일 = F1~F12): 자동 답 F1 F5 F8 F11 F12 = 5, 답+확인 F2 = 1, 넘김 F3 F6 = 2,
 * 되묻기 F7 F9 F10 = 3, 결과 없음 F4 = 1, 합 12. 재고 판정 F1 F2 F8 F12 = 4, 미분류 F3 F6 = 2. 판정 8, 5/8 = 62.5 → 63%.
 * 10/27 영업일 = F16 하나(재고 자동 답). 이틀 합 13, 자동 답 6, 판정 9, 6/9 → 67%.
 */

const QA_DIR = ".claude/harness/runs/loop-08-chat-polish/qa";
const STATS_V1 = "stats-v1";

/** 증빙 문서 예시 JSON 의 `data`(asOf 제외 — 요청 시각이라 흐르는 시계에선 초가 다르다) */
const EVIDENCE_TOTAL = {
  retailMessages: 13,
  autoReplied: 6,
  autoRepliedWithHandoff: 1,
  handedOff: 2,
  clarified: 3,
  noResult: 1,
  byIntent: {
    STOCK: { judged: 5, autoReplied: 4 },
    BACKORDER: { judged: 1, autoReplied: 1 },
    RECEIVABLE: { judged: 1, autoReplied: 1 },
    OTHER: { judged: 0, autoReplied: 0 },
    UNCLASSIFIED: { judged: 2, autoReplied: 0 },
  },
};

async function getJson(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (p) => {
    const token = window.localStorage.getItem("accessToken");
    const r = await fetch(p, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    return { status: r.status, body: (await r.json()) as unknown };
  }, path);
}

test("QA-a1 카드 숫자 = 손으로 센 값, 증빙 JSON = op 실제 응답(이틀 13건)", async ({
  page,
}) => {
  await startAt(page, new Date("2026-10-29T11:59:30+09:00"), {
    seed: STATS_V1,
  });
  await expect(cardLines(page)).toHaveText([
    "오늘 소매 메시지 12건",
    "자동 답 5, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1",
    "자동으로 끝남 63% (5/판정 8)",
    "판정한 것 중 재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
    "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
  ]);
  await page.screenshot({ path: `${QA_DIR}/qa-w-card-1470.png` });

  /* 증빙 예시와 같은 조건의 요청. 앱이 같은 문서에서 부르는 경로 그대로(MSW) */
  const res = (await getJson(
    page,
    "/api/wholesale/chat/inquiry-stats?from=2026-10-27&to=2026-10-28",
  )) as {
    status: number;
    body: {
      data: {
        from: string;
        to: string;
        startAt: string;
        endAt: string;
        asOf: string;
        total: unknown;
        days: { date: string; counts: { retailMessages: number } }[];
      };
    };
  };
  expect(res.status).toBe(200);
  const d = res.body.data;
  expect(d.from).toBe("2026-10-27");
  expect(d.to).toBe("2026-10-28");
  expect(d.startAt).toBe("2026-10-27T12:00:00+09:00");
  expect(d.endAt).toBe("2026-10-29T12:00:00+09:00");
  expect(d.asOf).toMatch(/^2026-10-29T11:59:\d\d(\.\d+)?\+09:00$/);
  expect(d.total).toEqual(EVIDENCE_TOTAL);
  expect(d.days.map((x) => [x.date, x.counts.retailMessages])).toEqual([
    ["2026-10-27", 1],
    ["2026-10-28", 12],
  ]);
});

test("QA-a2 polling 중 낮 12시를 넘으면 카드가 새 영업일(0건)로 바뀐다", async ({
  page,
}) => {
  await startAt(page, new Date("2026-10-29T11:59:40+09:00"), {
    seed: STATS_V1,
  });
  await expect(cardLines(page).nth(0)).toHaveText("오늘 소매 메시지 12건");
  await expect(cardLines(page).nth(4)).toContainText("11:59 기준");
  await settled(page, STATS_GET);
  const before = await count(page, STATS_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, STATS_GET, before + 1);
  await settled(page, STATS_GET);
  await expect(cardLines(page)).toHaveText([
    "오늘 소매 메시지 0건",
    "자동 답 0, 답+확인 0, 넘김 0, 되묻기 0, 결과 없음 0",
    "자동으로 끝남 - (0/판정 0)",
    "판정한 것 중 재고 0, 미송 0, 미수 0, 기타 0, 미분류 0",
    "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 12:00 기준",
  ]);
});

test("QA-d1 숫자를 그린 뒤 polling이 500이면 카드는 앞 숫자 그대로, 오류 0, 다른 칸 그대로", async ({
  page,
}) => {
  await startAt(page, new Date("2026-10-29T11:59:00+09:00"), {
    seed: STATS_V1,
  });
  await expect(cardLines(page).nth(0)).toHaveText("오늘 소매 메시지 12건");
  await settled(page, STATS_GET);
  const before = await count(page, STATS_GET);
  /* 앱 기본 5xx 재시도 2회까지 전부 실패 */
  await knob(page, "fail", { op: "stats", status: 500, times: 3 });
  await page.clock.fastForward(30_000);
  await waitCount(page, STATS_GET, before + 1);
  await page.clock.fastForward(5_000);
  await waitCount(page, STATS_GET, before + 3);
  await settled(page, STATS_GET);
  await page.clock.fastForward(100);
  await expect(cardLines(page).nth(0)).toHaveText("오늘 소매 메시지 12건");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "확정 기다리는 주문", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${QA_DIR}/qa-w-card-poll-fail.png` });
});

test("QA-d2 첫 조회 500: 카드만 오류, 타일 숫자와 오늘 칸 그대로(1280 화면)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startAt(page, new Date("2026-10-29T11:59:00+09:00"), {
    seed: STATS_V1,
    before: (p) => knob(p, "fail", { op: "stats", status: 500, times: 3 }),
  });
  const card = inquiryCard(page);
  await expect(card.getByRole("alert")).toContainText(
    "문의 숫자를 불러오지 못했어요",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
  /* 타일 4장은 숫자를 그린 링크다 */
  await expect(
    page.getByRole("link", { name: /^확정 기다리는 주문/ }),
  ).toContainText(/\d/);
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${QA_DIR}/qa-w-card-error-1280.png` });
});

/* --- 읽음 ---------------------------------------------------------------- */

function marks(page: Page): Locator {
  return log(page).getByText("읽음", { exact: true });
}

async function markedSequences(page: Page): Promise<number[]> {
  return bubbles(page)
    .filter({ has: page.getByText("읽음", { exact: true }) })
    .evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
    );
}

async function send(page: Page, text: string, sequence: number) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(
    log(page).locator(`[data-sequence="${sequence}"]`),
  ).toContainText(text);
}

async function nextMessagesPoll(page: Page): Promise<void> {
  const before = await count(page, MESSAGES_GET);
  await expect.poll(() => count(page, MESSAGES_GET)).toBeGreaterThan(before);
  await settled(page, MESSAGES_GET);
}

test("QA-b1 연달아 보낸 내 글 셋: 소매가 중간까지 읽으면 중간 하나, 끝까지 읽으면 맨 아래 하나만", async ({
  page,
}) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
  await openChats(page, 9);
  await expect(log(page)).toBeVisible();
  await knob(page, "reset");
  await expect(bubbles(page)).toHaveCount(2);
  await send(page, "레드 M 3장 남았어요", 3);
  await send(page, "블루는 다음 주 입고예요", 4);
  await send(page, "필요하시면 말씀 주세요", 5);
  await expect(marks(page)).toHaveCount(0);

  await knob(page, "rooms/9/counterpart-read", { sequence: 4 });
  await nextMessagesPoll(page);
  await expect.poll(() => markedSequences(page)).toEqual([4]);

  await knob(page, "rooms/9/counterpart-read", { sequence: 5 });
  await nextMessagesPoll(page);
  await expect.poll(() => markedSequences(page)).toEqual([5]);
  /* 화면 전체(목록 포함)에서 보이는 `읽음`은 하나 */
  await expect(page.getByText("읽음", { exact: true })).toHaveCount(1);
  /* 작은 값은 손잡이가 무시한다 — 다음 polling 뒤에도 5 */
  await knob(page, "rooms/9/counterpart-read", { sequence: 3 });
  await nextMessagesPoll(page);
  expect(await markedSequences(page)).toEqual([5]);
  await page.screenshot({ path: `${QA_DIR}/qa-w-read-last-only.png` });

  /* 디자인 audit: 읽음 = secondary-foreground, 시각 = muted-foreground, 12px */
  const style = await log(page)
    .locator('[data-sequence="5"]')
    .evaluate((el) => {
      const probe = (v: string) => {
        const s = document.createElement("span");
        s.style.color = `var(${v})`;
        document.body.append(s);
        const c = getComputedStyle(s).color;
        s.remove();
        return c;
      };
      const mark = [...el.querySelectorAll("span")].find(
        (s) => s.textContent === "읽음",
      );
      const line = mark?.parentElement;
      return {
        mark: mark && getComputedStyle(mark).color,
        line: line && getComputedStyle(line).color,
        size: mark && getComputedStyle(mark).fontSize,
        lineHeight: line && getComputedStyle(line).lineHeight,
        secondary: probe("--color-secondary-foreground"),
        muted: probe("--color-muted-foreground"),
        ac: mark?.getAttribute("data-ac"),
      };
    });
  expect(style.mark).toBe(style.secondary);
  expect(style.line).toBe(style.muted);
  expect(style.size).toBe("12px");
  expect(style.lineHeight).toBe("16px");
  expect(style.ac).toBe("S3-2");
});

test("QA-design 문의 카드 토큰 = 오늘 패널(테두리, 반경, 안쪽 여백, 제목), 줄 글자 14, 기준 줄 12/16 muted", async ({
  page,
}) => {
  await startAt(page, new Date("2026-10-29T11:59:30+09:00"), {
    seed: STATS_V1,
  });
  await expect(cardLines(page)).toHaveCount(5);
  const measured = await page.evaluate(() => {
    const card = document.querySelector('[role="region"][aria-label="문의"]');
    const todayH = [...document.querySelectorAll("h2")].find(
      (h) => h.textContent?.trim() === "오늘",
    );
    let today: Element | null = todayH ?? null;
    while (today && getComputedStyle(today).borderTopWidth === "0px")
      today = today.parentElement;
    const pick = (el: Element | null) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        radius: s.borderTopLeftRadius,
        border: `${s.borderTopWidth} ${s.borderTopColor}`,
        padding: s.padding,
        bg: s.backgroundColor,
      };
    };
    const probe = (v: string) => {
      const s = document.createElement("span");
      s.style.color = `var(${v})`;
      document.body.append(s);
      const c = getComputedStyle(s).color;
      s.remove();
      return c;
    };
    const ps = card ? [...card.querySelectorAll("p[data-ac]")] : [];
    const title = card?.querySelector("h2") ?? null;
    return {
      card: pick(card),
      today: pick(today),
      title: title && {
        size: getComputedStyle(title).fontSize,
        weight: getComputedStyle(title).fontWeight,
      },
      todayTitle: todayH && {
        size: getComputedStyle(todayH).fontSize,
        weight: getComputedStyle(todayH).fontWeight,
      },
      lines: ps.map((p) => getComputedStyle(p).fontSize),
      base: ps[4] && {
        lh: getComputedStyle(ps[4]).lineHeight,
        color: getComputedStyle(ps[4]).color,
      },
      muted: probe("--color-muted-foreground"),
      primary: probe("--color-primary"),
      link: (() => {
        const a = card?.querySelector("a");
        return a && getComputedStyle(a).color;
      })(),
    };
  });
  /* 둘 다 잡혔는지 먼저 — null끼리 같으면 거짓 통과다 */
  expect(measured.card?.radius).toBe("10px");
  expect(measured.today).not.toBeNull();
  expect(measured.title?.size).toBeDefined();
  expect(measured.card).toEqual(measured.today);
  expect(measured.title).toEqual(measured.todayTitle);
  expect(measured.lines).toEqual(["14px", "14px", "14px", "14px", "12px"]);
  expect(measured.base).toEqual({ lh: "16px", color: measured.muted });
  expect(measured.link).toBe(measured.primary);
});
