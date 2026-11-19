import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { QA_DIR, qaHits, shot } from "../qa-shared";
import { gatePublicSmoke } from "./shared";

/**
 * side-02 QA — production 소매(ddmondo.co.kr), 로그인 없이 보이는 화면 전부.
 * `pnpm e2e:public`이 같이 돈다(파일 끝 `retail.public.ts`).
 * 결과는 `qa/hits-prod.jsonl`, 스크린샷은 `qa/prod-r-*.png`.
 */
gatePublicSmoke();

async function record(page: Page, name: string): Promise<string[]> {
  await shot(page, `prod-r-${name}`);
  const hits = await qaHits(page);
  appendFileSync(
    `${QA_DIR}/hits-prod.jsonl`,
    `${JSON.stringify({ app: "retail", name, url: page.url(), hits })}\n`,
  );
  return hits;
}

test("QA 소매 /login + 비밀번호 찾기", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  const before = await record(page, "login");
  await page
    .getByRole("button", { name: "비밀번호 찾기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = await record(page, "login-dialog");
  expect([...before, ...dialog]).toEqual([]);
});

test("QA 소매 /signup", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await record(page, "signup")).toEqual([]);
});

for (const path of ["/approval", "/approval/rejected"]) {
  test(`QA 소매 ${path} 로그아웃`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await record(page, path.slice(1).replace("/", "-"))).toEqual([]);
  });
}
