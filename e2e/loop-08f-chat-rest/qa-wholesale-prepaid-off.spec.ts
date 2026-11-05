import { expect, test, type Page } from "@playwright/test";
import {
  ALLOCATIONS_POST,
  cardLines,
  collectPageErrors,
  count,
  depositViaFetch,
  inquiryCard,
  knob,
  requests,
  settled,
  startAt,
  STATS_GET,
  T_1159,
  T_1420,
  waitCount,
} from "./helpers";

/**
 * 08f QA 재현 spec, #382에서 회귀 시험으로 커밋.
 *
 * loop-08f QA — #371(계약) 화면 확인. 기본 설정 wholesale(3100, MSW)로 돈다.
 *
 * 1. 정산 탭 `선수금으로 정산` 성공 안내와 3카드(1280, 1470) — 스크린샷
 * 2. 자동 답 전부 꺼짐 때 대시보드 4줄(1280, 1470) — 스크린샷
 * 3. S1-5 원래 절차(`wholesale-off-intent.spec.ts`의 test.fail)가 왜 실패하는지: 30초 polling이 12:00을 넘어
 *    영업일이 10/29로 바뀐다 — 1470에서 실측. 그 test.fail은 "원래 기대가 안 맞음"을, 이 시험은 "원인(from 10/29, 4줄 0)"을
 *    단언해서 겹치지 않는다
 * 4. Codex R1 회귀: 배분액 0.5 → 400 VALIDATION_FAILED, 선수금 그대로(QA 때는 201, 선수금 9,999.5였다)
 * 5. 반복 4패턴 1(숫자 입력): 배분액 칸에 `12.5`, `-3`, `1e5` — 관찰만(칸 코드는 이번 diff 밖)
 *
 * 스크린샷은 `.claude/harness/runs/loop-08f-chat-rest/qa/`.
 */

const SHOT = ".claude/harness/runs/loop-08f-chat-rest/qa";
const QUESTION = "레드 M 몇 장 있어요?";

async function offAndAsk(page: Page): Promise<void> {
  await knob(page, "auto-reply", { enabled: false });
  await knob(page, "rooms/1/incoming", {
    body: QUESTION,
    contextListingId: 2001,
  });
}

/** 정산 탭 → 봄봄상회 펼침 */
async function openBombom(page: Page): Promise<void> {
  await page.getByRole("link", { name: "정산", exact: true }).click();
  await page.waitForURL(/\/settlements/);
  await page
    .getByRole("button", { name: "봄봄상회 펼치기", exact: true })
    .click();
}

const prepaidLeft = (page: Page) =>
  page.locator('div:has(> dt:text-is("남은 선수금")) > dd');

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`QA 08f-1 ${viewport.width} 정산 탭 선수금 정산: 3카드, 성공 안내 스크린샷`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors = collectPageErrors(page);
    await startAt(page, T_1420, {
      before: (p) =>
        depositViaFetch(p, {
          amount: 37_500,
          paidAt: "2026-10-28T10:00:00+09:00",
          key: "qa-p-1",
        }),
    });
    await openBombom(page);
    await expect(prepaidLeft(page)).toHaveText("37,500원");
    await page.screenshot({
      path: `${SHOT}/b1-settle-3cards-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "선수금으로 정산", exact: true })
      .click();
    await expect(page.getByLabel("주문 2 배분액", { exact: true })).toHaveValue(
      "37,500",
    );
    await page
      .getByRole("button", { name: "선수금 정산", exact: true })
      .click();
    await expect(
      page.getByText(
        "봄봄상회에 선수금 37,500원 정산했어요 — 미수원장에서 확인하세요",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(prepaidLeft(page)).toHaveText("0원");
    await page.screenshot({
      path: `${SHOT}/b1-settle-success-${viewport.width}.png`,
    });
    const docOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(docOverflow, "문서 가로 넘침").toBeLessThanOrEqual(0);
    expect(
      (await requests(page, ALLOCATIONS_POST)).map((r) => r.status),
    ).toEqual([201]);
    expect(errors).toEqual([]);
  });

  test(`QA 08f-1 ${viewport.width} 자동 답 전부 꺼짐 + 재고 질문 → 대시보드 4줄 재고 5, 미분류 2 스크린샷`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAt(page, T_1159, { seed: "stats-v1", before: offAndAsk });
    await expect(cardLines(page).nth(3)).toHaveText(
      "판정한 것 중 재고 5, 미송 1, 미수 1, 기타 0, 미분류 2",
    );
    await settled(page, STATS_GET);
    await inquiryCard(page).screenshot({
      path: `${SHOT}/b1-dashboard-off-intent-${viewport.width}.png`,
    });
  });
}

test("QA 08f-1 1470 S1-5 원래 절차가 실패하는 이유: 30초 polling 뒤 오늘 응답 from이 10/29로 바뀌어 4줄이 전부 0", async ({
  page,
}) => {
  await startAt(page, T_1159, { seed: "stats-v1" });
  await expect(cardLines(page).nth(3)).toHaveText(
    "판정한 것 중 재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
  );
  await settled(page, STATS_GET);
  await offAndAsk(page);
  const before = await count(page, STATS_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, STATS_GET, before + 1);
  await settled(page, STATS_GET);
  /* 같은 목에 직접 물어 지금 영업일을 읽는다(카드가 부른 것과 같은 op) */
  const now = await page.evaluate(async () => {
    const res = await fetch("/api/wholesale/chat/inquiry-stats");
    const json = (await res.json()) as { data: { from: string; asOf: string } };
    return { from: json.data.from, asOf: json.data.asOf };
  });
  const line4 = await cardLines(page).nth(3).textContent();
  test.info().annotations.push({
    type: "S1-5 원래 절차 실측",
    description: JSON.stringify({ now, line4 }),
  });
  expect(now.from).toBe("2026-10-29");
  await expect(cardLines(page).nth(3)).toHaveText(
    "판정한 것 중 재고 0, 미송 0, 미수 0, 기타 0, 미분류 0",
  );
});

test("QA 08f-R1 1470 배분액 0.5 → 400 VALIDATION_FAILED, 남은 선수금 10,000원 그대로", async ({
  page,
}) => {
  let result: { status: number; code: unknown; prepaidRemaining: unknown } = {
    status: 0,
    code: null,
    prepaidRemaining: null,
  };
  await startAt(page, T_1420, {
    before: async (p) => {
      await depositViaFetch(p, {
        amount: 10_000,
        paidAt: "2026-10-28T10:00:00+09:00",
        key: "qa-r1-p",
      });
      result = await p.evaluate(async () => {
        const res = await fetch("/api/wholesale/allocations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "qa-r1-a",
          },
          body: JSON.stringify({
            retailerId: 1,
            allocations: [{ orderId: 7004, amount: 0.5 }],
          }),
        });
        const json = (await res.json()) as {
          code?: unknown;
          data?: { prepaidRemaining?: unknown };
        };
        return {
          status: res.status,
          code: json.code ?? null,
          prepaidRemaining: json.data?.prepaidRemaining ?? null,
        };
      });
    },
  });
  await openBombom(page);
  const shown = await prepaidLeft(page).textContent();
  await page.screenshot({ path: `${SHOT}/r1-half-won-1470.png` });
  test.info().annotations.push({
    type: "R1 실측",
    description: JSON.stringify({ ...result, shown }),
  });
  expect(result.status).toBe(400);
  expect(result.code).toBe("VALIDATION_FAILED");
  /* 거절됐으니 선수금은 입금한 그대로다(QA 때 결함은 9,999.5원) */
  await expect(prepaidLeft(page)).toHaveText("10,000원");
});

test("QA 08f-1 1470 반복 4패턴 1: 배분액 칸에 12.5, -3, 1e5를 넣으면 무엇이 남나(관찰)", async ({
  page,
}) => {
  await startAt(page, T_1420, {
    before: (p) =>
      depositViaFetch(p, {
        amount: 37_500,
        paidAt: "2026-10-28T10:00:00+09:00",
        key: "qa-p-2",
      }),
  });
  await openBombom(page);
  await page
    .getByRole("button", { name: "선수금으로 정산", exact: true })
    .click();
  const amount = page.getByLabel("주문 2 배분액", { exact: true });
  const seen: Record<string, string> = {};
  for (const raw of ["12.5", "-3", "1e5"]) {
    /* fill(한 번에 값 바꿈)은 칸이 받지 않았다(첫 실행 실측 37,500 그대로) — 사장처럼 지우고 친다 */
    await amount.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(raw);
    seen[raw] = await amount.inputValue();
  }
  test.info().annotations.push({
    type: "배분액 칸 실측",
    description: JSON.stringify(seen),
  });
  /* 소수점, 부호, 지수는 칸에 남지 않는다(숫자만 남김) — 남는 값은 annotation이 말한다 */
  for (const value of Object.values(seen)) expect(value).toMatch(/^[\d,]*$/);
});
