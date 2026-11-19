import { expect, test, type Page } from "@playwright/test";
import {
  ask,
  availableCounter,
  bubbleOf,
  choiceItems,
  createPacking,
  DENIM_INPUT,
  DENIM_PRODUCT,
  L1,
  L2,
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
 * #402 S2 주문 탭 포장이 미송 탭과 채팅 보기에서 빠지고, 포장 삭제가 되돌린다(loop-08k 01-plan §4-3, §6 S2). 1280×800.
 *
 * 각 시험이 기본 reset(방 1 열린 미송 9001 9002 9006 9003)부터 시작해 7002 줄 8002를 1장 `포장 준비`(op)한다.
 * 그 뒤 상태는 사용자 길(주문 탭 포장 카드 삭제)로만 바꾸고 탭 사이는 주 메뉴 링크로 옮긴다.
 * 채팅 질문은 목 손잡이 incoming(소매 글 + 판정)이고, 기대는 응답 kind 배열과 방 화면 보기 글자 둘 다다.
 */

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await startDefault(page);
});

const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

/** 질문 → [CLARIFY] 하나. 그 말풍선의 보기 줄 Locator */
async function clarifyChoices(page: Page) {
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["CLARIFY"]);
  const clarify = lines[0];
  if (clarify === undefined) throw new Error("되묻기");
  return choiceItems(bubbleOf(page, clarify.sequence));
}

test("S2-1 7002 포장 준비(201) → 미송 탭 와이드 데님 팬츠 행 0, 린넨 셋업 자켓 행 1 → 질문 [CLARIFY] 보기 [L1, L6, L3(2)], #7002 보기 0", async ({
  page,
}) => {
  await createPacking(page, 7002, 8002, 1);

  await openBackorders(page);
  // 린넨 행이 그려진 뒤에 데님 0을 본다(목록이 안 그려진 0과 가르려고)
  await expect(skuRows(page, LINEN_PRODUCT)).toHaveCount(1);
  await expect(skuRows(page, DENIM_PRODUCT)).toHaveCount(0);

  await openRoomOneAgain(page);
  const choices = await clarifyChoices(page);
  await expect(choices).toHaveText([L1, L6, L3(2), NOT_LISTED]);
  await expect(choices.filter({ hasText: "#7002" })).toHaveCount(0);
});

test("S2-2 같은 준비 → 주문 탭 7002 포장 카드 삭제(204) → 미송 탭 와이드 데님 팬츠 행 1, 9002 남은 1, 가용재고 6 → 질문 [CLARIFY] 보기에 L2 1개", async ({
  page,
}) => {
  const packing = await createPacking(page, 7002, 8002, 1);

  const order = await openOrder7002(page);
  const denimLine = order.getByRole("row").filter({ hasText: DENIM_PRODUCT });
  await expect(denimLine).toHaveCount(1);
  // 포장 뒤 가용재고(미송) 칸(8번째): 가용 5, 미송 없음
  await expect(denimLine.getByRole("cell").nth(7)).toHaveText(/^5\s*\(-\)$/);
  await expect(packingCardHeads(page)).toHaveText([
    new RegExp(`· id ${packing.id}$`),
  ]);

  const deleted = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/wholesale/packings/${packing.id}`) &&
      r.request().method() === "DELETE",
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  expect((await deleted).status(), "포장 삭제").toBe(204);
  await expect(packingCardHeads(page)).toHaveCount(0);

  await openBackorders(page);
  await expect(skuRows(page, DENIM_PRODUCT)).toHaveCount(1);
  const detail = await openDenimSku(page);
  // 배분 칸이 든 가장 가까운 행 = 9002. 미송 수량(5번째 칸)이 남은 수량
  const line9002 = detail
    .getByRole("textbox", { name: DENIM_INPUT })
    .locator("xpath=ancestor::tr[1]");
  await expect(line9002).toHaveCount(1);
  await expect(line9002.getByRole("cell").nth(4)).toHaveText("1");
  // 삭제가 예약을 되돌림: 재고 6 − 예약 0
  await expect(availableCounter(detail)).toHaveText("6");

  await openRoomOneAgain(page);
  const choices = await clarifyChoices(page);
  await expect(choices.filter({ hasText: L2 })).toHaveCount(1);
  await expect(choices).toHaveText([L1, L2, L6, L3(2), NOT_LISTED]);
});
