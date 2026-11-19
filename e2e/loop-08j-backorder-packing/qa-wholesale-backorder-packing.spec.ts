import { expect, test, type Page } from "@playwright/test";
import {
  allocateLinen,
  ask,
  bubbleOf,
  choiceItems,
  LINEN_INPUT,
  linenChoice,
  NOT_LISTED,
  openLinenSku,
  openOrder7003,
  openRoomOneAgain,
  openShipmentBombom,
  packingCardHeads,
  PACKING_7003,
  startWith9003,
  T0,
  type Line,
} from "./helpers";

/**
 * loop-08j QA 보강(04-qa). 개발 spec(`wholesale-backorder-packing.spec.ts`)이 안 본 것만 더 본다.
 * 1. S2-1 보강: 배분 응답 포장 id = 출고 탭이 그린 포장 대기 줄의 packingId(`GET /packing-items` 응답) = 주문 탭 카드 id.
 *    채팅은 포장 id를 안 그리므로 "(#7003)" 답과 같은 원본(`/packing-items`)을 본다.
 * 2. S2-3 보강: 삭제 뒤 미송 탭 SKU 행 미송 2와 펼침 카운터 가용재고 4(개발 spec은 9003 행 미송 수량만 봤다).
 * 3. S1-11 화면: 배분 뒤 주문 취소 버튼 0과 HTTP 취소 409, 포장 삭제 뒤 취소 버튼 다시 1(기획 §4-3 5).
 * 4. S1-11 ③ 화면: 7003을 먼저 취소하면 미송 탭 배분이 409 `BACKORDER_NOT_OPEN`, 거절 줄이 보이고 포장 0.
 *
 * 시계는 helpers `startWith9003`이 T0에 고정한다(reset 전). 고정 지연 0, 탭 사이 클라이언트 이동만.
 * `QA_SHOTS=1`이면 보고용 png를 `runs/loop-08j-backorder-packing/qa/`에도 남긴다(상대 경로, 저장소 루트 기준).
 */

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await startWith9003(page);
});

const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (process.env.QA_SHOTS === "1")
    await page.screenshot({
      path: `.claude/harness/runs/loop-08j-backorder-packing/qa/2026-11-07-${name}.png`,
    });
}

async function expectClockNearT0(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  expect(now).toBeGreaterThanOrEqual(T0.getTime());
  expect(now - T0.getTime()).toBeLessThan(30 * 60_000);
}

async function pagePost(
  page: Page,
  path: string,
): Promise<{ status: number; code: string | null }> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { method: "POST" });
    const json = (await response.json()) as { code?: string };
    return { status: response.status, code: json.code ?? null };
  }, path);
}

test("S2-1 보강: 응답 포장 id = 출고 탭 포장 대기 줄 packingId = 주문 탭 카드 id, 채팅 (#7003)", async ({
  page,
}) => {
  await openLinenSku(page);
  const allocation = await allocateLinen(page, 2);
  const packingId = allocation.packings[0]?.id;
  expect(allocation.packings.map((p) => p.orderId)).toEqual([7003]);

  const items = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/packing-items\?/.test(r.url()) &&
      r.request().method() === "GET",
  );
  const shipment = await openShipmentBombom(page);
  const rows = (
    (await (await items).json()) as {
      data: { packingId: number; orderId: number; qty: number }[];
    }
  ).data;
  expect(rows.map((r) => [r.packingId, r.orderId, r.qty])).toEqual([
    [packingId, 7003, 2],
  ]);
  await expect(
    shipment.getByRole("row").filter({ hasText: "린넨 셋업 자켓" }),
  ).toHaveCount(1);
  await shot(page, "S2-1-shipment");

  await openOrder7003(page);
  await expect(packingCardHeads(page)).toHaveText([
    new RegExp(`· id ${packingId}$`),
  ]);
  await shot(page, "S2-1-order");

  await openRoomOneAgain(page);
  await expectClockNearT0(page);
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  const reply = lines[0];
  if (reply === undefined) throw new Error("자동 답");
  await expect(
    bubbleOf(page, reply.sequence).getByText(PACKING_7003, { exact: true }),
  ).toHaveCount(1);
  await shot(page, "S2-1-chat");
});

test("S2-3 보강: 포장 삭제 뒤 미송 탭 SKU 행 미송 2, 펼침 가용재고 4, 채팅 보기 남은 2장", async ({
  page,
}) => {
  await openLinenSku(page);
  const allocation = await allocateLinen(page, 2);
  const packingId = allocation.packings[0]?.id;

  await openOrder7003(page);
  const deleted = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/wholesale/packings/${packingId}`) &&
      r.request().method() === "DELETE",
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  expect((await deleted).status()).toBe(204);
  await expect(packingCardHeads(page)).toHaveCount(0);

  await openLinenSku(page);
  // SKU 행: 펼침 열, SKU, 상품명, 색상, 사이즈, 미송 수량(6번째), 입고 예정
  const skuRow = page
    .getByRole("button", { name: "SKU 1-2 접기" })
    .locator("xpath=ancestor::tr[1]");
  await expect(skuRow.getByRole("cell").nth(5)).toHaveText("2");
  const detail = page.locator("#backorder-detail-3019");
  await expect(
    detail
      .getByText("가용재고", { exact: true })
      .locator("xpath=following-sibling::span[1]"),
  ).toHaveText("4");
  await expect(page.getByRole("textbox", { name: LINEN_INPUT })).toBeVisible();
  await shot(page, "S2-3-backorders");

  await openRoomOneAgain(page);
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["CLARIFY"]);
  const clarify = lines[0];
  if (clarify === undefined) throw new Error("되묻기");
  await expect(choiceItems(bubbleOf(page, clarify.sequence))).toHaveText([
    linenChoice(2),
    NOT_LISTED,
  ]);
});

test("S1-11 화면: 배분 뒤 7003 주문 취소 버튼 0, HTTP 취소 409 TRANSITION_NOT_ALLOWED, 포장 삭제 뒤 취소 버튼 1", async ({
  page,
}) => {
  await openLinenSku(page);
  await allocateLinen(page, 2);

  const order = await openOrder7003(page);
  await expect(order.getByRole("button", { name: "주문 확정" })).toBeVisible();
  await expect(order.getByRole("button", { name: "주문 취소" })).toHaveCount(0);
  await shot(page, "S1-11-no-cancel");
  expect(await pagePost(page, "/api/wholesale/orders/7003/cancel")).toEqual({
    status: 409,
    code: "TRANSITION_NOT_ALLOWED",
  });

  const deleted = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/packings\/\d+$/.test(r.url()) &&
      r.request().method() === "DELETE",
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  expect((await deleted).status()).toBe(204);
  await expect(order.getByRole("button", { name: "주문 취소" })).toHaveCount(1);
});

test("S1-11 ③ 화면: 7003 먼저 취소(200) → 미송 탭 9003 2장 배분 → 409 BACKORDER_NOT_OPEN, 거절 줄, 출고 탭 포장 대기 봄봄상회 없음", async ({
  page,
}) => {
  expect(await pagePost(page, "/api/wholesale/orders/7003/cancel")).toEqual({
    status: 200,
    code: null,
  });
  await openLinenSku(page);
  await page.getByRole("textbox", { name: LINEN_INPUT }).fill("2");
  const done = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/backorders\/allocations$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "배분 확정" }).click();
  const response = await done;
  expect(response.status()).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe(
    "BACKORDER_NOT_OPEN",
  );
  const alert = page.locator("#backorder-detail-3019").getByRole("alert");
  await expect(alert).toBeVisible();
  await shot(page, "S1-11-3-rejected");
  await expect(
    page.getByRole("button", { name: "SKU 1-2 접기" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "출고", exact: true }).click();
  await expect(page).toHaveURL(/\/shipments/);
  // 단계 칩 수가 그려진 뒤에 0을 본다(빈 화면에서 0이 먼저 통과하지 않게)
  await expect(page.getByText("포장 대기 (0)", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "봄봄상회 펼치기" }),
  ).toHaveCount(0);
});
