import { expect, test, type Page } from "@playwright/test";
import {
  bell,
  chatLink,
  expandedOrder,
  orderCard,
  panel,
  rows,
} from "./helpers";

/**
 * QA loop-05b2-notify-read — S13-3 리허설. `docs/12-demo-guide.md` 7절 도매 쪽 순서를 **진짜 시계로** 한 번 돈다.
 * 콘솔 명령은 대본 글자 그대로(Content-Type 없음, body "{}"). 단계마다 걸린 시간을 로그로 남긴다.
 * 사람이 말하는 시간은 들어가지 않는다 — 기계가 누르고 기다린 시간만이다.
 */

test.setTimeout(240_000);

function consoleLine(page: Page, url: string, body: string): Promise<number> {
  return page.evaluate(
    async ({ url, body }) =>
      (await fetch(url, { method: "POST", body })).status,
    { url, body },
  );
}

const ASK_STOCK = JSON.stringify({
  body: "레드 M 몇 장 있어요",
  contextListingId: 2001,
});
const ASK_CLARIFY = JSON.stringify({
  body: "이 셔츠 몇 장 남았어요?",
  contextListingId: 2001,
});

test("S13-3 리허설 — 대본 7절 도매 쪽, 진짜 시계", async ({ page }) => {
  const t0 = Date.now();
  const lap: Record<string, number> = {};
  const mark = (name: string) =>
    (lap[name] = Math.round((Date.now() - t0) / 1000));

  /* 준비: 아무 이메일로 로그인 */
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("demo@anything.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("아무거나1!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(bell(page)).toBeVisible();
  mark("로그인");

  /* 초기화 두 줄 */
  expect(await consoleLine(page, "/__mock/chat/reset", "{}")).toBe(200);
  expect(await consoleLine(page, "/__mock/notifications/reset", "{}")).toBe(
    200,
  );

  /* 2. /chats 방 6 — 주 메뉴에 채팅이 없어 헤더 채팅 아이콘으로 */
  await chatLink(page).click();
  await page.getByRole("link", { name: /^라온상점 / }).click();
  await expect(page).toHaveURL(/room=6/);
  const chatBefore = Number(
    /답 필요 (\d+)건/.exec(
      (await chatLink(page).getAttribute("aria-label")) ?? "",
    )?.[1] ?? 0,
  );
  expect(
    await consoleLine(page, "/__mock/chat/rooms/6/incoming", ASK_STOCK),
  ).toBe(201);
  const log = page.getByRole("log", { name: "대화", exact: true });
  await expect(log.locator('[data-kind="AUTO_REPLY"]').last()).toContainText(
    "판매가능 35장, 주문 한도 500장",
  );
  expect(
    await consoleLine(page, "/__mock/chat/rooms/6/incoming", ASK_CLARIFY),
  ).toBe(201);
  await expect(log.locator('[data-kind="CLARIFY"]').last()).toContainText(
    "보기: 레드 / S, 레드 / M, 레드 / L, 네이비 / S, 네이비 / M",
  );
  mark("2 자동 답, 되묻기 보기");

  /* 3. 스위치 끄고 "위 명령을 한 번 더" → 넘김 줄, 30초 안 채팅 배지 +1 */
  const sw = page.getByRole("switch", { name: "자동 답변", exact: true });
  await sw.click();
  await expect(sw).not.toBeChecked();
  expect(
    await consoleLine(page, "/__mock/chat/rooms/6/incoming", ASK_STOCK),
  ).toBe(201);
  await expect(log.getByRole("note").last()).toContainText("직접 답해 주세요");
  const handoffAt = Date.now();
  await expect(chatLink(page)).toHaveAccessibleName(
    `채팅, 답 필요 ${chatBefore + 1}건`,
    {
      timeout: 31_000,
    },
  );
  lap["3 채팅 배지까지(초)"] = Math.round((Date.now() - handoffAt) / 1000);
  mark("3 넘김, 채팅 배지");

  /* 4. 켜고 상품으로 */
  await sw.click();
  await expect(sw).toBeChecked();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "상품", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products$/);
  mark("4 켜기, 상품");

  /* 5. 새 주문 → 30초 안 종 3 → 4 */
  expect(
    await consoleLine(
      page,
      "/__mock/notifications/incoming",
      JSON.stringify({ type: "NEW_ORDER" }),
    ),
  ).toBe(201);
  const orderAt = Date.now();
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 4개", {
    timeout: 31_000,
  });
  lap["5 종 배지까지(초)"] = Math.round((Date.now() - orderAt) / 1000);
  mark("5 새 주문, 종 배지");

  /* 6. 종 → 맨 위 → 주문 탭 7006 펼침, 신규 주문, 배지 3 */
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(rows(page).first()).toContainText("봄봄상회 새 주문");
  await expect(rows(page).first()).toContainText("방금");
  await rows(page).first().click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(expandedOrder(page, 7006)).toBeVisible();
  await expect(orderCard(page)).toContainText("신규 주문");
  await expect(bell(page)).toHaveAccessibleName("알림, 안 읽음 3개");
  mark("6 종, 그 주문");

  await page.screenshot({
    path: ".claude/harness/runs/loop-05b2-notify-read/qa/rehearsal-end-1470.png",
  });
  console.log("QA rehearsal", JSON.stringify(lap));
});
