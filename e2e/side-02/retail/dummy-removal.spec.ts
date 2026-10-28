import { expect, test, type BrowserContext } from "@playwright/test";
import {
  ORDER_ID,
  RETAILERS,
  STUB_ORIGIN,
  WHOLESALER,
  type RetailerKey,
} from "./stub-api";

/**
 * side-02 S2 — 소매 더미 제거(#277). project `retail-stub`이 돌린다:
 *
 *   pnpm e2e --project retail-stub
 *
 * 소매는 Server Component가 `API_ORIGIN`으로 직접 부르므로 retail 서버가 가짜 API
 * (`stub-api.ts`, 3199)에 붙어 있어야 한다. `playwright.config.ts`의 webServer가
 * 둘 다 띄운다. **연결이 안 맞으면 skip하지 않고 실패한다** — 예전엔 skip해서
 * 기본 실행이 검증 0건으로 성공했다(03-review F5).
 */
const CONTACT_LINE = "담당자에게 문의해 주세요";

test.beforeAll(async ({ request, baseURL }) => {
  /* 가짜 API가 떠 있나 */
  const stub = await request.get(`${STUB_ORIGIN}/api/retail/auth/me`, {
    failOnStatusCode: false,
  });
  expect(
    stub.status(),
    `가짜 API(${STUB_ORIGIN})가 없다 — pnpm e2e --project retail-stub 으로 돌린다`,
  ).toBe(401);

  /* retail 서버가 그 가짜 API를 보고 있나. 3101에 다른 API_ORIGIN으로 뜬 서버를
     재사용하면 여기서 걸린다 */
  const settings = await request.get(`${baseURL}/settings`, {
    headers: { cookie: "stub_retailer=bombom" },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(
    settings.status() === 200 &&
      (await settings.text()).includes(RETAILERS.bombom.shopName),
    `${baseURL} 서버가 API_ORIGIN=${STUB_ORIGIN} 로 떠 있지 않다 — 3101 서버를 끄고 다시 돌린다`,
  ).toBe(true);
});

/** 실서버 세션 쿠키 대신 가짜 API가 읽는 계정 쿠키를 심는다 */
async function signInAs(
  context: BrowserContext,
  key: RetailerKey,
  extra: Record<string, string> = {},
) {
  const url = test.info().project.use.baseURL ?? "http://localhost:3101";
  await context.addCookies(
    Object.entries({ stub_retailer: key, ...extra }).map(([name, value]) => ({
      name,
      value,
      url,
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
