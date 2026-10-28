import { expect, test } from "@playwright/test";
import { expectNoForbidden, gatePublicSmoke, openDialog } from "./shared";

/**
 * 소매 production(ddmondo.co.kr) **미로그인** 스모크. side-02 S3(#278).
 * 실행: `pnpm e2e:public:anon` (로그인 점검까지는 `pnpm e2e:public`).
 */
gatePublicSmoke();

/** 상품 상세는 id가 있는 주소의 대표로 하나 넣는다 */
const GUARDED_PATHS = [
  "/",
  "/orders",
  "/settlements",
  "/settings",
  "/products/1",
] as const;

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
