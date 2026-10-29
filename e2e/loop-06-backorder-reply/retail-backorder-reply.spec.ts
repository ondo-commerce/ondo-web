import { expect, test, type Page } from "@playwright/test";
import {
  ASK_WHEN,
  assertStubServers,
  captureSends,
  chatMock,
  chatNav,
  COUNT_GET,
  count,
  handoffLines,
  incoming,
  log,
  navUnread,
  notListedChip,
  openRoomFromList,
  orderCards,
  orderChoice,
  orderGroups,
  roomRow,
  say,
  SEND_POST,
  settled,
  start,
  waitCount,
} from "./helpers";

/**
 * #267 S3 — 소매 미송 후보 칩과 답 카드, 장면 2 소매 절반. 와이어프레임 `18_retail-chat` `#state-bo-clarify`
 * `#state-bo-pick` `#state-bo-card` `#state-bo-handoff` `#state-bo-guard` `#state-scene2`.
 *
 * 목 시드(reset 시각 T0 기준): 봄봄상회 ↔ 무드온 OPEN 미송 9001(레드/L 남은 4, 입고 T0−3), 9002(데님 소라/M 남은 1,
 * 미정), 9006(레드/L 남은 2, 원래 4), 9003(린넨 베이지/L 남은 2, T0+7 = 11월 5일, 원단 수급 지연).
 */

assertStubServers();

const CHIP_9003 = "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003";

/** 방 1을 열고 장면 2 질문 → 미송 되묻기까지 */
async function askInRoom(page: Page) {
  await start(page, "/");
  await openRoomFromList(page);
  await say(page, ASK_WHEN);
  await expect(orderGroups(page)).toHaveCount(1);
  return orderGroups(page).first();
}

test("S3-1 '지난주 주문한 거 언제 와요?' → '어느 주문이요?' + 보기 4개 오래된 순 + 다른 주문이에요", async ({
  page,
}) => {
  const group = await askInRoom(page);
  const clarify = log(page).locator('[data-kind="CLARIFY"]').last();
  await expect(clarify).toContainText("어느 주문이요?");
  await expect(clarify).toContainText("14:20 조회");

  const ids = await group
    .locator("button[data-backorder-id]")
    .evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.backorderId)),
    );
  expect(ids).toEqual([9001, 9002, 9006, 9003]);
  await expect(orderChoice(group, 9003)).toHaveText(CHIP_9003);
  await expect(notListedChip(group)).toHaveText("다른 주문이에요");
  await expect(group.getByRole("button")).toHaveCount(5);
  for (const button of await group.getByRole("button").all())
    await expect(button).toBeEnabled();
});

test("S3-1 390 에서 보기 글자 잘림 0(scrollWidth ≤ clientWidth), 말줄임 없음", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const group = await askInRoom(page);
  const cut = await group
    .locator("button")
    .evaluateAll((nodes) =>
      nodes
        .filter(
          (n) =>
            n.scrollWidth > n.clientWidth ||
            getComputedStyle(n).textOverflow === "ellipsis",
        )
        .map((n) => n.textContent),
    );
  expect(cut).toEqual([]);
  /* 두 줄로 접힌 보기가 있다(말줄임 대신 줄바꿈) */
  const tallest = await group
    .locator("button[data-backorder-id]")
    .evaluateAll((nodes) =>
      Math.max(...nodes.map((n) => n.getBoundingClientRect().height)),
    );
  expect(tallest).toBeGreaterThanOrEqual(44);
});

test("S3-2 같은 틱 3연타 → POST 1회 {BACKORDER, 9003, listingId null}, 고른 보기 표시, 나머지 잠김", async ({
  page,
}) => {
  const sends = captureSends(page);
  const group = await askInRoom(page);
  const before = sends.length;
  await orderChoice(group, 9003).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(orderCards(page, 9003)).toHaveCount(1);
  await settled(page, SEND_POST);
  expect(sends.length - before).toBe(1);
  expect(sends.at(-1)?.body).toEqual({
    body: CHIP_9003,
    inquiry: {
      intent: "BACKORDER",
      listingId: null,
      variantId: 3019,
      backorderId: 9003,
      label: CHIP_9003,
    },
  });
  await expect(orderChoice(group, 9003)).toHaveAccessibleName(/\(고름\)$/);
  for (const id of [9001, 9002, 9006])
    await expect(orderChoice(group, id)).toBeDisabled();
  await expect(notListedChip(group)).toBeDisabled();
});

test("S3-2 같은 SKU 두 보기(9001 9006) 중 9006만 고름 표시, 방을 다시 열어도(보류 상태 없이) 그대로", async ({
  page,
}) => {
  const group = await askInRoom(page);
  await orderChoice(group, 9006).click();
  await expect(orderCards(page, 9006)).toHaveCount(1);
  await expect(orderChoice(group, 9006)).toHaveAccessibleName(/\(고름\)$/);
  await expect(orderChoice(group, 9001)).not.toHaveAccessibleName(/\(고름\)/);

  /* 방을 떠났다 돌아온다 — 보내기 훅의 보류 상태는 사라지고 서버 메시지의 inquiry로만 다시 고른다.
     (전체 새로고침은 목이 페이지 안이라 시드로 돌아가서 못 쓴다) */
  await page.getByRole("link", { name: "채팅 목록", exact: true }).click();
  await expect(roomRow(page, 1)).toBeVisible();
  await roomRow(page, 1).click();
  const again = orderGroups(page).first();
  await expect(orderChoice(again, 9006)).toHaveAccessibleName(/\(고름\)$/);
  await expect(orderChoice(again, 9001)).not.toHaveAccessibleName(/\(고름\)/);
  await expect(orderChoice(again, 9001)).toBeDisabled();
});

test("S3-2 보내기 500 → 잠김 풀림, 고름 표시 없음, 다른 보기를 다시 고를 수 있다", async ({
  page,
}) => {
  const group = await askInRoom(page);
  await chatMock(page, "fail", { op: "send", status: 500 });
  await orderChoice(group, 9003).click();
  await expect(log(page).locator('[data-pending="failed"]')).toHaveCount(1);
  for (const id of [9001, 9002, 9006, 9003])
    await expect(orderChoice(group, id)).toBeEnabled();
  await expect(orderChoice(group, 9003)).not.toHaveAccessibleName(/\(고름\)/);

  await orderChoice(group, 9002).click();
  await expect(orderCards(page, 9002)).toHaveCount(1);
});

test("S3-3 예정 카드 — 남은 미송 2장, 도매 입고 예정 11월 5일, 사유, 14:20 조회, 담기 없음", async ({
  page,
}) => {
  const group = await askInRoom(page);
  await orderChoice(group, 9003).click();
  const card = orderCards(page, 9003);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("린넨 셋업 자켓 베이지 / L, 9/7 주문 #7003");
  await expect(card).toContainText("남은 미송 2장");
  await expect(card).toContainText("도매 입고 예정 11월 5일");
  await expect(card).toContainText("원단 수급 지연");
  await expect(card.getByRole("button")).toHaveCount(0);

  const bubble = log(page).locator('[data-kind="AUTO_REPLY"]').last();
  await expect(bubble).toContainText(
    "린넨 셋업 자켓 베이지 L 남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)",
  );
  await expect(bubble).toContainText("14:20 조회");
  await expect(bubble.getByRole("button")).toHaveCount(0);
  /* 예정은 넘김 줄이 없다 */
  await expect(handoffLines(page)).toHaveCount(0);
});

test("S3-3 미정 카드(9002) — 입고일 미정 + 넘김 줄", async ({ page }) => {
  const group = await askInRoom(page);
  await orderChoice(group, 9002).click();
  const card = orderCards(page, 9002);
  await expect(card).toContainText("남은 미송 1장");
  await expect(card).toContainText("입고일 미정");
  await expect(card).not.toContainText("도매 입고 예정");
  await expect(handoffLines(page).last()).toHaveText(/사장님께 전달했어요/);
});

test("S3-3 지남 카드(9001) — 등록 예정일 지남 (10월 26일) + 넘김 줄, '지연' 없음, 담기 없음", async ({
  page,
}) => {
  const group = await askInRoom(page);
  await orderChoice(group, 9001).click();
  const card = orderCards(page, 9001);
  await expect(card).toContainText("남은 미송 4장");
  await expect(card).toContainText("등록 예정일 지남 (10월 26일)");
  await expect(card).not.toContainText("지연");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(handoffLines(page).last()).toHaveText(/사장님께 전달했어요/);
});

test("S3-4 다른 주문이에요 → POST notListed true → 넘김 줄", async ({
  page,
}) => {
  const sends = captureSends(page);
  const group = await askInRoom(page);
  await notListedChip(group).click();
  await expect(handoffLines(page)).toHaveCount(1);
  await expect(handoffLines(page)).toHaveText(/사장님께 전달했어요/);
  expect(sends.at(-1)?.body).toMatchObject({
    body: "다른 주문이에요",
    inquiry: { intent: "BACKORDER", notListed: true, backorderId: null },
  });
  await expect(notListedChip(group)).toHaveAccessibleName(/\(고름\)$/);
  await expect(orderCards(page)).toHaveCount(0);
});

test("S3-4 같은 글자를 손으로 치면 notListed 없이 간다(서버가 새로 판정), 고름 표시 없음", async ({
  page,
}) => {
  const sends = captureSends(page);
  const group = await askInRoom(page);
  await say(page, "다른 주문이에요");
  await expect(handoffLines(page)).toHaveCount(1);
  expect(sends.at(-1)?.body).toEqual({
    body: "다른 주문이에요",
    inquiry: null,
  });
  await expect(notListedChip(group)).not.toHaveAccessibleName(/\(고름\)/);
});

test("S3-4 후보 0개(미송 비움) → 보기 없이 넘김 줄", async ({ page }) => {
  await start(page, "/");
  await chatMock(page, "reset", { noBackorders: true });
  await openRoomFromList(page);
  await say(page, ASK_WHEN);
  await expect(handoffLines(page)).toHaveCount(1);
  await expect(orderGroups(page)).toHaveCount(0);
  await expect(orderCards(page)).toHaveCount(0);
});

test("S3-5 남의 미송 9005, 801 직접 POST → 넘김만, 카드 0, 화면에 9장 20장 0", async ({
  page,
}) => {
  await askInRoom(page);
  const results = await page.evaluate(async () => {
    const out: { status: number; kinds: string[]; text: string }[] = [];
    for (const [backorderId, variantId] of [
      [9005, 3003],
      [801, 3801],
    ] as const) {
      const response = await fetch("/api/retail/chat/rooms/1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          body: "언제 와요?",
          inquiry: {
            intent: "BACKORDER",
            listingId: null,
            variantId,
            backorderId,
            label: null,
          },
        }),
      });
      const text = await response.text();
      const json = JSON.parse(text) as {
        data: { generatedMessages: { kind: string }[] };
      };
      out.push({
        status: response.status,
        kinds: json.data.generatedMessages.map((m) => m.kind),
        text,
      });
    }
    return out;
  });
  for (const r of results) {
    expect(r.status).toBe(201);
    expect(r.kinds).not.toContain("AUTO_REPLY");
    expect(r.text).not.toMatch(/(^|[^\d~])(9|20)장/);
  }
  /* polling이 두 질문을 그린 뒤. 숨긴 발신자 "나, 14:20: " 바로 뒤가 본문이라 장면 질문(지난주 …)과 갈린다 */
  await expect(
    log(page).locator('[data-sender="RETAILER"]', {
      hasText: /: 언제 와요\?/,
    }),
  ).toHaveCount(2);
  await expect(orderCards(page)).toHaveCount(0);
  await expect(log(page)).not.toContainText(/(^|[^\d~])(9|20)장/);
});

test("S3-6 장면 2 소매 절반 — 도매 답 → 배지 → /chats → 방 → 배지 없음 → 질문 → 칩 → 카드 11월 5일", async ({
  page,
}) => {
  await start(page, "/");
  const seed = await navUnread(page);

  // 1. 도매 답이 온다 → 30초 안에 헤더 배지 +1
  await incoming(page, 1, "네 내일 오전에 주문 넣어 주시면 바로 챙길게요");
  const n = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, n + 1);
  await expect.poll(() => navUnread(page)).toBe(seed + 1);

  // 2. 헤더 채팅 → /chats, 무드온 행 맨 위
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(
    page.getByRole("list", { name: "대화 목록" }).locator("a").first(),
  ).toHaveAttribute("data-room-id", "1");

  // 3. 무드온 → 방, 읽음 → 배지가 시드 값으로
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect.poll(() => navUnread(page)).toBe(seed);

  // 4. 질문 → 되묻기 + 보기 4개 + 다른 주문이에요
  await say(page, ASK_WHEN);
  const group = orderGroups(page).first();
  await expect(group.locator("button[data-backorder-id]")).toHaveCount(4);
  await expect(notListedChip(group)).toBeVisible();

  // 5. 칩 9003 → 답 + 카드 11월 5일
  await orderChoice(group, 9003).click();
  await expect(orderCards(page, 9003)).toContainText("도매 입고 예정 11월 5일");
  await expect(
    log(page).locator('[data-kind="AUTO_REPLY"]').last(),
  ).toContainText(
    "남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)",
  );
});
