import { expect, test, type Locator, type Page } from "@playwright/test";
import { confirmOrder } from "../loop-08i-chat-packing/helpers";
import {
  allocateLinen,
  LINEN_INPUT,
  openOrder7003,
  startWith9003,
  T0,
} from "../loop-08j-backorder-packing/helpers";
import {
  ask,
  availableCounter,
  bubbleOf,
  choiceItems,
  createPacking,
  DENIM_INPUT,
  DENIM_PRODUCT,
  L1,
  L3,
  L6,
  LINEN_PRODUCT,
  NOT_LISTED,
  openBackorders,
  openDenimSku,
  openOrder7002,
  openRoomOneAgain,
  packingCardHeads,
  skuRows,
  startDefault,
  type Line,
} from "./helpers";

/**
 * loop-08k QA 보강(04-qa). 개발 spec(`wholesale-order-packing-backorder.spec.ts`)이 안 본 것만 더 본다.
 * 1. S2-1 보강: 7002 포장 뒤 주문 탭 7002 데님 줄 가용재고(미송) "5 (-)", 미송 탭 데님 행 0, 채팅 보기 3. 세 화면이
 *    같은 미송 몫(0)을 말하는지 한 시험에서 본다. 보고용 png 2장(미송 탭, 채팅).
 * 2. S1-3 화면(확정 길 부분 포장): reset [9003] → 7003 확정 이번 출고 1(op) → 주문 탭 7003 린넨 줄 미송 1, 미송 탭
 *    린넨 SKU 행 미송 1, 펼침 9003 행 미송 1과 가용재고 3, 채팅 보기 [L3(1)] → 주문 탭 카드 삭제 → 미송 2, 가용 4.
 *    개발 e2e는 포장 준비 길만 화면으로 봤다(확정 길은 목 unit뿐).
 * 3. S1-4 화면: 확정 1로 남은 1이 된 9003에 미송 탭에서 2를 넣으면 배분 칸이 남은 수량 1로 잘린다.
 *    1장은 201, 그 뒤 미송 탭 린넨 행 0(이중 차감이면 가용 1, 행은 어차피 0이라 펼침 대신 주문 탭 카드 2장을 본다).
 * 4. S2-2 보강: 주문 탭 삭제로 되살린 9002를 미송 탭에서 다시 1장 배분 → 201, 데님 행 0, 주문 탭 카드 1장
 *    (되살림 뒤 기록이 남아 두 번 되살리지 않는지는 그 카드 삭제 → 9002 남은 1, 가용 6으로 본다).
 *
 * 시계는 helpers가 reset 전에 T0로 고정한다. 고정 지연 0, 탭 사이 클라이언트 이동만.
 * `QA_SHOTS=1`이면 보고용 png를 `runs/loop-08k-order-packing-backorder/qa/`에도 남긴다(저장소 루트 기준 상대 경로).
 */

test.use({ viewport: { width: 1280, height: 800 } });

const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (process.env.QA_SHOTS === "1")
    await page.screenshot({
      path: `.claude/harness/runs/loop-08k-order-packing-backorder/qa/2026-11-07-${name}.png`,
    });
}

async function expectClockNearT0(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  expect(now).toBeGreaterThanOrEqual(T0.getTime());
  expect(now - T0.getTime()).toBeLessThan(30 * 60_000);
}

/** 질문 → [CLARIFY] 하나. 그 말풍선의 보기 줄 */
async function clarifyChoices(page: Page): Promise<Locator> {
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["CLARIFY"]);
  const clarify = lines[0];
  if (clarify === undefined) throw new Error("되묻기");
  return choiceItems(bubbleOf(page, clarify.sequence));
}

/** 주문 탭 펼친 주문의 상품 줄 가용재고(미송) 칸(8번째) */
function assignableCell(order: Locator, product: string): Locator {
  return order
    .getByRole("row")
    .filter({ hasText: product })
    .getByRole("cell")
    .nth(7);
}

/** 미송 탭 SKU 행의 미송 수량 칸. 펼침 열(td) 다음 SKU, 상품, 색상, 사이즈, 미송 순이라 6번째 */
function skuBackorderCell(page: Page, product: string): Locator {
  return skuRows(page, product).first().getByRole("cell").nth(5);
}

/** 주문 탭 포장 카드 `삭제` 한 번. 204 단언 */
async function deleteOnlyCard(page: Page, packingId: number): Promise<void> {
  const deleted = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/wholesale/packings/${packingId}`) &&
      r.request().method() === "DELETE",
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  expect((await deleted).status(), "포장 삭제").toBe(204);
}

test("QA-1 S2-1 보강: 7002 포장 → 주문 탭 7002 데님 5 (-), 미송 탭 데님 0 린넨 1, 채팅 보기 [L1, L6, L3(2)]", async ({
  page,
}) => {
  await startDefault(page);
  await expectClockNearT0(page);
  await createPacking(page, 7002, 8002, 1);

  const order = await openOrder7002(page);
  await expect(assignableCell(order, DENIM_PRODUCT)).toHaveText(/^5\s*\(-\)$/);

  await openBackorders(page);
  await expect(skuRows(page, LINEN_PRODUCT)).toHaveCount(1);
  await expect(skuRows(page, DENIM_PRODUCT)).toHaveCount(0);
  await shot(page, "s2-1-backorders");

  await openRoomOneAgain(page);
  const choices = await clarifyChoices(page);
  await expect(choices).toHaveText([L1, L6, L3(2), NOT_LISTED]);
  await shot(page, "s2-1-chat");
});

test("QA-2 확정 길 부분 포장 화면: 7003 확정 1 → 주문 탭 미송 1, 미송 탭 행 1 펼침 미송 1 가용 3, 보기 [L3(1)] → 카드 삭제 → 미송 2 가용 4", async ({
  page,
}) => {
  await startWith9003(page);
  await expectClockNearT0(page);
  await confirmOrder(page, 7003, 8003, 1);

  const order = await openOrder7003(page);
  // 가용재고 3, 미송 1. 이번 출고 칸이 기본값을 채우면 화살표가 붙을 수 있어 앞 숫자와 괄호 안만 본다
  await expect(assignableCell(order, LINEN_PRODUCT)).toHaveText(/^3\b.*\(1\b/);
  await expect(packingCardHeads(page)).toHaveCount(1);
  const head = await packingCardHeads(page).first().textContent();
  const packingId = Number(/id (\d+)$/.exec(head ?? "")?.[1] ?? NaN);
  expect(Number.isInteger(packingId), `카드 머리 ${head}`).toBe(true);

  await openBackorders(page);
  await expect(skuRows(page, LINEN_PRODUCT)).toHaveCount(1);
  await expect(skuBackorderCell(page, LINEN_PRODUCT)).toHaveText("1");
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  const detail = page.locator("#backorder-detail-3019");
  const line9003 = detail
    .getByRole("textbox", { name: LINEN_INPUT })
    .locator("xpath=ancestor::tr[1]");
  await expect(line9003.getByRole("cell").nth(4)).toHaveText("1");
  await expect(availableCounter(detail)).toHaveText("3");
  await shot(page, "qa-2-linen-half");

  await openRoomOneAgain(page);
  const choices = await clarifyChoices(page);
  await expect(choices).toHaveText([L3(1), NOT_LISTED]);

  await openOrder7003(page);
  await deleteOnlyCard(page, packingId);
  await expect(packingCardHeads(page)).toHaveCount(0);

  await openBackorders(page);
  await expect(skuBackorderCell(page, LINEN_PRODUCT)).toHaveText("2");
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  await expect(
    availableCounter(page.locator("#backorder-detail-3019")),
  ).toHaveText("4");
});

test("QA-3 확정 1 뒤 미송 탭 9003 배분 칸에 2 → 칸이 1로 잘림, 1장 배분 201 → 린넨 행 0, 주문 탭 카드 2장", async ({
  page,
}) => {
  await startWith9003(page);
  await confirmOrder(page, 7003, 8003, 1);

  await openBackorders(page);
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  const input = page.getByRole("textbox", { name: LINEN_INPUT });
  await input.fill("2");
  // 배분 칸 상한은 남은 수량이다(06 화면 규칙). 2를 넣어도 1이어야 한다
  await expect(input).toHaveValue("1");

  const allocation = await allocateLinen(page, 1);
  expect(allocation.resolvedBackorderIds).toEqual([9003]);
  await expect(skuRows(page, LINEN_PRODUCT)).toHaveCount(0);

  await openOrder7003(page);
  await expect(packingCardHeads(page)).toHaveCount(2);
});

test("QA-4 S2-2 보강: 주문 탭 삭제로 되살린 9002를 미송 탭에서 다시 배분 → 데님 행 0, 카드 1 → 그 카드 삭제 → 9002 남은 1, 가용 6", async ({
  page,
}) => {
  await startDefault(page);
  const packing = await createPacking(page, 7002, 8002, 1);
  await openOrder7002(page);
  await deleteOnlyCard(page, packing.id);
  await expect(packingCardHeads(page)).toHaveCount(0);

  await openBackorders(page);
  const detail = await openDenimSku(page);
  await detail.getByRole("textbox", { name: DENIM_INPUT }).fill("1");
  const done = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/backorders\/allocations$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "배분 확정" }).click();
  const response = await done;
  expect(response.status(), "배분 확정").toBe(201);
  const body = (await response.json()) as {
    data: { packings: { id: number }[]; resolvedBackorderIds: number[] };
  };
  expect(body.data.resolvedBackorderIds).toEqual([9002]);
  const again = body.data.packings[0]?.id ?? -1;
  await expect(skuRows(page, DENIM_PRODUCT)).toHaveCount(0);

  await openOrder7002(page);
  await expect(packingCardHeads(page)).toHaveText([new RegExp(`id ${again}$`)]);
  await deleteOnlyCard(page, again);

  await openBackorders(page);
  await expect(skuRows(page, DENIM_PRODUCT)).toHaveCount(1);
  const reopened = await openDenimSku(page);
  const line9002 = reopened
    .getByRole("textbox", { name: DENIM_INPUT })
    .locator("xpath=ancestor::tr[1]");
  await expect(line9002.getByRole("cell").nth(4)).toHaveText("1");
  await expect(availableCounter(reopened)).toHaveText("6");
});
