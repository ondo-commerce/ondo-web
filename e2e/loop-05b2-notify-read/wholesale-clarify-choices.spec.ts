import { expect, test, type Locator, type Page } from "@playwright/test";
import { chatMock, notify, start } from "./helpers";

/**
 * #296 S13-1 도매 되묻기 보기 줄. 와이어프레임 `19_wholesale-notifications` `#state-clarify`, 디자인 결정 37.
 *
 * 채팅 목의 방 1 시드 되묻기는 `choices` 칸이 없다(05b-1 이전 시드) — 그래서 "줄 없음" 쪽을 본다.
 * 보기가 있는 되묻기는 목의 같은 생성기가 만든다: 문맥 2001(빈티지 플라워 셔츠) + 옵션 없는 재고 문장.
 * `(주문 불가)`는 목 생성기가 게시 옵션만 보기로 내서 e2e로 만들 수 없다 — unit(`toClarifyChoicesView`)이 본다.
 */

const ASK = "이 셔츠 몇 장 남았어요?";
const CHOICES = "보기: 레드 / S, 레드 / M, 레드 / L, 네이비 / S, 네이비 / M";

function log(page: Page): Locator {
  return page.getByRole("log", { name: "대화", exact: true });
}

function clarifyBubbles(page: Page): Locator {
  return log(page).locator('[data-kind="CLARIFY"]');
}

/** 말풍선 안에서 탭이 멈출 수 있는 것 */
function focusables(bubble: Locator): Promise<number> {
  return bubble.evaluate(
    (el) =>
      el.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
  );
}

test.beforeEach(async ({ page }) => {
  await start(page, "/chats?room=6");
  await chatMock(page, "reset");
  await notify(page, "reset");
});

test("S13-1 보기 5개가 글자 한 줄 — button 0, a 0, 탭 정지 0", async ({
  page,
}) => {
  await chatMock(page, "rooms/6/incoming", {
    body: ASK,
    contextListingId: 2001,
  });
  const bubble = clarifyBubbles(page).last();
  await expect(bubble).toBeVisible();
  const line = bubble.locator('[data-ac="S13-1"]');
  await expect(line).toHaveText(CHOICES);
  await expect(bubble.getByRole("button")).toHaveCount(0);
  await expect(bubble.getByRole("link")).toHaveCount(0);
  expect(await focusables(bubble)).toBe(0);

  /* 줄은 본문 아래, 근거 칸(조회 시각) 위 */
  const order = await bubble.evaluate((el) => {
    const parts = [...el.querySelectorAll(":scope > div > span")];
    return parts.map((p) =>
      p.getAttribute("data-ac") === "S13-1"
        ? "choices"
        : p.querySelector('[data-ac="S7-13"]')
          ? "facts"
          : "other",
    );
  });
  expect(order.indexOf("choices")).toBeGreaterThan(-1);
  expect(order.indexOf("choices")).toBeLessThan(order.indexOf("facts"));

  /* Tab 으로 지나가도 말풍선 안에 멈추지 않는다 */
  await page.getByRole("textbox", { name: "메시지" }).focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await bubble.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(false);
  }
});

test("S13-1 choices 가 없는 되묻기(방 1 시드)는 보기 줄이 없다", async ({
  page,
}) => {
  await page.getByRole("link", { name: /^봄봄상회 / }).click();
  await expect(page).toHaveURL(/room=1$/);
  const bubble = clarifyBubbles(page).first();
  await expect(bubble).toBeVisible();
  await expect(bubble.locator('[data-ac="S13-1"]')).toHaveCount(0);
  await expect(bubble).not.toContainText("보기:");
  /* 근거 칸(조회 시각)은 그대로 */
  await expect(bubble.locator('[data-ac~="S7-13"]')).toBeVisible();
});
