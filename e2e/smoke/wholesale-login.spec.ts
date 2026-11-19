import { expect, test } from "@playwright/test";

/**
 * 러너가 도는지 확인하는 최소 smoke. 데모 경로 e2e 는 loop 회차가 `e2e/<slug>/` 에 쌓는다.
 */
test("도매 로그인 화면이 뜬다", async ({ page }) => {
  await page.goto("/login");
  // 제목으로 온도인지 먼저 확인한다 — 다른 프로젝트의 dev 서버를 잡으면 여기서 멈춘다
  await expect(page).toHaveTitle(/온도/);
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
});
