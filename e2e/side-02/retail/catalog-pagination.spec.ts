import { expect, test } from "@playwright/test";
import { LATE_WHOLESALER, WHOLESALER } from "./stub-api";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: "stub_retailer", value: "bombom", url: baseURL! },
    { name: "stub_catalog", value: "paged", url: baseURL! },
  ]);
});

test("홈의 페이지 이동은 필터를 유지하고 목록을 교체한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?category=1");
  const cards = page.getByRole("article");
  const nav = page.getByRole("navigation", { name: "상품 목록 페이지" });

  /* 한 쪽 24개. 가짜 목록 51개(기본 3 + 페이지 상품 48)가 24, 24, 3으로 나뉜다 */
  await expect(cards).toHaveCount(24);
  await expect(nav.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
  await nav.getByRole("link", { name: "다음 페이지" }).click();
  await expect(page).toHaveURL(/category=1&page=2/);
  await expect(cards).toHaveCount(24);
  await expect(cards.first()).toContainText("페이지 상품 22");
  await expect(nav.getByRole("link", { name: "2페이지" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "3페이지" }).click();
  await expect(cards).toHaveCount(3);
  await expect(nav.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
  await page.goBack();
  await expect(cards.first()).toContainText("페이지 상품 22");
  await page.getByRole("link", { name: "초기화", exact: true }).click();
  await expect(cards.first()).toContainText("코튼 셔츠");
  await expect(nav.getByRole("link", { name: "1페이지" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("도매처 판매 페이지에서 같은 도매처 상품만 이동하고 빈 페이지 주소를 보정한다", async ({
  page,
}) => {
  await page.goto(`/wholesalers/${WHOLESALER.id}?page=50`);
  const nav = page.getByRole("navigation", { name: "상품 목록 페이지" });
  const cards = page.getByRole("article");
  await expect(page).toHaveURL(/\?page=3$/);
  await expect(cards).toHaveCount(1);
  /* 이 도매처 상품은 49개(코튼 셔츠 + 페이지 상품 48)라 24, 24, 1이다 */
  await expect(cards.first()).toContainText("페이지 상품 48");
  await nav.getByRole("link", { name: "이전 페이지" }).click();
  await expect(cards).toHaveCount(24);
  await expect(cards.first()).toContainText("페이지 상품 24");
});

test("마켓 100번째 이후에 처음 등장하는 도매처도 페이지와 빈 결과를 표시한다", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "stub_catalog", value: "large", url: baseURL! },
  ]);
  const cards = page.getByRole("article");
  const nav = page.getByRole("navigation", { name: "상품 목록 페이지" });

  /* 마켓 125개는 24개씩 6쪽이고 마지막 쪽에 5개가 남는다 */
  await page.goto("/?page=6");
  await expect(cards).toHaveCount(5);
  await expect(cards.last()).toContainText("마켓 상품 125");
  await expect(nav.getByRole("button", { name: "다음 페이지" })).toBeDisabled();

  const sellerPath = `/wholesalers/${LATE_WHOLESALER.id}`;
  await page.goto(sellerPath);
  await expect(page).toHaveTitle(`${LATE_WHOLESALER.name} · 온도 마켓`);
  await expect(cards).toHaveCount(24);
  await expect(cards.first()).toContainText("마켓 상품 101");
  await nav.getByRole("link", { name: "다음 페이지" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("마켓 상품 125");
  await expect(nav.getByRole("button", { name: "다음 페이지" })).toBeDisabled();

  await page.goto(`${sellerPath}?category=1`);
  await expect(
    page.getByRole("heading", { name: LATE_WHOLESALER.name }),
  ).toBeVisible();
  await expect(page.getByText("조건에 맞는 상품이 없어요.")).toBeVisible();
  await expect(cards).toHaveCount(0);
});
