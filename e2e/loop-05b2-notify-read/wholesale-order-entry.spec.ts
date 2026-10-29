import { expect, test, type Page } from "@playwright/test";
import {
  expandedOrder,
  notify,
  openPanel,
  orderCard,
  rowById,
  start,
} from "./helpers";

/**
 * #295 S11 주문 탭 진입 인자 `?order=` — 검색과 필터를 풀고 펼침(S11-6), 다른 주문의 `이번 출고` 값 유지(S11-7),
 * 없는 주문(S11-17). 와이어프레임 `#state-order-entry` `#state-order-missing`. 01-plan §4-2.
 */

const NEW_ID = 1026;
const NEW_ORDER = 7006;

function search(page: Page) {
  return page.getByLabel("거래처·품명 검색");
}

function chip(
  page: Page,
  group: "주문 상태 필터" | "정산 상태 필터",
  label: string,
) {
  return page.getByRole("radiogroup", { name: group }).getByRole("radio", {
    name: new RegExp(`^${label}`),
  });
}

test("S11-6 검색 '라온' + 정산 필터가 걸린 주문 탭에서 알림 → 둘 다 풀리고 그 주문 펼침", async ({
  page,
}) => {
  await start(page, "/orders");
  await notify(page, "incoming", { type: "NEW_ORDER" });

  await search(page).fill("라온");
  await chip(page, "정산 상태 필터", "미결제").click();
  await expect(chip(page, "정산 상태 필터", "미결제")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await openPanel(page);
  await rowById(page, NEW_ID).click();

  await expect(search(page)).toHaveValue("");
  await expect(chip(page, "정산 상태 필터", "전체")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(chip(page, "주문 상태 필터", "전체")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
  await expect(orderCard(page)).toContainText("신규 주문");
  await expect(orderCard(page)).toContainText("봄봄상회");
  await expect(orderCard(page)).not.toContainText("현재 목록 조건에 없는 주문");
  await expect(page).toHaveURL(/\/orders$/);
});

test("S11-7 7003 에 적던 이번 출고 '2' 는 7006 알림을 다녀와도 그대로", async ({
  page,
}) => {
  await start(page, "/orders");
  await notify(page, "incoming", { type: "NEW_ORDER" });

  /* 주문 번호가 소매처마다 따로라 겹친다 — 펼침 버튼을 상세 id(aria-controls)로 잡는다 */
  const toggle7003 = page.locator('button[aria-controls="order-detail-7003"]');
  await toggle7003.click();
  await expect(expandedOrder(page, 7003)).toBeVisible();
  const input = expandedOrder(page, 7003)
    .getByRole("textbox", { name: /이번 출고$/ })
    .first();
  await input.fill("2");

  await openPanel(page);
  await rowById(page, NEW_ID).click();
  await expect(expandedOrder(page, NEW_ORDER)).toBeVisible();
  await expect(expandedOrder(page, 7003)).toBeHidden();

  await toggle7003.click();
  await expect(
    expandedOrder(page, 7003)
      .getByRole("textbox", { name: /이번 출고$/ })
      .first(),
  ).toHaveValue("2");
});

test("S11-17 /orders?order=99999 → 목록 그대로, 카드 자리 '이 주문을 찾을 수 없어요'", async ({
  page,
}) => {
  await start(page, "/orders?order=99999");
  await expect(orderCard(page)).toHaveText("이 주문을 찾을 수 없어요");
  await expect(page.getByText("현재 목록 조건에 없는 주문이에요")).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "포장 대기열" })).toHaveCount(
    0,
  );
  /* 목록은 그대로(시드 5건), 펼친 행은 없다 */
  await expect(page.getByRole("button", { name: /펼치기$/ })).toHaveCount(5);
  await expect(page.getByRole("button", { name: /접기$/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/orders$/);
});
