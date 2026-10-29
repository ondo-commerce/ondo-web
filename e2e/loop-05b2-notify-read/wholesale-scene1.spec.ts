import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bell,
  chatLink,
  chatMock,
  COUNT_GET,
  count,
  expandedOrder,
  notify,
  openPanel,
  orderCard,
  rowById,
  start,
  waitCount,
} from "./helpers";

/**
 * #296 S13-2 시연 장면 1 도매 절반(01-plan §2-1 7b~7d, §2-2 목 모드). `docs/12-demo-guide.md` "발표자용 장면 1"과
 * 같은 순서다. 와이어프레임 `#state-scene1`(새로 그린 화면 없음, 각 단계는 위 섹션과 17_wholesale-chat).
 *
 * 방은 6(라온상점)이다. 시드에서 `답 필요`가 아닌 방이라 넘김이 채팅 배지를 +1 하는 게 보인다
 * (방 1 봄봄상회는 이미 답 필요라 숫자가 안 바뀐다). 목은 페이지 안이라 화면 이동은 전부 클라이언트 이동이다 —
 * `page.goto`를 하면 주입한 주문과 알림이 시드로 돌아간다.
 */

const ASK = "레드 M 몇 장 있어요";
const NEW_ID = 1026;
const NEW_ORDER = 7006;

function log(page: Page): Locator {
  return page.getByRole("log", { name: "대화", exact: true });
}

function autoSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "자동 답변", exact: true });
}

function askStock(page: Page): Promise<void> {
  return chatMock(page, "rooms/6/incoming", {
    body: ASK,
    contextListingId: 2001,
  });
}

/** 다음 30초 count 를 밀고 응답까지 */
async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, before + 1);
}

function chatNeeds(label: string | null): number {
  return Number(/답 필요 (\d+)건/.exec(label ?? "")?.[1] ?? 0);
}

test("S13-2 장면 1 도매 절반 — 자동 답 → 끄기 → 넘김(채팅 +1) → 켜기 → 새 주문 → 종 → 그 주문", async ({
  page,
}) => {
  await start(page, "/chats?room=6");
  await chatMock(page, "reset");
  await notify(page, "reset");
  await nextPoll(page);
  const chatBefore = chatNeeds(await chatLink(page).getAttribute("aria-label"));
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");

  /* 1. 자동 답 + 근거 */
  await askStock(page);
  const auto = log(page).locator('[data-kind="AUTO_REPLY"]').last();
  await expect(auto).toContainText("레드 M은 10~49장 있어요");
  await expect(auto).toContainText("판매가능 35장, 주문 한도 500장");

  /* 2. 끄기 → 같은 주입 → 넘김 줄, 채팅 배지 +1 */
  await autoSwitch(page).click();
  await expect(autoSwitch(page)).not.toBeChecked();
  await askStock(page);
  await expect(log(page).getByRole("note").last()).toContainText(
    "자동 답변이 답하지 못했어요. 직접 답해 주세요",
  );
  await nextPoll(page);
  await expect(chatLink(page)).toHaveAccessibleName(
    `채팅, 답 필요 ${chatBefore + 1}건`,
  );

  /* 3. 켜기 */
  await autoSwitch(page).click();
  await expect(autoSwitch(page)).toBeChecked();

  /* 4. 다른 화면(/products)에서 새 주문 → 30초 안에 종 +1 */
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "상품" })
    .click();
  await expect(page).toHaveURL(/\/products$/);
  await notify(page, "incoming", { type: "NEW_ORDER" });
  await nextPoll(page);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개");

  /* 5. 종 → 첫 행 → 그 주문 */
  await openPanel(page);
  const first = rowById(page, NEW_ID);
  await expect(first).toContainText("봄봄상회 새 주문");
  await expect(first).toContainText("방금");
  await first.click();

  await expect(page).toHaveURL(/\/orders$/);
  await expect(orderCard(page)).toContainText("신규 주문");
  await expect(orderCard(page)).toContainText("봄봄상회");
  const detail = expandedOrder(page, NEW_ORDER);
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("textbox", { name: /레드 M .*이번 출고$/ }),
  ).toBeVisible();
  await expect(orderCard(page)).toContainText(/주문 수량\s*1/);
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
});
