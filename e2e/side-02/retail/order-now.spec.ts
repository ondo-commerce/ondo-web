import { expect, test, type BrowserContext } from "@playwright/test";
import { STOCK_LISTING, STUB_ORIGIN } from "./stub-api";

/**
 * 상품 상세 `바로 주문하기`. 예전에는 고른 수량을 안 넘기고 주문서만 열어서
 * `주문할 조합이 없어요`가 떴다(2026-11-18 사용자 발견). 이제 담고 그 줄만 들고 간다.
 */
const BASE = "http://localhost:3101";

/** 시험마다 장바구니를 따로 쓴다 — 가짜 API의 장바구니는 프로세스에 하나라 서로 섞인다 */
async function as(context: BrowserContext, cart: string) {
  await context.addCookies([
    { name: "stub_retailer", value: "bombom", url: BASE },
    { name: "stub_cart", value: cart, url: BASE },
  ]);
}

test("바로 주문하기는 고른 수량을 담고 그 줄만 들고 주문서를 연다", async ({
  page,
  context,
}) => {
  await as(context, "order-now-fresh");
  await page.goto(`/products/${STOCK_LISTING.listingId}`);
  await page.getByRole("textbox", { name: "레드 S 수량" }).fill("3");
  await page.getByRole("button", { name: "바로 주문하기" }).click();

  await expect(page).toHaveURL(/\/checkout\?ids=\d+$/);
  await expect(page.getByText("주문할 조합이 없어요")).toHaveCount(0);
  await expect(page.getByText(STOCK_LISTING.title)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "주문 접수하기" }),
  ).toBeEnabled();

  const cart = await page.request.get("/api/retail/cart-items");
  const items = (await cart.json()).data.groups[0].items;
  expect(items).toHaveLength(1);
  expect(items[0].qty).toBe(3);
});

test("방금 장바구니에 담은 뒤 바로 주문해도 주문서에는 고른 수량이 나온다", async ({
  page,
  context,
}) => {
  await as(context, "order-now-after-add");
  await page.goto(`/products/${STOCK_LISTING.listingId}`);
  await page.getByRole("textbox", { name: "레드 S 수량" }).fill("3");
  await page.getByRole("button", { name: "장바구니 담기" }).click();
  await expect(
    page.getByRole("button", { name: "장바구니에 담김" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "바로 주문하기" }).click();
  await expect(page).toHaveURL(/\/checkout\?ids=\d+$/);
  await expect(page.getByText(STOCK_LISTING.title)).toBeVisible();

  /* 서버는 같은 옵션을 합산한다. 바로 주문하기가 고른 수량으로 맞추지 않았다면 6장이 됐을 것이다 */
  const cart = await page.request.get("/api/retail/cart-items");
  expect((await cart.json()).data.groups[0].items[0].qty).toBe(3);
});

test("장바구니에 미리 담긴 옵션도 바로 주문하면 고른 수량으로 맞춘다", async ({
  page,
  context,
}) => {
  await as(context, "order-now-existing");
  const redS = STOCK_LISTING.variants.find(
    (v) => v.color === "레드" && v.size === "S",
  );
  /* 예전에 2장 담아 둔 상태 */
  const seed = await page.request.post("/api/retail/cart-items", {
    data: { variantId: redS?.id, qty: 2 },
  });
  expect(seed.status()).toBe(201);

  await page.goto(`/products/${STOCK_LISTING.listingId}`);
  await page.getByRole("textbox", { name: "레드 S 수량" }).fill("3");
  await page.getByRole("button", { name: "바로 주문하기" }).click();
  await expect(page).toHaveURL(/\/checkout\?ids=\d+$/);
  await expect(page.getByText(STOCK_LISTING.title)).toBeVisible();

  /* 더했다면 5장이다. 사용자 결정(2026-11-19)은 고른 수량으로 덮어쓰기 */
  const cart = await page.request.get("/api/retail/cart-items");
  const items: { qty: number }[] = (await cart.json()).data.groups[0].items;
  expect(items).toHaveLength(1);
  expect(items[0]?.qty).toBe(3);

  /* 주문서에서 뒤로 와 같은 수량으로 다시 눌러도 그대로 3장이다 */
  await page.goBack();
  await page.getByRole("textbox", { name: "레드 S 수량" }).fill("3");
  await page.getByRole("button", { name: "바로 주문하기" }).click();
  await expect(page).toHaveURL(/\/checkout\?ids=\d+$/);
  const again = await page.request.get("/api/retail/cart-items");
  expect((await again.json()).data.groups[0].items[0].qty).toBe(3);
});

test("일부만 담긴 뒤 다시 누르면 먼저 담긴 줄도 함께 주문서로 간다", async ({
  page,
  context,
}) => {
  await as(context, "order-now-partial");
  await page.goto(`/products/${STOCK_LISTING.listingId}`);
  await page.getByRole("textbox", { name: "레드 S 수량" }).fill("3");
  await page.getByRole("textbox", { name: "네이비 M 수량" }).fill("2");

  /* 다음 담기 한 번만 실패시킨다. 두 옵션이 같이 나가므로 어느 쪽이 실패할지는 정해져 있지 않다.
     브라우저 요청은 목 service worker를 거쳐서 `page.route`로는 못 막는다 — 가짜 API 손잡이를 쓴다 */
  await page.request.post(
    `${STUB_ORIGIN}/__stub/cart-fail?cart=order-now-partial`,
    { data: { status: 500, times: 1 } },
  );

  /* 하나라도 못 담았으면 주문서로 가지 않고 이유를 보여 준다 */
  await page.getByRole("button", { name: "바로 주문하기" }).click();
  await expect(page.getByText(/못 담았어요/)).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/products/${STOCK_LISTING.listingId}$`),
  );

  /* 다시 누르면 못 담은 것만 보내고, 주문서에는 두 줄이 다 실린다 */
  await page.getByRole("button", { name: "바로 주문하기" }).click();
  await expect(page).toHaveURL(/\/checkout\?ids=\d+,\d+$/);
  const cart = await page.request.get("/api/retail/cart-items");
  const items: { qty: number }[] = (await cart.json()).data.groups[0].items;
  expect(items.map((item) => item.qty).sort()).toEqual([2, 3]);
  await expect(
    page.getByRole("button", { name: "주문 접수하기" }),
  ).toBeEnabled();
});

test("수량이 0이면 바로 주문하기가 잠겨 있다", async ({ page, context }) => {
  await as(context, "order-now-empty");
  await page.goto(`/products/${STOCK_LISTING.listingId}`);
  await expect(
    page.getByRole("button", { name: "바로 주문하기" }),
  ).toBeDisabled();
});
