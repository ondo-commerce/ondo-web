import { expect, test, type Page } from "@playwright/test";
import {
  allocateLinen,
  ask,
  bubbleOf,
  choiceItems,
  LINEN_INPUT,
  LINEN_PRODUCT,
  linenChoice,
  log,
  nextKind,
  NOT_LISTED,
  openLinenSku,
  openOrder7003,
  openRoomOneAgain,
  openShipmentBombom,
  packingCardHeads,
  PACKING_7003,
  startWith9003,
  type Line,
} from "./helpers";

/**
 * #397 S2 미송 탭 배분이 만든 포장을 출고 탭, 주문 탭, 채팅 포장 답이 같이 본다(loop-08j 01-plan §4-3, §6 S2). 1280×800.
 *
 * 각 시험이 reset `{backorderIds: [9003]}`(방 1 열린 미송 = 9003 린넨 셋업 자켓 베이지/L 2장, 주문 7003)부터 시작한다.
 * 상태는 사용자 길(미송 탭 배분 확정, 주문 탭 포장 삭제)로만 바꾸고, 탭 사이는 주 메뉴 링크로 옮긴다.
 * 채팅 질문은 목 손잡이 incoming(소매 글 + 판정)이고, 기대는 응답 판정 줄 kind 배열과 방 화면 둘 다다.
 */

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await startWith9003(page);
});

const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

/** 질문 → [CLARIFY] 하나. 그 말풍선의 보기 줄이 [9003 보기, 다른 주문이에요]인지까지 */
async function expectClarify(page: Page, remaining: number): Promise<void> {
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["CLARIFY"]);
  const clarify = lines[0];
  if (clarify === undefined) throw new Error("되묻기");
  await expect(choiceItems(bubbleOf(page, clarify.sequence))).toHaveText([
    linenChoice(remaining),
    NOT_LISTED,
  ]);
}

test("S2-1 3019 2장 배분(201) → 출고 탭 포장 대기 린넨 줄 1개 수량 2 → '미송 언제 와요?' [AUTO_REPLY, HANDOFF] '(#7003)', 다음 형제 넘김 줄", async ({
  page,
}) => {
  await openLinenSku(page);
  const allocation = await allocateLinen(page, 2);
  expect(allocation.resolvedBackorderIds).toEqual([9003]);

  const shipment = await openShipmentBombom(page);
  const linenRows = shipment
    .getByRole("row")
    .filter({ hasText: LINEN_PRODUCT });
  await expect(linenRows).toHaveCount(1);
  // 수량은 표 끝 열
  await expect(linenRows.getByRole("cell").last()).toHaveText("2");

  await openRoomOneAgain(page);
  const { lines } = await ask(page);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(PACKING_7003);
  const reply = lines[0];
  if (reply === undefined) throw new Error("자동 답");
  const bubble = bubbleOf(page, reply.sequence);
  await expect(bubble).toHaveAttribute("data-kind", "AUTO_REPLY");
  await expect(bubble.getByText(PACKING_7003, { exact: true })).toHaveCount(1);
  await expect.poll(() => nextKind(bubble)).toBe("HANDOFF");
});

test("S2-2 1장 배분 → 주문 탭 7003 미송 1, 포장 카드 1장 id = 응답 포장 id, 주문 취소 0 → 질문 [CLARIFY] 남은 1장, 포장 답 0", async ({
  page,
}) => {
  await openLinenSku(page);
  const allocation = await allocateLinen(page, 1);
  const packingId = allocation.packings[0]?.id;
  expect(packingId, "배분 응답 packings[0].id").toBeDefined();

  const order = await openOrder7003(page);
  const linenLine = order.getByRole("row").filter({ hasText: LINEN_PRODUCT });
  await expect(linenLine).toHaveCount(1);
  // 가용재고(미송) 칸(8번째)의 괄호 안이 미송 수량
  await expect(
    linenLine.getByRole("cell").nth(7).locator(".text-muted-foreground"),
  ).toHaveText("(1)");

  await expect(packingCardHeads(page)).toHaveCount(1);
  await expect(packingCardHeads(page)).toHaveText(
    new RegExp(`· id ${packingId}$`),
  );
  // 버튼 줄이 그려졌다는 기준(신규 주문이라 확정은 남는다) 뒤에 취소 0
  await expect(order.getByRole("button", { name: "주문 확정" })).toBeVisible();
  await expect(order.getByRole("button", { name: "주문 취소" })).toHaveCount(0);

  await openRoomOneAgain(page);
  await expectClarify(page, 1);
  await expect(log(page).getByText("출고 준비 중인 주문")).toHaveCount(0);
});

test("S2-3 2장 배분 → 주문 탭 7003 포장 카드 삭제 → 미송 탭 3019 다시 있음, 9003 남은 2 → 질문 [CLARIFY] 남은 2장", async ({
  page,
}) => {
  await openLinenSku(page);
  const allocation = await allocateLinen(page, 2);
  const packingId = allocation.packings[0]?.id;
  expect(packingId, "배분 응답 packings[0].id").toBeDefined();

  await openOrder7003(page);
  await expect(packingCardHeads(page)).toHaveCount(1);
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
  await expect(packingCardHeads(page)).toHaveCount(0);

  await openLinenSku(page);
  // 배분 칸이 든 가장 가까운 행(펼침 확장행도 그 칸을 품어서 filter로는 둘이 잡힌다)
  const line9003 = page
    .getByRole("textbox", { name: LINEN_INPUT })
    .locator("xpath=ancestor::tr[1]");
  await expect(line9003).toHaveCount(1);
  const cells = line9003.getByRole("cell");
  // 미송 수량(5번째 칸)이 9003의 남은 수량. 잔여 미송 칸은 화면이 가용재고로 미리 채운 배분 칸을 뺀 값이라 안 본다
  await expect(cells.nth(4)).toHaveText("2");

  await openRoomOneAgain(page);
  await expectClarify(page, 2);
});
