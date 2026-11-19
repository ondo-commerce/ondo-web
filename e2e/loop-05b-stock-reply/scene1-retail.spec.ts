import { expect, test } from "@playwright/test";
import {
  addButton,
  assertStubServers,
  cards,
  cartLink,
  choice,
  choiceGroups,
  composer,
  enterRoom,
  inquiryButton,
  resetMock,
  signIn,
  useOwnCart,
  watchRequests,
} from "./helpers";

/**
 * #288 S8-13 — 시연 장면 1의 소매 절반(01-plan §2-1 1~4). 상품 상세 → 문의하기 → 자유 문장 → 되묻기 →
 * 레드 / M → 카드 → 담기 → 헤더 1 → 장바구니 보기 → /cart. 그동안 브라우저 요청에 `/api/wholesale/`이 없다
 * (도매 탭 장면 5~7은 도매 회차 #289와 05b-2).
 */

assertStubServers();

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await page.clock.install({ time: new Date("2026-10-28T10:20:00+09:00") });
  await signIn(page);
  await useOwnCart(page);
});

test("S8-13 장면 1 소매 절반 — 문의부터 장바구니까지, /api/wholesale/ 요청 0", async ({
  page,
}) => {
  const wholesaleCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/wholesale/"))
      wholesaleCalls.push(r.url());
  });

  // 1. 상품 상세 → 문의하기
  await page.goto("/products/2001");
  await expect(
    page.getByRole("heading", { name: "빈티지 플라워 셔츠" }),
  ).toBeVisible();
  await expect(inquiryButton(page)).toBeVisible();
  await resetMock(page);
  await expect(cartLink(page, 0)).toBeVisible();
  await enterRoom(page, 1, "/products/2001");

  // 2. 자유 문장 → 되묻기 + 칩 5개
  await composer(page).fill("이 셔츠 몇 장 남았어요?");
  await composer(page).press("Enter");
  await expect(choiceGroups(page)).toHaveCount(1);
  const group = choiceGroups(page).first();
  await expect(group.getByRole("button")).toHaveCount(5);

  // 3. 레드 / M → 카드
  await choice(group, "레드 / M").click();
  await expect(cards(page, 3002)).toHaveCount(2);
  const card = cards(page, 3002).last();
  await expect(card).toContainText(
    "레드 / M 재고 10~49장, 지금 주문할 수 있어요, 한 번에 최대 500장",
  );

  // 4. 담기 → 헤더 1 → 장바구니 보기
  await addButton(card).click();
  await expect(card.getByRole("status")).toContainText("장바구니에 담았어요");
  await expect(cartLink(page, 1)).toBeVisible();
  await card.getByRole("link", { name: "장바구니 보기" }).click();
  await expect(page).toHaveURL("/cart");
  await expect(page.getByText("빈티지 플라워 셔츠").first()).toBeVisible();
  await expect(page.getByText(/레드/).first()).toBeVisible();
  await expect(page.getByText(/\bM\b/).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: /수량/ }).first()).toHaveValue(
    "1",
  );

  expect(wholesaleCalls).toEqual([]);
});
