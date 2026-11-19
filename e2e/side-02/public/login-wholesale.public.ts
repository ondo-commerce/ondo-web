import { expect, test } from "@playwright/test";
import { expectNoForbidden, forbiddenScan, gatePublicSmoke } from "./shared";

/**
 * 도매 production **로그인 뒤** 8화면. side-02 S3-1(#278). 실행: `pnpm e2e:public`.
 * 세션은 setup project `auth-wholesale`이 한 번 만든 것을 재사용한다(`auth.ts`).
 * 그 로그인이 실패하면(2026-10-28 dev API 500, BE #280) 이 파일은 돌지 않는다.
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
] as const;

/** 표가 본문인 화면. 행이 1개 이상이어야 "빈 목록"이 아니다 */
const LIST_PATHS = new Set<string>([
  "/orders",
  "/shipments",
  "/backorders",
  "/inventory",
  "/products",
]);

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

test("도매 /products/new (게시 칸을 펼쳐 이미지 칸까지)", async ({ page }) => {
  await page.goto("/products/new");
  await expect(page).not.toHaveURL(/\/login$/);
  /* 평가위원이 게시를 켜야 이미지 칸이 보인다 — 켜지 않으면 그 안의 안내를 못 센다
     (04-qa F7) */
  await page.getByText("온도 마켓에 함께 게시", { exact: true }).click();
  const scan = await forbiddenScan(page);
  expect(scan.hits).toEqual([]);
});
