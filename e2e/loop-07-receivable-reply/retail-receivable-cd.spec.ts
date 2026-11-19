import { expect, test, type Page } from "@playwright/test";
import {
  ASK_RECEIVABLE,
  assertStubServers,
  bodyOf,
  cardLines,
  messageBySequence,
  mock,
  openRoomById,
  receivableCard,
  say,
  seenOf,
  settlementLink,
  start,
  waitLinesAfter,
} from "./helpers";

/**
 * #268 S2-2 — 소매 미수 카드 C(갚을 돈 없음), D(선수금)가 화면에 그려지는지(loop-07 codex-meta M5).
 * derive unit만으로는 컴포넌트가 C에서 null을 돌려도 통과했다. 와이어프레임 `18_retail-chat` `#state-rc-card` C, D.
 *
 * 소매 번들엔 정산 핸들러가 없어 소매 채팅 목 손잡이 `/__mock/chat/payment`로 같은 장부(도매처 101)에 입금을 넣는다.
 * 시드 미수 = 주문 7004 37,500원. 37,500 전액 배분 → C, 50,000 중 37,500 배분 → D 선수금 12,500.
 */

assertStubServers();

/** 방 1에서 입금을 넣고 미수를 묻는다. 그 질문 뒤 새 줄이 자동 답 하나뿐인지까지 보고 그 말풍선을 돌려준다 */
async function askAfterPayment(page: Page, amount: number) {
  await start(page, "/");
  await openRoomById(page, 1);
  await mock(page, "payment", {
    amount,
    allocations: [{ orderId: 7004, amount: 37_500 }],
  });
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  expect(after.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  return messageBySequence(page, after[0]?.sequence ?? -1);
}

/** 카드 안 굵은 글자들(화면 순서) */
function strongTexts(page: Page, sequence: number) {
  return receivableCard(messageBySequence(page, sequence))
    .locator("b")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
}

test("S2-2 C 37,500 전액 배분 뒤 → 본문 '지금 갚을 돈은 없어요', 카드 '갚을 돈 없음' 한 줄, 정산 링크, 14:20 조회", async ({
  page,
}) => {
  const reply = await askAfterPayment(page, 37_500);
  await expect(bodyOf(reply)).toHaveText("지금 갚을 돈은 없어요");
  const card = receivableCard(reply);
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  expect(await cardLines(card)).toEqual(["갚을 돈 없음"]);
  const sequence = Number(await reply.getAttribute("data-sequence"));
  expect(await strongTexts(page, sequence)).toEqual(["갚을 돈 없음"]);
  await expect(settlementLink(card)).toHaveAttribute(
    "href",
    "/settlements?wholesaler=101",
  );
  await expect(seenOf(reply)).toHaveText("14:20 조회");
  /* 앞 금액이 새 말풍선에 남지 않는다 */
  await expect(reply).not.toContainText("37,500");
  await expect(reply).not.toContainText("선수금");
});

test("S2-2 D 50,000 중 37,500 배분 뒤 → 본문 선수금 12,500원, 카드 '갚을 돈 없음' / '선수금 12,500원'", async ({
  page,
}) => {
  const reply = await askAfterPayment(page, 50_000);
  await expect(bodyOf(reply)).toHaveText(
    "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 12,500원이 남아 있어요",
  );
  const card = receivableCard(reply);
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  expect(await cardLines(card)).toEqual(["갚을 돈 없음", "선수금 12,500원"]);
  const sequence = Number(await reply.getAttribute("data-sequence"));
  expect(await strongTexts(page, sequence)).toEqual([
    "갚을 돈 없음",
    "12,500원",
  ]);
  await expect(settlementLink(card)).toBeVisible();
  await expect(seenOf(reply)).toHaveText("14:20 조회");
  await expect(reply).not.toContainText("37,500");
  await expect(reply).not.toContainText("연체");
});
