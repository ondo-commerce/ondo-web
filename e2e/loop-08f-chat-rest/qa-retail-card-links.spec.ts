import { expect, test } from "@playwright/test";
import {
  activeChip,
  askBackorder,
  askReceivable,
  assertStubServers,
  backorderLink,
  backorderRows,
  countDocuments,
  DROPPED_TEXT,
  loseSession,
  openRoomById,
  pickBackorder,
  receivableCard,
  settlementLinkIn,
  start,
  stubBackorders,
} from "./retail-helpers";

/**
 * 08f QA 재현 spec, #382에서 회귀 시험으로 커밋.
 *
 * loop-08f QA — #374 소매 미송 링크와 정산 링크 화면. `pnpm e2e:stub`(3199 + 3101).
 *
 * 폭마다(390, 1280, 1470): 방 1에서 미송 되묻기 링크, 미송 카드 링크, 미수 정산 링크 → 끊긴 방(세 링크 전부 전체 이동) →
 * stub `empty`로 미송 카드 링크 → 빈 목록 도착 화면(Codex R5, G3 판단거리). 각 단계 스크린샷.
 * 그리고 R4 보강: active 되묻기의 보기 전부(다른 주문이에요 포함)가 enabled.
 *
 * 스크린샷은 `.claude/harness/runs/loop-08f-chat-rest/qa/`.
 */

assertStubServers();

const SHOT = ".claude/harness/runs/loop-08f-chat-rest/qa";
const MOODON_HREF = "/backorders?wholesaler=101";

test.beforeEach(async ({ page }) => {
  await stubBackorders(page, "seed");
});

test.afterEach(async ({ page }) => {
  await stubBackorders(page, "seed");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
] as const) {
  test(`QA 08f-4 ${viewport.width} 링크 셋 → 끊긴 방 전체 이동 → 빈 목록 도착, 스크린샷`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page, "/");
    await openRoomById(page, 1);

    const clarify = await askBackorder(page);
    await expect(backorderLink(clarify)).toBeVisible();
    await clarify.screenshot({
      path: `${SHOT}/b2-clarify-link-${viewport.width}.png`,
    });
    const reply = await pickBackorder(page, clarify, 9003);
    await expect(backorderLink(reply)).toBeVisible();
    await reply.screenshot({
      path: `${SHOT}/b2-card-link-${viewport.width}.png`,
    });
    const bubble = await askReceivable(page);
    const settle = settlementLinkIn(receivableCard(bubble));
    await expect(settle).toBeVisible();
    await bubble.screenshot({
      path: `${SHOT}/b2-settle-link-${viewport.width}.png`,
    });
    const before = {
      clarify: await backorderLink(clarify).getAttribute("data-nav"),
      card: await backorderLink(reply).getAttribute("data-nav"),
      settle: await settle.getAttribute("data-nav"),
    };

    await loseSession(page);
    await page.screenshot({
      path: `${SHOT}/b2-room-lost-${viewport.width}.png`,
    });
    const lost = {
      clarify: await backorderLink(clarify).getAttribute("data-nav"),
      card: await backorderLink(reply).getAttribute("data-nav"),
      settle: await settle.getAttribute("data-nav"),
    };
    expect(before).toEqual({
      clarify: "client",
      card: "client",
      settle: "client",
    });
    expect(lost).toEqual({
      clarify: "document",
      card: "document",
      settle: "document",
    });

    /* 빈 목록 도착(R5): 끊긴 방이라 전체 이동 1 */
    await stubBackorders(page, "empty");
    const docs = countDocuments(page);
    await backorderLink(reply).click();
    await expect(page).toHaveURL(MOODON_HREF);
    await expect(page.getByText(DROPPED_TEXT, { exact: true })).toBeVisible();
    const arrival = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('a[aria-current="true"]')].map(
        (a) => a.textContent,
      ),
      headings: [...document.querySelectorAll("main h1, main h2, main h3")].map(
        (h) => h.textContent,
      ),
      links: [...document.querySelectorAll("main a")].map((a) => ({
        text: a.textContent,
        href: a.getAttribute("href"),
      })),
      docOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    await page.screenshot({
      path: `${SHOT}/b2-arrive-empty-${viewport.width}.png`,
      fullPage: true,
    });
    test.info().annotations.push({
      type: "빈 목록 도착 실측",
      description: JSON.stringify({ documents: docs.count, ...arrival }),
    });
    expect(docs.count).toBe(1);
    await expect(backorderRows(page)).toHaveCount(0);
    /* S4-4 ② 원래 조건의 `전체` 칩이 없는 것이 test.fail 이유다(켜진 칩 0) */
    await expect(activeChip(page)).toHaveCount(0);
    expect(arrival.docOverflow).toBeLessThanOrEqual(0);
  });
}

test("QA 08f-R4 1470 active 미송 되묻기: 주문 보기 전부와 '다른 주문이에요'가 enabled", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);
  const clarify = await askBackorder(page);
  const group = clarify.getByRole("group", {
    name: "주문 고르기",
    exact: true,
  });
  const buttons = group.getByRole("button");
  const n = await buttons.count();
  const states = await buttons.evaluateAll((els) =>
    els.map((b) => ({
      text: b.textContent,
      disabled: (b as HTMLButtonElement).disabled,
    })),
  );
  test.info().annotations.push({
    type: "보기 상태",
    description: JSON.stringify(states),
  });
  expect(n).toBeGreaterThanOrEqual(5);
  expect(states.every((s) => !s.disabled)).toBe(true);
  await expect(
    group.getByRole("button", { name: "다른 주문이에요", exact: true }),
  ).toBeEnabled();
});
