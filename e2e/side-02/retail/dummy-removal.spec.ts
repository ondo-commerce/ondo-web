import type { Server } from "node:http";
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  ORDER_ID,
  RETAILERS,
  STUB_ORIGIN,
  WHOLESALER,
  startStubApi,
  type RetailerKey,
} from "./stub-api";

/**
 * side-02 S2 — 소매 더미 제거(#277).
 *
 * 소매는 Server Component가 `API_ORIGIN`으로 직접 부르므로 retail 서버를 가짜 API
 * (`stub-api.ts`)에 붙여 띄워야 돈다. 다른 주소로 떠 있으면 건너뛴다 — dev 서버로
 * 돌리면 로그인 뒤 화면이 지금 500이라 결과가 이 변경과 무관해진다.
 *
 *   API_ORIGIN=http://localhost:3199 pnpm exec playwright test --project retail
 */
test.skip(
  process.env.API_ORIGIN !== STUB_ORIGIN,
  `API_ORIGIN=${STUB_ORIGIN} 로 retail 서버를 띄워야 한다(stub-api.ts 머리말)`,
);

const CONTACT_LINE = "담당자에게 문의해 주세요";
const BASE = "http://localhost:3101";

let stub: Server | null = null;

test.beforeAll(async () => {
  stub = await startStubApi();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (stub) stub.close(() => resolve());
    else resolve();
  });
});

async function signInAs(
  context: BrowserContext,
  key: RetailerKey,
  extra: Record<string, string> = {},
) {
  await context.addCookies(
    Object.entries({ stub_retailer: key, ...extra }).map(([name, value]) => ({
      name,
      value,
      url: BASE,
    })),
  );
}

test.describe("S2-1 설정은 /me 값만", () => {
  for (const key of ["bombom", "miso"] as const) {
    test(`${key}: 자기 상호와 이메일이 보이고 예시 칸, 배너가 없다`, async ({
      page,
      context,
    }) => {
      await signInAs(context, key);
      await page.goto("/settings");

      const shop = page.getByRole("group", { name: "상호명" });
      await expect(shop).toContainText(RETAILERS[key].shopName);
      await expect(page.getByRole("group", { name: "이메일" })).toContainText(
        RETAILERS[key].email,
      );

      const body = page.locator("main");
      for (const banned of [
        "예시 값",
        "봄봄상회",
        "서버가 없어",
        "000-00-00000",
        "010-0000-0000",
      ]) {
        await expect(body).not.toContainText(banned);
      }
      /* "대표자명 · 연락처 · 사업자등록번호는 암호화해 보관해요" 안내 문장은 남는다 —
         글자가 아니라 **칸**이 없는지를 본다 */
      for (const field of ["대표자명", "연락처", "사업자등록번호"]) {
        await expect(page.getByRole("group", { name: field })).toHaveCount(0);
        await expect(page.getByLabel(field, { exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole("group", { name: "대표자명" })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
    });
  }

  test("상호가 비어 오면 '상호 미등록'", async ({ page, context }) => {
    await signInAs(context, "noname");
    await page.goto("/settings");
    await expect(page.getByRole("group", { name: "상호명" })).toContainText(
      "상호 미등록",
    );
  });
});

test.describe("S2-2, S2-3 주문 상세", () => {
  for (const key of ["bombom", "miso"] as const) {
    test(`${key}: 장끼 수령 상호가 /me.shopName이다`, async ({
      page,
      context,
    }) => {
      await signInAs(context, key);
      await page.goto(`/orders/${ORDER_ID}`);
      await page.getByRole("button", { name: "장끼 보기" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(RETAILERS[key].shopName);
      await expect(dialog).not.toContainText("봄봄상회");
    });
  }

  test("인쇄, 저장 버튼과 '준비 중'이 없다", async ({ page, context }) => {
    await signInAs(context, "bombom");
    await page.goto(`/orders/${ORDER_ID}`);
    await page.getByRole("button", { name: "장끼 보기" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("link", { name: "정산에서 보기" }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "인쇄" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "저장" })).toHaveCount(0);
    await expect(dialog).not.toContainText("준비 중");
  });
});

test.describe("S2-4 도매처 홈", () => {
  test("'거래 정보 준비 중' 카드가 없고 미결제 잔액이 정산 값이다", async ({
    page,
    context,
  }) => {
    await signInAs(context, "bombom");
    await page.goto(`/wholesalers/${WHOLESALER.id}`);
    await expect(
      page.getByRole("heading", { name: WHOLESALER.name }),
    ).toBeVisible();

    await expect(page.locator("main")).not.toContainText("준비 중");
    await expect(page.getByText("진행 중", { exact: true })).toHaveCount(0);
    await expect(page.locator("main")).toContainText("52,000원");
  });

  test("정산 요청이 실패하면 '불러오지 못했어요'", async ({
    page,
    context,
  }) => {
    await signInAs(context, "bombom", { stub_settlements: "fail" });
    await page.goto(`/wholesalers/${WHOLESALER.id}`);
    await expect(
      page.getByRole("heading", { name: WHOLESALER.name }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText("불러오지 못했어요");
    await expect(page.locator("main")).not.toContainText("준비 중");
  });
});

test.describe("S2-5 '준비 중' 대신 문의 한 줄", () => {
  test("/login 비밀번호 찾기", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "비밀번호 찾기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(CONTACT_LINE);
    await expect(dialog).not.toContainText("준비 중");
  });

  test("/approval 문의하기", async ({ page, context }) => {
    await signInAs(context, "pending");
    await page.goto("/approval");
    await page.getByRole("button", { name: "문의하기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(CONTACT_LINE);
    await expect(dialog).not.toContainText("준비 중");
  });
});
