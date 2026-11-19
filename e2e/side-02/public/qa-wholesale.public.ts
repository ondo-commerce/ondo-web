import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { QA_DIR, qaHits, shot } from "../qa-shared";
import { gatePublicSmoke } from "./shared";

/**
 * side-02 QA — production 도매(pos.ddmondo.co.kr), 로그인 없이 보이는 화면 전부.
 * `pnpm e2e:public`이 같이 돈다(파일 끝 `wholesale.public.ts`). 스모크와 달리
 * "준비 중"을 화면 전체에서 센다(상태 배지 한 덩어리만 뺀다, `qa-shared.ts`).
 * 결과는 `qa/hits-prod.jsonl`, 스크린샷은 `qa/prod-w-*.png`.
 */
gatePublicSmoke();

async function record(page: Page, name: string): Promise<string[]> {
  await shot(page, `prod-w-${name}`);
  const hits = await qaHits(page);
  appendFileSync(
    `${QA_DIR}/hits-prod.jsonl`,
    `${JSON.stringify({ app: "wholesale", name, url: page.url(), hits })}\n`,
  );
  return hits;
}

test("QA 도매 /login + 비밀번호 찾기", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
  const before = await record(page, "login");
  await page
    .getByRole("button", { name: "비밀번호 찾기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = await record(page, "login-dialog");
  expect([...before, ...dialog]).toEqual([]);
});

test("QA 도매 /signup", async ({ page }) => {
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "도매 회원가입" }),
  ).toBeVisible();
  expect(await record(page, "signup")).toEqual([]);
});

test("QA 도매 /approval 로그아웃", async ({ page }) => {
  await page.goto("/approval");
  await expect(page.getByText("로그인이 필요해요")).toBeVisible();
  expect(await record(page, "approval")).toEqual([]);
});

test("QA 도매 /approval/rejected 로그아웃", async ({ page }) => {
  await page.goto("/approval/rejected");
  await page.waitForLoadState("networkidle");
  expect(await record(page, "approval-rejected")).toEqual([]);
});

test("QA 도매 /chats (기록만 — 채팅 미머지, 기획 N10)", async ({ page }) => {
  await page.goto("/chats");
  await page.waitForLoadState("networkidle");
  await record(page, "chats");
});
