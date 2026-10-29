import { expect, test, type Page } from "@playwright/test";
import {
  ASK_DISCOUNT,
  ASK_RECEIVABLE,
  assertStubServers,
  bodyOf,
  cardLines,
  handoffLines,
  incoming,
  linesAfter,
  messageBySequence,
  openRoomById,
  PAYMENT_REPORT,
  receivableCard,
  receivableCards,
  say,
  SCENE3_BODY,
  seenOf,
  settlementLink,
  start,
  waitLinesAfter,
} from "./helpers";

/**
 * #268 S2 — 소매 미수 답 카드와 장면 3 소매 절반. 와이어프레임 `18_retail-chat`(data-loop="07") `#state-rc-card`
 * `#state-rc-link` `#state-rc-handoff` `#state-rc-seen` `#state-scene3`.
 *
 * 금액은 소매 채팅 목이 정산 목 요약 함수(`receivableSummary`)로 그때그때 읽는다. 소매 정산 화면은 가짜 API(무드온
 * 52,000원)라 채팅 금액과 다르다 — 링크는 주소만 보고 정산 화면엔 들어가지 않는다(기획 §2-1).
 */

assertStubServers();

/** 방을 열고 미수를 묻는다. 그 질문 뒤 새 줄이 자동 답 하나뿐인지까지 보고 그 말풍선을 돌려준다 */
async function askReceivable(page: Page, roomId = 1) {
  await start(page, "/");
  await openRoomById(page, roomId);
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  expect(after.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  const sequence = after[0]?.sequence;
  expect(sequence).not.toBeNull();
  return messageBySequence(page, sequence ?? -1);
}

test("S2-1 방 1 '지금 미수 얼마예요?' → 새 말풍선 1개: 본문, 갚을 돈 37,500원, 기한 지남 1건 37,500원 (최대 54일), 14:20 조회, 선수금 줄 0", async ({
  page,
}) => {
  const reply = await askReceivable(page, 1);
  await expect(bodyOf(reply)).toHaveText(SCENE3_BODY);
  const card = receivableCard(reply);
  await expect(card).toHaveCount(1);
  expect(await cardLines(card)).toEqual([
    "갚을 돈 37,500원",
    "기한 지남 1건 37,500원 (최대 54일)",
  ]);
  await expect(card).not.toContainText("선수금");
  await expect(seenOf(reply)).toHaveText("14:20 조회");
  /* 소매 화면에 "연체" 낱말 없음(디자인 결정 41) */
  await expect(reply).not.toContainText("연체");
});

test("S2-1 방 33(도매처 102) → 갚을 돈 52,000원, 기한 지난 것 없음, 새 말풍선에 '37,500' 0", async ({
  page,
}) => {
  const reply = await askReceivable(page, 33);
  await expect(bodyOf(reply)).toHaveText(
    "갚을 돈은 52,000원이에요. 기한 지난 것은 없어요",
  );
  expect(await cardLines(receivableCard(reply))).toEqual([
    "갚을 돈 52,000원",
    "기한 지난 것 없음",
  ]);
  await expect(reply).not.toContainText("37,500");
  await expect(seenOf(reply)).toHaveText("14:20 조회");
});

test("S2-3 정산 링크 href(101, 방 33은 102), 390 에서 잘림 0, 중심점이 링크 안, 높이 44 이상", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reply = await askReceivable(page, 1);
  const link = settlementLink(receivableCard(reply));
  await expect(link).toHaveAttribute("href", "/settlements?wholesaler=101");
  await link.scrollIntoViewIfNeeded();

  const geometry = await link.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      height: rect.height,
      cut: node.scrollWidth > node.clientWidth,
      hitInside: hit !== null && node.contains(hit),
    };
  });
  expect(geometry.cut).toBe(false);
  expect(geometry.hitInside).toBe(true);
  expect(geometry.height).toBeGreaterThanOrEqual(44);

  /* 카드 줄도 잘리지 않는다(줄바꿈만) */
  const cutLines = await receivableCard(reply)
    .locator("[data-line]")
    .evaluateAll(
      (nodes) => nodes.filter((n) => n.scrollWidth > n.clientWidth).length,
    );
  expect(cutLines).toBe(0);

  /* 방 33 은 그 방 도매처(102) */
  await page.getByRole("link", { name: "채팅 목록", exact: true }).click();
  await expect(page).toHaveURL("/chats");
  await page.locator('a[data-room-id="33"]').click();
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  const reply33 = messageBySequence(page, after[0]?.sequence ?? -1);
  await expect(settlementLink(receivableCard(reply33))).toHaveAttribute(
    "href",
    "/settlements?wholesaler=102",
  );
});

test("S2-4 장면 3 소매 절반: 미수 → 깎아 달라 → 넘김 줄 1 → 다시 미수(금액 같음, 넘김 총 1) → 사장 답 말풍선", async ({
  page,
}) => {
  const first = await askReceivable(page, 1);
  expect(await cardLines(receivableCard(first))).toEqual([
    "갚을 돈 37,500원",
    "기한 지남 1건 37,500원 (최대 54일)",
  ]);

  await say(page, ASK_DISCOUNT);
  const afterDiscount = await waitLinesAfter(page, ASK_DISCOUNT, 1);
  expect(afterDiscount.map((l) => l.kind)).toEqual(["HANDOFF"]);
  expect(afterDiscount[0]?.text).toContain("사장님께 전달했어요");
  /* 소매엔 넘긴 이유 글이 없다(기획 §3 out 4) */
  expect(afterDiscount[0]?.text).not.toContain("가격, 외상");
  await expect(handoffLines(page)).toHaveCount(1);

  /* 열린 넘김 중 미수 질문은 금액만 나간다(넘김 줄 없음) */
  await say(page, ASK_RECEIVABLE);
  const again = await waitLinesAfter(page, ASK_RECEIVABLE, 1, 2);
  expect(again.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  const second = messageBySequence(page, again[0]?.sequence ?? -1);
  await expect(bodyOf(second)).toHaveText(SCENE3_BODY);
  expect(await cardLines(receivableCard(second))).toEqual([
    "갚을 돈 37,500원",
    "기한 지남 1건 37,500원 (최대 54일)",
  ]);
  await expect(handoffLines(page)).toHaveCount(1);

  /* 도매 사장 답 — polling으로 온다 */
  const ownerReply = "이번 달 말까지 넣어 주시면 돼요";
  await incoming(page, 1, ownerReply);
  await expect
    .poll(async () =>
      (await linesAfter(page, ASK_RECEIVABLE, 2)).map((l) => [
        l.kind,
        l.sender,
      ]),
    )
    .toEqual([
      ["AUTO_REPLY", "WHOLESALER"],
      ["TEXT", "WHOLESALER"],
    ]);
  const lines = await linesAfter(page, ASK_RECEIVABLE, 2);
  await expect(messageBySequence(page, lines[1]?.sequence ?? -1)).toContainText(
    ownerReply,
  );
});

test("S2-4 reset 뒤 '방금 입금했어요' → 새 줄 = 넘김 줄 1뿐, 미수 카드 0", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);
  await say(page, PAYMENT_REPORT);
  const after = await waitLinesAfter(page, PAYMENT_REPORT, 1);
  expect(after.map((l) => l.kind)).toEqual(["HANDOFF"]);
  expect(after[0]?.text).toContain("사장님께 전달했어요");
  await expect(receivableCards(page)).toHaveCount(0);
  await expect(handoffLines(page)).toHaveCount(1);
});

test("S2-5 시계를 다음 날 09:00 으로 옮기면 같은 말풍선이 '10/29 14:20 조회'", async ({
  page,
}) => {
  const reply = await askReceivable(page, 1);
  await expect(seenOf(reply)).toHaveText("14:20 조회");
  /* 방의 지금 시각은 15초마다 갱신된다(useNow). 18시간 40분을 건너뛰면 그 타이머가 다시 돌고 새 날짜로 그린다 */
  await page.clock.fastForward("18:40:00");
  await expect(seenOf(reply)).toHaveText("10/29 14:20 조회");
  await expect(bodyOf(reply)).toHaveText(SCENE3_BODY);
});
