import { appendFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { QA_DIR, qaHits, shot } from "../qa-shared";
import { ORDER_ID, RETAILERS, WHOLESALER, type RetailerKey } from "./stub-api";

/**
 * side-02 QA — 소매(stub API 3199 + retail 3101, project `retail-stub`).
 * production과 같은 자리를 이 브랜치에서 다시 열고, 스크린샷과 금칙어 결과를 남긴다.
 */
const CONTACT_LINE = "담당자에게 문의해 주세요";

async function as(context: BrowserContext, key: RetailerKey) {
  await context.addCookies([
    { name: "stub_retailer", value: key, url: "http://localhost:3101" },
  ]);
}

async function record(page: Page, name: string): Promise<string[]> {
  await shot(page, `local-r-${name}`);
  const hits = await qaHits(page);
  appendFileSync(
    `${QA_DIR}/hits-local.jsonl`,
    `${JSON.stringify({ app: "retail", name, url: page.url(), hits })}\n`,
  );
  return hits;
}

test.describe("QA 소매 미로그인 화면 — production과 같은 자리", () => {
  test("사장 시나리오 (c) /login 비밀번호 찾기 → 문의 한 줄", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "로그인", exact: true }),
    ).toBeVisible();
    expect(await record(page, "login")).toEqual([]);
    await page
      .getByRole("button", { name: "비밀번호 찾기", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    /* 규칙 8: 다이얼로그가 실제로 무엇을 말하는지 남긴다 */
    const text = await dialog.innerText();
    appendFileSync(
      `${QA_DIR}/scenario-c.json`,
      `${JSON.stringify({ text })}\n`,
    );
    expect(text).toContain(CONTACT_LINE);
    expect(await record(page, "login-dialog")).toEqual([]);
  });

  test("/signup", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await record(page, "signup")).toEqual([]);
  });

  test("/approval 승인 대기 + 문의하기", async ({ page, context }) => {
    await as(context, "pending");
    await page.goto("/approval");
    await page.getByRole("button", { name: "문의하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await record(page, "approval-pending-dialog")).toEqual([]);
  });
});

test.describe("QA 소매 로그인 뒤 (stub)", () => {
  test("사장 시나리오 (b) /settings 상호와 헤더 칩이 /me 값", async ({
    page,
    context,
  }) => {
    await as(context, "miso");
    await page.goto("/settings");
    await expect(page.getByRole("group", { name: "상호명" })).toContainText(
      RETAILERS.miso.shopName,
    );
    await expect(page.locator("header")).toContainText(RETAILERS.miso.shopName);
    expect(await record(page, "settings-miso")).toEqual([]);
  });

  test("사장 시나리오 (b) 상호가 비면 설정과 헤더 칩 둘 다 '상호 미등록'", async ({
    page,
    context,
  }) => {
    await as(context, "noname");
    await page.goto("/settings");
    await expect(page.getByRole("group", { name: "상호명" })).toContainText(
      "상호 미등록",
    );
    await expect(page.locator("header")).toContainText("상호 미등록");
    expect(await record(page, "settings-noname")).toEqual([]);
  });

  test("/orders/{id} 장끼", async ({ page, context }) => {
    await as(context, "bombom");
    await page.goto(`/orders/${ORDER_ID}`);
    expect(await record(page, "order-detail")).toEqual([]);
    await page.getByRole("button", { name: "장끼 보기", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      RETAILERS.bombom.shopName,
    );
    expect(await record(page, "order-statement")).toEqual([]);
  });

  test("/wholesalers/{id}", async ({ page, context }) => {
    await as(context, "bombom");
    await page.goto(`/wholesalers/${WHOLESALER.id}`);
    await expect(
      page.getByRole("heading", { name: WHOLESALER.name }),
    ).toBeVisible();
    /* 52,000원이 '미결제 잔액' 칸에 붙어 있는지 — main 어딘가가 아니라 */
    const card = page
      .getByText("미결제 잔액", { exact: true })
      .locator("xpath=..");
    await expect(card).toContainText("52,000원");
    expect(await record(page, "wholesaler-home")).toEqual([]);
  });
});
