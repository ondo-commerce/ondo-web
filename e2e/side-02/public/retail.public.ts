import { expect, test } from "@playwright/test";
import {
  LOGIN_BLOCKED_REASON,
  expectNoForbidden,
  gatePublicSmoke,
  loginEnabled,
  openDialog,
} from "./shared";

/**
 * 소매 production(ddmondo.co.kr) 공개 스모크. side-02 S3(#278).
 * 실행: `pnpm e2e:public` (PUBLIC_SMOKE=1, 설정 `playwright.public.config.ts`).
 */
gatePublicSmoke();

/** 평가위원이 열 10화면 */
const SHOP_PATHS = [
  "/",
  "/search",
  "/cart",
  "/checkout",
  "/orders",
  "/backorders",
  "/settlements",
  "/wholesalers",
  "/wishlist",
  "/settings",
] as const;

/** 미로그인 확인 경로. 상품 상세는 id가 있는 주소의 대표로 하나 넣는다 */
const GUARDED_PATHS = [
  "/",
  "/orders",
  "/settlements",
  "/settings",
  "/products/1",
] as const;

/** 표가 본문인 화면. 로그인 뒤 행이 1개 이상이어야 "빈 목록"이 아니다 */
const LIST_PATHS = new Set(["/orders", "/settlements", "/wholesalers"]);

test.describe("S3-2 로그인 없이 열면 /login으로 간다", () => {
  for (const path of GUARDED_PATHS) {
    test(`소매 ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(\?.*)?$/);
    });
  }
});

test.describe("로그인 없이 보이는 화면에 금칙어가 없다", () => {
  test("소매 /login + 비밀번호 찾기 다이얼로그", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
    await expectNoForbidden(page);
    await openDialog(page, "비밀번호 찾기");
    await expectNoForbidden(page);
  });

  test("소매 /signup", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoForbidden(page);
  });
});

test.describe("S3-1 로그인 뒤 10화면", () => {
  test.skip(!loginEnabled(), LOGIN_BLOCKED_REASON);

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill(process.env.PUBLIC_R_EMAIL ?? "");
    await page.getByLabel("비밀번호").fill(process.env.PUBLIC_PW ?? "");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  for (const path of SHOP_PATHS) {
    test(`소매 ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await page.waitForLoadState("networkidle");
      await expectNoForbidden(page);
      if (LIST_PATHS.has(path)) {
        expect(await page.getByRole("row").count()).toBeGreaterThan(1);
      }
    });
  }
});
