import { expect, test } from "@playwright/test";
import {
  LOGIN_BLOCKED_REASON,
  expectNoForbidden,
  gatePublicSmoke,
  loginEnabled,
  openDialog,
} from "./shared";

/**
 * 도매 production(pos.ddmondo.co.kr) 공개 스모크. side-02 S3(#278).
 * 실행: `pnpm e2e:public` (PUBLIC_SMOKE=1, 설정 `playwright.public.config.ts`).
 */
gatePublicSmoke();

/** 주 메뉴 7탭 + 상품 등록. 평가위원이 들어가 볼 화면 전부다 */
const ERP_PATHS = [
  "/dashboard",
  "/orders",
  "/shipments",
  "/backorders",
  "/inventory",
  "/products",
  "/settlements",
  "/products/new",
] as const;

/** 표가 본문인 화면. 로그인 뒤 행이 1개 이상이어야 "빈 목록"이 아니다 */
const LIST_PATHS = new Set([
  "/orders",
  "/shipments",
  "/backorders",
  "/inventory",
  "/products",
]);

test.describe("S3-2 로그인 없이 열면 /login으로 간다", () => {
  for (const path of ["/", ...ERP_PATHS]) {
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

  test("도매 /approval (로그아웃 안내)", async ({ page }) => {
    await page.goto("/approval");
    await expect(page.getByText("로그인이 필요해요")).toBeVisible();
    await expectNoForbidden(page);
  });
});

test.describe("S3-1 로그인 뒤 8화면", () => {
  test.skip(!loginEnabled(), LOGIN_BLOCKED_REASON);

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill(process.env.PUBLIC_W_EMAIL ?? "");
    await page.getByLabel("비밀번호").fill(process.env.PUBLIC_PW ?? "");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  for (const path of ERP_PATHS) {
    test(`도매 ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login$/);
      await page.waitForLoadState("networkidle");
      await expectNoForbidden(page);
      if (LIST_PATHS.has(path)) {
        /* 머리 행 1 + 본문 1 이상 */
        expect(await page.getByRole("row").count()).toBeGreaterThan(1);
      }
    });
  }
});
