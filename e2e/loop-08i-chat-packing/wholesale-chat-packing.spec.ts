import { expect, test, type Locator, type Page } from "@playwright/test";
import { roomList } from "../loop-04-chat/helpers";
import {
  ask,
  bubbleOf,
  confirmOrder,
  createOutbound,
  createPacking,
  deletePacking,
  handoffLines,
  kindsAfter,
  log,
  nextKind,
  openRoomOne,
  PACKING_ONE,
  resetChat,
  shipOutbound,
  type Line,
} from "./helpers";

/**
 * #391 S2-7 S2-8 도매 화면에서 본 포장 답(loop-08i 01-plan §4-3, §6). 1280×800.
 *
 * 각 시험이 reset `{noBackorders: true}`(미송 0)부터 시작하고, 상태는 사용자 길과 같은 op로 바꾼다:
 * 7002(데님 소라/M 1장, 확정, 미배분 1) 포장 준비, 7003(린넨 베이지/L 2장, 신규) 확정(이번 출고 2), 봉투, 출고, 삭제.
 * 단계 기대는 incoming 응답의 판정 줄 kind 배열과 화면(그 소매 글 뒤 형제 요소) 둘 다다.
 */

test.use({ viewport: { width: 1280, height: 800 } });

const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

/** 자동 답 말풍선 하나: 본문, 근거 칸 값 줄 0 + 끝 줄 "14:20 조회", 바로 아래 넘김 줄 */
async function expectPackingBubble(
  page: Page,
  reply: Line,
  body: string,
): Promise<void> {
  const bubble = bubbleOf(page, reply.sequence);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-kind", "AUTO_REPLY");
  await expect(bubble.getByText(body, { exact: true })).toHaveCount(1);
  const seen = bubble.locator('[data-ac="S7-13 S3-5"]');
  await expect(seen).toHaveText("14:20 조회");
  // 근거 칸 = 조회 시각 줄의 부모. 값 줄(재고, 미송, 미수)이 없으니 자식은 조회 시각 줄 하나뿐
  expect(await seen.evaluate((el) => el.parentElement?.children.length)).toBe(
    1,
  );
  expect(await nextKind(bubble)).toBe("HANDOFF");
}

test("S2-7 7002 포장 → '미송 언제 와요?' → [AUTO_REPLY, HANDOFF], '(#7002)', 근거 값 줄 0, 14:20 조회, 바로 아래 넘김 줄 1", async ({
  page,
}) => {
  await openRoomOne(page);
  const handoffsBefore = await handoffLines(page).count();
  await createPacking(page, 7002, 8002, 1);

  const { question, lines } = await ask(page);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(PACKING_ONE);
  expect(lines[1]?.handoff).toMatchObject({
    reason: "NO_BACKORDER",
    intent: "BACKORDER",
  });
  const reply = lines[0];
  if (reply === undefined) throw new Error("자동 답");
  await expectPackingBubble(page, reply, PACKING_ONE);
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["AUTO_REPLY", "HANDOFF"]);
  await expect(handoffLines(page)).toHaveCount(handoffsBefore + 1);
});

/** S2-8 ① 준비: 7002 포장 + 7003 확정(이번 출고 2) 포장 + 7003 줄로 봉투. 봉투 id */
async function twoOrdersReady(page: Page): Promise<number> {
  await createPacking(page, 7002, 8002, 1);
  const itemIds = await confirmOrder(page, 7003, 8003, 2);
  return createOutbound(page, itemIds);
}

test("S2-8 ① 7002 READY + 7003 봉투(출고 전) → '출고 준비 중인 주문 2건이 있어요(#7002, #7003)'", async ({
  page,
}) => {
  await openRoomOne(page);
  await twoOrdersReady(page);
  const { question, lines } = await ask(page);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  const body = "출고 준비 중인 주문 2건이 있어요(#7002, #7003)";
  expect(lines[0]?.body).toBe(body);
  const reply = lines[0];
  if (reply === undefined) throw new Error("자동 답");
  await expectPackingBubble(page, reply, body);
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["AUTO_REPLY", "HANDOFF"]);
});

test("S2-8 ② ① 뒤 7003 봉투 출고 → 다음 질문 [AUTO_REPLY, HANDOFF] '(#7002)'", async ({
  page,
}) => {
  await openRoomOne(page);
  const outbound = await twoOrdersReady(page);
  const first = await ask(page);
  expect(kinds(first.lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);

  await shipOutbound(page, outbound);
  const { question, lines } = await ask(page);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(PACKING_ONE);
  const reply = lines[0];
  if (reply === undefined) throw new Error("자동 답");
  await expectPackingBubble(page, reply, PACKING_ONE);
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["AUTO_REPLY", "HANDOFF"]);
});

test("S2-8 ③ 7002 포장 → 삭제 → [HANDOFF], 그 소매 글 뒤 자동 답 말풍선 0", async ({
  page,
}) => {
  await openRoomOne(page);
  const packing = await createPacking(page, 7002, 8002, 1);
  await deletePacking(page, packing.id);

  const { question, lines } = await ask(page);
  expect(kinds(lines)).toEqual(["HANDOFF"]);
  expect(lines[0]?.handoff?.reason).toBe("NO_BACKORDER");
  await expect(bubbleOf(page, question.sequence)).toBeVisible();
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["HANDOFF"]);
  expect(await kindsAfter(page, question.sequence)).not.toContain("AUTO_REPLY");
});

/** #392 Q5 ②(D57)가 고른 NO_BACKORDER 이유 줄과 바뀌기 전 글 */
const REASON_NEXT = "열린 미송이 없어요. 언제 받을 수 있는지 알려 주세요";
const REASON_OLD = "열린 미송이 없는 소매처예요";

/** 그 말풍선 바로 다음 형제(넘김 note)의 이유 줄 */
function reasonAfter(bubble: Locator): Locator {
  return bubble
    .locator("xpath=following-sibling::*[1]")
    .locator("[data-reason-text]");
}

test("S3-2 포장 답 뒤 넘김과 포장 없는 넘김의 이유 줄이 같은 새 글, 옛 글 0", async ({
  page,
}) => {
  // ① S2-7 준비: 7002 포장 → 질문 → 자동 답 바로 아래 넘김 줄의 이유 줄
  await openRoomOne(page);
  await createPacking(page, 7002, 8002, 1);
  const first = await ask(page);
  expect(kinds(first.lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(first.lines[1]?.handoff?.reason).toBe("NO_BACKORDER");
  const reply = first.lines[0];
  if (reply === undefined) throw new Error("자동 답");
  await expect(reasonAfter(bubbleOf(page, reply.sequence))).toHaveText(
    REASON_NEXT,
  );
  await expect(log(page).getByText(REASON_OLD)).toHaveCount(0);

  // ② 같은 시험에서 포장 없는 새 reset. 목은 페이지 안이라 문서를 다시 열어 화면을 비우고 `{noBackorders: true}`만
  // (방이 시드로 돌아가 sequence가 다시 시작하므로, 문서를 그대로 두면 앞 말과 번호가 겹친다)
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await resetChat(page, { noBackorders: true });
  await expect(log(page)).toBeVisible();
  const handoffsBefore = await handoffLines(page).count();

  const second = await ask(page);
  expect(kinds(second.lines)).toEqual(["HANDOFF"]);
  expect(second.lines[0]?.handoff?.reason).toBe("NO_BACKORDER");
  await expect
    .poll(() => kindsAfter(page, second.question.sequence))
    .toEqual(["HANDOFF"]);
  await expect(handoffLines(page)).toHaveCount(handoffsBefore + 1);
  await expect(
    reasonAfter(bubbleOf(page, second.question.sequence)),
  ).toHaveText(REASON_NEXT);
  await expect(log(page).getByText(REASON_OLD)).toHaveCount(0);
});
