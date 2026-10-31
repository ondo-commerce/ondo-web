import { expect, test, type Page } from "@playwright/test";
import {
  cardLines,
  count,
  inquiryCard,
  knob,
  ORDERS_GET,
  readCard,
  requests,
  settled,
  startAt,
  STATS_GET,
  SUMMARY_GET,
  waitCount,
} from "./helpers";

/**
 * loop-08 #312 S2 도매 대시보드 `문의` 카드(01-plan §4-2, §6 S2, 와이어프레임 21, 디자인 결정 49~53).
 *
 * 숫자는 **AC에 적힌 손 계산 값**과 비교한다(op 응답과 비교하지 않는다, §0 3). S2-4만 "화면에서 읽은 값 + 1"이다.
 * 4줄은 앞말 "판정한 것 중"까지 정확히 비교한다 — 디자인 결정 51이 앞말을 붙였고 G1이 거부권으로 채택했다.
 */

/** 서울 10/29(목) 11:59:30 — 영업일은 아직 10/28. `stats-v1` 시드의 10/28 영업일 = F1~F12 */
const T_1159 = new Date("2026-10-29T11:59:30+09:00");
/** 서울 10/29 12:00:00 — 영업일이 10/29로 넘어간 순간 */
const T_1200 = new Date("2026-10-29T12:00:00+09:00");
/** 서울 10/29 15:00 — 기본 시드, 오늘 영업일 10/29 */
const T_1500 = new Date("2026-10-29T15:00:00+09:00");

const STATS_V1 = "stats-v1";

/** 다음 30초 polling 하나가 응답까지 받을 때까지 */
async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, STATS_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, STATS_GET, before + 1);
  await settled(page, STATS_GET);
}

test("S2-1 stats-v1, 10/29 11:59:30 → 12건, 5/1/2/3/1, 63% (5/판정 8), 재고 4 미송 1 미수 1 기타 0 미분류 2", async ({
  page,
}) => {
  await startAt(page, T_1159, { seed: STATS_V1 });
  await expect(cardLines(page)).toHaveText([
    "오늘 소매 메시지 12건",
    "자동 답 5, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1",
    "자동으로 끝남 63% (5/판정 8)",
    "판정한 것 중 재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
    "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
  ]);
  /* 1줄 숫자만 크게, 3줄 퍼센트만 500(디자인 결정 49) */
  const big = cardLines(page).nth(0).locator("span");
  await expect(big).toHaveText("12");
  await expect(big).toHaveCSS("font-size", "24px");
  await expect(cardLines(page).nth(2).locator("span")).toHaveText("63%");
  await expect(cardLines(page).nth(2).locator("span")).toHaveCSS(
    "font-weight",
    "500",
  );
  /* 카드는 인자 없이 부른다 — 오늘 영업일은 서버가 정한다 */
  const [first] = await requests(page, STATS_GET);
  expect(new URL(first?.url ?? "http://x/?missing", page.url()).search).toBe(
    "",
  );
});

test("S2-3 같은 시드, 10/29 12:00 → 오늘 = 10/29 영업일, 0건, 비율 -", async ({
  page,
}) => {
  await startAt(page, T_1200, { seed: STATS_V1 });
  await expect(cardLines(page)).toHaveText([
    "오늘 소매 메시지 0건",
    "자동 답 0, 답+확인 0, 넘김 0, 되묻기 0, 결과 없음 0",
    "자동으로 끝남 - (0/판정 0)",
    "판정한 것 중 재고 0, 미송 0, 미수 0, 기타 0, 미분류 0",
    "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 12:00 기준",
  ]);
  /* 빈 상태 문구를 따로 두지 않는다(디자인 결정 52) */
  await expect(inquiryCard(page).getByRole("alert")).toHaveCount(0);
});

test("S2-4 기본 시드, 10/29 15:00: 재고 질문 1건 → 30초 뒤 소매 메시지, 자동 답, 재고 각 +1, 나머지 그대로", async ({
  page,
}) => {
  await startAt(page, T_1500);
  await expect(cardLines(page)).toHaveCount(5);
  await settled(page, STATS_GET);
  const before = await readCard(page);

  /* 방 1(봄봄상회)은 reset 때 상품 문맥 2001(빈티지 플라워 셔츠)이 박힌다. 레드 M 재고 35장 → 자동 답만 */
  await knob(page, "rooms/1/incoming", {
    body: "레드 M 몇 장 있어요",
    autoReply: true,
  });
  /* 주입만으로는 카드가 안 바뀐다 — 다음 polling까지 그대로 */
  await expect(cardLines(page).nth(0)).toHaveText(
    `오늘 소매 메시지 ${before.total}건`,
  );
  await nextPoll(page);

  await expect(cardLines(page).nth(0)).toHaveText(
    `오늘 소매 메시지 ${before.total + 1}건`,
  );
  const after = await readCard(page);
  expect(after.outcome).toEqual({
    ...before.outcome,
    "자동 답": (before.outcome["자동 답"] ?? Number.NaN) + 1,
  });
  expect(after.intent).toEqual({
    ...before.intent,
    재고: (before.intent["재고"] ?? Number.NaN) + 1,
  });
});

for (const status of [500, 404] as const) {
  test(`S2-5 stats ${status} → 카드 안에만 오류와 다시 시도, 타일과 큐 그대로, 다시 시도 → 요청 1회`, async ({
    page,
  }) => {
    await startAt(page, T_1159, {
      seed: STATS_V1,
      /* 5xx는 앱 기본 재시도가 두 번 더 부른다(providers) — 셋 다 실패해야 카드가 오류를 그린다. 4xx는 재시도 없음 */
      before: (p) =>
        knob(p, "fail", {
          op: "stats",
          status,
          times: status === 500 ? 3 : 1,
        }),
    });
    const card = inquiryCard(page);
    await expect(card.getByRole("alert")).toContainText(
      "문의 숫자를 불러오지 못했어요",
    );
    const retry = card.getByRole("button", { name: "다시 시도", exact: true });
    await expect(retry).toBeVisible();
    /* 제목과 채팅 열기는 오류 중에도 있다 */
    await expect(
      card.getByRole("link", { name: "채팅 열기", exact: true }),
    ).toBeVisible();
    /* 오류는 화면에 이것 하나. 타일, 큐, 오늘은 그대로 그려져 있다 */
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: /^확정 기다리는 주문/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "확정 기다리는 주문", exact: true }),
    ).toBeVisible();
    /* 큐 행(시드 NEW 주문)마다 `주문 보기` 링크 */
    await expect(
      page.getByRole("link", { name: "주문 보기", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "오늘", exact: true }),
    ).toBeVisible();

    await settled(page, STATS_GET);
    const stats = await count(page, STATS_GET);
    const summary = await count(page, SUMMARY_GET);
    const orders = await count(page, ORDERS_GET);
    await retry.click();
    await expect(cardLines(page).nth(0)).toHaveText("오늘 소매 메시지 12건");
    expect(await count(page, STATS_GET)).toBe(stats + 1);
    /* 카드의 다시 시도는 다른 칸을 다시 부르지 않는다(디자인 결정 50) */
    expect(await count(page, SUMMARY_GET)).toBe(summary);
    expect(await count(page, ORDERS_GET)).toBe(orders);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`S2-6 ${viewport.width}: 기준 줄, 채팅 열기 → /chats, 카드 전체가 오른쪽 열 안(잘림 0, 페이지 스크롤 0)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAt(page, T_1159, { seed: STATS_V1 });
    const card = inquiryCard(page);
    await expect(cardLines(page).nth(4)).toHaveText(
      "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
    );

    const fit = await card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const column = el.parentElement?.getBoundingClientRect();
      const lines = [...el.querySelectorAll("p")].map((p) => ({
        overflow: p.scrollWidth > p.clientWidth,
        /* 줄바꿈 0: 줄 높이(line-height) 하나 안에 든다. 1줄은 24px 숫자라 32 */
        height: p.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(p).lineHeight),
      }));
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        column: column && {
          left: column.left,
          right: column.right,
          bottom: column.bottom,
        },
        cardOverflow: el.scrollHeight > el.clientHeight,
        lines,
        pageScroll:
          document.documentElement.scrollHeight > window.innerHeight ||
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(fit.column).toBeDefined();
    expect(fit.left).toBeGreaterThanOrEqual(fit.column?.left ?? Infinity);
    expect(fit.right).toBeLessThanOrEqual(fit.column?.right ?? -Infinity);
    expect(fit.bottom).toBeLessThanOrEqual(viewport.height);
    expect(fit.cardOverflow).toBe(false);
    expect(fit.pageScroll).toBe(false);
    for (const line of fit.lines) {
      expect(line.overflow).toBe(false);
      expect(line.height).toBeLessThanOrEqual(Math.max(line.lineHeight, 32));
    }
    /* 높이가 모자라면 주의만 줄어든다 — 카드 아래 주의 패널이 카드와 겹치지 않는다 */
    const attention = page.getByRole("heading", { name: "주의", exact: true });
    const attentionTop = (await attention.boundingBox())?.y ?? -1;
    expect(attentionTop).toBeGreaterThan(fit.bottom);

    const link = card.getByRole("link", { name: "채팅 열기", exact: true });
    await expect(link).toHaveAttribute("href", "/chats");
    await link.click();
    await expect(page).toHaveURL(/\/chats$/);
  });
}
