import { expect, test, type Page } from "@playwright/test";
import {
  activeChip,
  askBackorder,
  askReceivable,
  assertStubServers,
  backorderClarifies,
  backorderLink,
  backorderReply,
  backorderRows,
  composer,
  countDocuments,
  DROPPED_TEXT,
  handoffLines,
  log,
  loseSession,
  openRoomById,
  orderChoice,
  orderGroups,
  pickBackorder,
  receivableCard,
  say,
  settlementLinkIn,
  start,
  stubBackorders,
  ASK_DISCOUNT,
} from "./retail-helpers";

/**
 * #374 S4-2~S4-6 — 소매 미송 카드와 미송 되묻기 아래 `미송 대기 현황 보기`, 미수 카드 정산 링크의 이동(기획 §4-1).
 * 채팅은 브라우저 MSW(T0 = 2026-10-29 14:20), 도착 화면 `/backorders`는 Server Component가 HTTP stub(3199)을 읽는다.
 * stub 미송 표는 하나라 매 시험 시작에 seed로 되돌리고, 끝나면 다시 seed로 둔다(다른 spec이 seed를 기대한다).
 *
 * 방 1 = 무드온(101), 방 33 = 라온(102). stub seed = 무드온 4행(9001 9002 9006 9003) + 라온 1행(801).
 */

assertStubServers();

const MOODON_HREF = "/backorders?wholesaler=101";
const RAON_HREF = "/backorders?wholesaler=102";

test.beforeEach(async ({ page }) => {
  await stubBackorders(page, "seed");
});

test.afterEach(async ({ page }) => {
  await stubBackorders(page, "seed");
});

/** 방을 열고 미송 질문 → 되묻기 → 그 미송 카드 */
async function cardInRoom(page: Page, roomId: number, backorderId: number) {
  await start(page, "/");
  await openRoomById(page, roomId);
  const clarify = await askBackorder(page);
  const reply = await pickBackorder(page, clarify, backorderId);
  return { clarify, reply };
}

async function expectMoodonArrival(page: Page) {
  await expect(page).toHaveURL(MOODON_HREF);
  await expect(activeChip(page)).toHaveText("무드온");
  await expect(backorderRows(page)).toHaveCount(4);
  for (const row of await backorderRows(page).all())
    await expect(row).toContainText("무드온");
}

test("S4-2 1280 방 1 카드 링크 → ?wholesaler=101 무드온 칩, 표 줄 전부 무드온, document 0, 뒤로 → 방 1 쓰던 글 그대로", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { reply } = await cardInRoom(page, 1, 9003);
  const docs = countDocuments(page);
  await composer(page).fill("쓰던 글 그대로");
  const link = backorderLink(reply);
  await expect(link).toHaveAttribute("href", MOODON_HREF);
  await link.click();
  await expectMoodonArrival(page);
  expect(docs.count, "클라이언트 이동").toBe(0);

  await page.goBack();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toHaveValue("쓰던 글 그대로");
  await expect(backorderReply(page, 9003)).toHaveCount(1);
  expect(docs.count).toBe(0);
});

test.describe("S4-3 미송 되묻기 세 상태 — 보기 enabled 여부와 링크 enabled를 같이", () => {
  test("(a) active → 보기 enabled, 링크 enabled, 누르면 ?wholesaler=101 무드온", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, 1);
    const clarify = await askBackorder(page);
    /* 08f R4: 9003만 보면 나머지 보기를 disabled로 만드는 결함이 산다. 보기 전부(seed 무드온 4 + 다른 주문이에요 1)를 본다 */
    const group = clarify.getByRole("group", {
      name: "주문 고르기",
      exact: true,
    });
    await expect(group.getByRole("button")).toHaveCount(5);
    for (const id of [9001, 9002, 9006, 9003])
      await expect(orderChoice(clarify, id)).toBeEnabled();
    await expect(
      group.getByRole("button", { name: "다른 주문이에요", exact: true }),
    ).toBeEnabled();
    const link = backorderLink(clarify);
    await expect(link).toBeEnabled();
    await expect(link).toHaveAttribute("href", MOODON_HREF);
    await link.click();
    await expectMoodonArrival(page);
  });

  test("(b) 이미 고른 지난 되묻기 → 보기 disabled, 링크 enabled, 누르면 같은 주소", async ({
    page,
  }) => {
    const { clarify } = await cardInRoom(page, 1, 9003);
    for (const id of [9001, 9002, 9006, 9003])
      await expect(orderChoice(clarify, id)).toBeDisabled();
    const link = backorderLink(clarify);
    await expect(link).toBeEnabled();
    await link.click();
    await expectMoodonArrival(page);
  });

  test("(c) 끊긴 방의 되묻기 → 보기 disabled, 링크 enabled(전체 이동 href)", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, 1);
    const clarify = await askBackorder(page);
    await loseSession(page);
    for (const id of [9001, 9002, 9006, 9003])
      await expect(orderChoice(clarify, id)).toBeDisabled();
    const link = backorderLink(clarify);
    await expect(link).toBeEnabled();
    await expect(link).toHaveAttribute("href", MOODON_HREF);
    await expect(link).toHaveAttribute("data-nav", "document");
  });
});

test.describe("S4-4 도착 화면 — stub 미송 표 상태별", () => {
  test("① 방 33(라온 102), seed → 카드 링크 → ?wholesaler=102 라온 칩, 표 줄 라온 1", async ({
    page,
  }) => {
    const { reply } = await cardInRoom(page, 33, 801);
    await backorderLink(reply).click();
    await expect(page).toHaveURL(RAON_HREF);
    await expect(activeChip(page)).toHaveText("라온");
    await expect(backorderRows(page)).toHaveCount(1);
    await expect(backorderRows(page).first()).toContainText("라온");
    await expect(backorderRows(page).first()).toContainText("코튼 셔츠");
    await expect(page.getByText(DROPPED_TEXT)).toHaveCount(0);
  });

  test("② stub empty → 방 1 카드 링크 → 떨어짐 안내 + 빈 상태, 오류 0", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { reply } = await cardInRoom(page, 1, 9003);
    await stubBackorders(page, "empty");
    await backorderLink(reply).click();
    await expect(page).toHaveURL(MOODON_HREF);
    await expect(page.getByText(DROPPED_TEXT)).toBeVisible();
    await expect(page.getByText("지금 기다리는 미송이 없어요")).toBeVisible();
    await expect(backorderRows(page)).toHaveCount(0);
    await expect(page.getByText("지금 화면을 불러올 수 없어요")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  /* 기획 S4-4 ②의 원래 조건 "떨어짐 안내 + `전체` 칩". 받은 장이 0행이면 기존 BackorderView가 툴바(칩)째 빈 상태로
     바꿔서(`BackorderView.tsx` empty 갈래, 기획 §4-1 5 "바꾸지 않음") `전체` 칩이 없다. 원래 조건은 실패로 남긴다(브리프 규칙 7) */
  test.fail(
    "② 원래 조건: stub empty → 떨어짐 안내 + 전체 칩 켜짐",
    async ({ page }) => {
      const { reply } = await cardInRoom(page, 1, 9003);
      await stubBackorders(page, "empty");
      await backorderLink(reply).click();
      await expect(page).toHaveURL(MOODON_HREF);
      await expect(page.getByText(DROPPED_TEXT)).toBeVisible();
      await expect(activeChip(page)).toHaveText("전체", { timeout: 3_000 });
    },
  );

  test("③ stub page2-only-102 → 방 33 카드 링크 → 첫 장 무드온 100행, 전체 칩, 떨어짐 안내", async ({
    page,
  }) => {
    const { reply } = await cardInRoom(page, 33, 801);
    await stubBackorders(page, "page2-only-102");
    await backorderLink(reply).click();
    await expect(page).toHaveURL(RAON_HREF);
    await expect(page.getByText(DROPPED_TEXT)).toBeVisible();
    await expect(activeChip(page)).toHaveText("전체");
    await expect(backorderRows(page)).toHaveCount(100);
    const names = await backorderRows(page).evaluateAll((rows) =>
      rows.map((r) => (r.textContent ?? "").includes("무드온")),
    );
    expect(names.every(Boolean)).toBe(true);
    await expect(backorderRows(page).filter({ hasText: "라온" })).toHaveCount(
      0,
    );
  });
});

test.describe("S4-5 끊긴 방 링크는 전체 이동(document 1), 끊기기 전 정산 링크는 클라이언트 이동", () => {
  test("끊긴 방 미송 카드 링크 → document 1, /backorders?wholesaler=101 무드온", async ({
    page,
  }) => {
    const { reply } = await cardInRoom(page, 1, 9003);
    await loseSession(page);
    const docs = countDocuments(page);
    await backorderLink(reply).click();
    await expectMoodonArrival(page);
    expect(docs.count).toBe(1);
  });

  test("끊긴 방 미송 되묻기 링크 → document 1, 같은 주소", async ({ page }) => {
    const { clarify } = await cardInRoom(page, 1, 9003);
    await loseSession(page);
    const docs = countDocuments(page);
    await backorderLink(clarify).click();
    await expectMoodonArrival(page);
    expect(docs.count).toBe(1);
  });

  test("끊긴 방 미수 카드 정산 링크 → document 1, /settlements?wholesaler=101", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, 1);
    const bubble = await askReceivable(page);
    await loseSession(page);
    const docs = countDocuments(page);
    await settlementLinkIn(receivableCard(bubble)).click();
    await expect(page).toHaveURL("/settlements?wholesaler=101");
    expect(docs.count).toBe(1);
    /* 정산 화면 내용은 보지 않는다 — stub에 원장 경로가 없다(loop-07 QA-R8 주석) */
  });

  test("끊기기 전 미수 카드 정산 링크 → document 0(클라이언트 이동)", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, 1);
    const bubble = await askReceivable(page);
    const docs = countDocuments(page);
    await settlementLinkIn(receivableCard(bubble)).click();
    await expect(page).toHaveURL("/settlements?wholesaler=101");
    expect(docs.count).toBe(0);
  });
});

test("S4-6 방 1 재고 되묻기, 재고 카드, 미수 카드, 넘김 줄, 미송 되묻기와 카드 → 미송 링크 수 = 미송 말풍선 수, 나머지 말풍선 안 0", async ({
  page,
}) => {
  await start(page, "/chats/1?from=/products/2001");
  await expect(composer(page)).toBeVisible();
  /* 재고 되묻기 → 레드 / M → 재고 카드 */
  await say(page, "이 셔츠 몇 장 남았어요?");
  const stockGroup = log(page)
    .getByRole("group", { name: "색상, 사이즈 고르기" })
    .last();
  await expect(stockGroup).toBeVisible();
  await stockGroup.getByRole("button", { name: /^레드 \/ M/ }).click();
  await expect(
    log(page).locator('[data-variant-id="3002"]').last(),
  ).toBeVisible();
  /* 미수 카드 */
  await askReceivable(page);
  /* 넘김 줄 */
  const handoffs = await handoffLines(page).count();
  await say(page, ASK_DISCOUNT);
  await expect(handoffLines(page)).toHaveCount(handoffs + 1);
  /* 미송 되묻기 → 카드 */
  const clarify = await askBackorder(page);
  await pickBackorder(page, clarify, 9003);
  await expect(orderGroups(page)).toHaveCount(1);

  const m = await log(page).evaluate((root) => {
    const bubbles = [...root.querySelectorAll("[data-kind]")];
    const isBackorder = (b: Element) =>
      b.querySelector('[role="group"][aria-label="주문 고르기"]') !== null ||
      b.querySelector('div[data-ac="S3-3"][data-backorder-id]') !== null;
    const links = (b: Element) =>
      [...b.querySelectorAll("a")].filter(
        (a) => a.textContent === "미송 대기 현황 보기",
      ).length;
    const kindOf = (b: Element) =>
      b.querySelector("[data-receivable-card]")
        ? "receivable"
        : b.querySelector("[data-variant-id]")
          ? "stock"
          : b.querySelector('[role="group"][aria-label="색상, 사이즈 고르기"]')
            ? "stockClarify"
            : b.getAttribute("data-kind") === "HANDOFF"
              ? "handoff"
              : isBackorder(b)
                ? "backorder"
                : "other";
    return bubbles.map((b) => ({ kind: kindOf(b), links: links(b) }));
  });
  const total = m.reduce((n, b) => n + b.links, 0);
  const backorderBubbles = m.filter((b) => b.kind === "backorder");
  expect(backorderBubbles.length).toBe(2);
  expect(total).toBe(backorderBubbles.length);
  expect(backorderBubbles.every((b) => b.links === 1)).toBe(true);
  for (const kind of ["stock", "stockClarify", "receivable", "handoff"]) {
    const of = m.filter((b) => b.kind === kind);
    expect(of.length, `${kind} 말풍선이 있다`).toBeGreaterThan(0);
    expect(
      of.every((b) => b.links === 0),
      `${kind} 안 미송 링크 0`,
    ).toBe(true);
  }
  await expect(backorderClarifies(page)).toHaveCount(1);
});
