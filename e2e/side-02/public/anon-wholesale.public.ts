import { expect, test } from "@playwright/test";
import { expectNoForbidden, gatePublicSmoke, openDialog } from "./shared";

/**
 * 도매 production(pos.ddmondo.co.kr) **미로그인** 스모크. side-02 S3(#278).
 * 실행: `pnpm e2e:public:anon` (로그인 점검까지는 `pnpm e2e:public`).
 */
gatePublicSmoke();

/** 주 메뉴 7탭 + 상품 등록 + 첫 화면 */
const GUARDED_PATHS = [
  "/",
  "/dashboard",
  "/orders",
  "/shipments",
  "/backorders",
  "/inventory",
  "/products",
  "/settlements",
  "/products/new",
] as const;

test.describe("S3-2 로그인 없이 열면 /login으로 간다", () => {
  for (const path of GUARDED_PATHS) {
    test(`도매 ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
    });
  }
});

test.describe("로그인 없이 보이는 화면에 금칙어가 없다", () => {
  test("도매 /login + 비밀번호 찾기 다이얼로그", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
    await expectNoForbidden(page);
    await openDialog(page, "비밀번호 찾기");
    await expectNoForbidden(page);
  });

  test("도매 /signup", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: "도매 회원가입" }),
    ).toBeVisible();
    await expectNoForbidden(page);
  });

  for (const path of ["/approval", "/approval/rejected"]) {
    test(`도매 ${path} (로그아웃 안내)`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("로그인이 필요해요")).toBeVisible();
      await expectNoForbidden(page);
    });
  }
});
