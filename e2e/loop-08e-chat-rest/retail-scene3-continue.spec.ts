import { expect, test } from "@playwright/test";
import {
  ASK_RECEIVABLE,
  assertStubServers,
  bodyOf,
  cancelAllocation,
  cardLines,
  handoffLines,
  messageBySequence,
  openRoomById,
  payAndAllocate,
  receivableCard,
  receivableCards,
  say,
  start,
  waitLinesAfter,
} from "./helpers";

/**
 * #360 S1-4 — 장면 3 소매 이어 받기(기획 §4-5, 08c S4-9). 무드온(101) x 봄봄상회(1), 시드 주문 7004 미수 37,500.
 * 정산 상태는 소매 채팅 목 손잡이(`payment`, `allocation-cancel`)로 바꾼다 — 소매 번들엔 정산 핸들러가 없다.
 *
 * 순서: reset → 37,500 배분 입금 → 질문 → 갚을 돈 0 → 그 배분 취소(선수금 37,500 + 미수 37,500) → 질문 → 넘김 →
 * 입금 10,000 + 배분 37,500(이번 10,000 + 선수금 27,500) → 질문 → 갚을 돈 0, 선수금 10,000.
 *
 * 둘째 답의 넘김 이유(AMOUNT_UNSURE, 미수와 선수금이 같이 있음)는 소매 화면과 소매 응답에 칸이 없다(loop-07 QA-R1).
 * 여기선 넘김 줄 1개와 금액 0까지만 본다. 이유는 목 판정 unit(`toReceivableFacts` MIXED_BALANCE)이 지킨다.
 * 셀렉터는 07 미수 helpers의 것(`data-kind`, `data-receivable-card`)을 쓴다 — 이 장면은 새 화면 요소가 없어 08e
 * `data-ac`가 없다.
 */

assertStubServers();

const ORDER = 7004;
const DUE = 37_500;

test("S1-4 장면 3 소매 이어 받기: 갚을 돈 0 → 배분 취소 뒤 넘김 → 입금 10,000 + 배분 37,500 뒤 갚을 돈 0, 선수금 10,000", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);

  /* 1. 37,500 전액 배분 → 갚을 돈 0(C) */
  const first = await payAndAllocate(page, DUE, [
    { orderId: ORDER, amount: DUE },
  ]);
  expect(first.allocations).toHaveLength(1);
  const allocationId = first.allocations[0]?.id ?? -1;

  await say(page, ASK_RECEIVABLE);
  const afterFirst = await waitLinesAfter(page, ASK_RECEIVABLE, 1, 1);
  expect(afterFirst.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  const zero = messageBySequence(page, afterFirst[0]?.sequence ?? -1);
  await expect(bodyOf(zero)).toHaveText("지금 갚을 돈은 없어요");
  expect(await cardLines(receivableCard(zero))).toEqual(["갚을 돈 없음"]);

  /* 2. 그 배분 취소 → 미수 37,500과 선수금 37,500이 같이 있다 → 금액 없이 넘김 */
  const cancelled = await cancelAllocation(page, allocationId);
  expect(cancelled).toMatchObject({ allocationId, prepaidRemaining: DUE });

  await say(page, ASK_RECEIVABLE);
  const afterCancel = await waitLinesAfter(page, ASK_RECEIVABLE, 1, 2);
  expect(afterCancel.map((l) => l.kind)).toEqual(["HANDOFF"]);
  expect(afterCancel[0]?.text).toContain("사장님께 전달했어요");
  expect(afterCancel[0]?.text).not.toMatch(/\d+,\d{3}원/);
  await expect(handoffLines(page)).toHaveCount(1);
  await expect(receivableCards(page)).toHaveCount(1);

  /* 3. 입금 10,000에 배분 37,500 → 이번 10,000 먼저, 모자란 27,500은 옛 입금(선수금)에서 */
  const second = await payAndAllocate(page, 10_000, [
    { orderId: ORDER, amount: DUE },
  ]);
  expect(second.allocations.map((a) => [a.paymentId, a.amount])).toEqual([
    [second.id, 10_000],
    [first.id, 27_500],
  ]);
  expect(second.prepaidRemaining).toBe(10_000);

  await say(page, ASK_RECEIVABLE);
  const afterSecond = await waitLinesAfter(page, ASK_RECEIVABLE, 1, 3);
  /* 넘김이 열린 채라 금액 답만 나간다(넘김 줄 더 없음, 07 S2-4와 같다) */
  expect(afterSecond.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  const prepaid = messageBySequence(page, afterSecond[0]?.sequence ?? -1);
  await expect(bodyOf(prepaid)).toHaveText(
    "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 10,000원이 남아 있어요",
  );
  expect(await cardLines(receivableCard(prepaid))).toEqual([
    "갚을 돈 없음",
    "선수금 10,000원",
  ]);
  await expect(prepaid).not.toContainText("37,500");
  await expect(handoffLines(page)).toHaveCount(1);
  await expect(receivableCards(page)).toHaveCount(2);
});
