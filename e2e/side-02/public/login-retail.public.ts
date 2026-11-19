import { expect, test } from "@playwright/test";
import { expectNoForbidden, gatePublicSmoke } from "./shared";

/**
 * 소매 production **로그인 뒤** 10화면. side-02 S3-1(#278). 실행: `pnpm e2e:public`.
 * 세션은 setup project `auth-retail`이 한 번 만든 것을 재사용한다(`auth.ts`).
 * 그 로그인이 실패하면(2026-10-28 dev API 500, BE #280) 이 파일은 돌지 않는다.
 */
gatePublicSmoke();

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

/** 표가 본문인 화면. 행이 1개 이상이어야 "빈 목록"이 아니다 */
const LIST_PATHS = new Set<string>(["/orders", "/settlements", "/wholesalers"]);

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
