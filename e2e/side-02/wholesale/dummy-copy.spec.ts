import { expect, test, type Page } from "@playwright/test";

/**
 * side-02 S1 — 도매 더미 문구와 가짜 성공 제거(#276).
 *
 * 로그인 목 핸들러가 없어서(mock 모드에서도 `/auth/login`은 dev 서버로 간다) 로그인한
 * 상태는 **세션 보관소를 직접 심어** 만든다. 앱이 로그인 성공 뒤 적는 모양
 * (`store.signInWithStatus`) 그대로다. 로그인 직후 도착지(S1-4)만 로그인 응답을
 * `page.route`로 대신 준다.
 */

const SESSION_KEY = "ondo.wholesale.session";
const EMAIL = "raon@ondo.test";
const CONTACT_LINE = "담당자에게 문의해 주세요";
const SIGNUP_CLOSED =
  "지금은 온라인 가입을 받지 않아요. 체험은 안내받은 테스트 계정으로 해 주세요";

type Status = "APPROVED" | "PENDING" | "REJECTED";

async function seedSession(page: Page, status: Status) {
  await page.addInitScript(
    ([key, email, value]) => {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ email, overrides: { [email]: { status: value } } }),
      );
    },
    [SESSION_KEY, EMAIL, status] as const,
  );
}

test.describe("S1-1 서버가 없어요 문구 제거", () => {
  test("계정 메뉴에 이메일이 보이고 '서버가 없어요'가 DOM에 없다", async ({
    page,
  }) => {
    await seedSession(page, "APPROVED");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /계정 메뉴/ }).click();

    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("서버가 없어요");
    /* 계좌 항목은 세션 흉내 대신 정산 탭으로 간다 */
    await expect(
      page.getByRole("link", { name: "정산 계좌 관리" }),
    ).toHaveAttribute("href", "/settlements");
  });

  test("로그아웃 상태의 계정 화면에도 '서버가 없어요'가 없다", async ({
    page,
  }) => {
    await page.goto("/approval");
    await expect(page.getByText("로그인이 필요해요")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("서버가 없어요");
  });
});

test.describe("S1-2 가입, 재신청 제출 잠금", () => {
  test("/signup: 폼 위 안내가 뜨고 가입하기가 잠겨 있다", async ({ page }) => {
    await page.goto("/signup");
    const notice = page.locator('[data-ac="S1-2"]');
    await expect(notice).toHaveText(SIGNUP_CLOSED);
    await expect(page.getByRole("button", { name: "가입하기" })).toBeDisabled();

    /* 칸에서 Enter를 쳐도 심사 화면으로 넘어가지 않는다 */
    await page.getByLabel(/상호명/).fill("온도의류");
    await page.getByLabel(/상호명/).press("Enter");
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator("body")).not.toContainText("심사 중");
  });

  test("/approval/rejected: 안내가 뜨고 재신청하기가 잠겨 있다", async ({
    page,
  }) => {
    await seedSession(page, "REJECTED");
    await page.goto("/approval/rejected");
    await expect(
      page.getByRole("heading", { name: "가입이 거절됐어요" }),
    ).toBeVisible();
    await expect(page.locator('[data-ac="S1-2"]')).toHaveText(SIGNUP_CLOSED);
    await expect(
      page.getByRole("button", { name: "재신청하기" }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/\/approval\/rejected$/);
  });
});

test.describe("S1-3 '준비 중' 대신 문의 한 줄", () => {
  test("/login 비밀번호 찾기", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "비밀번호 찾기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(CONTACT_LINE);
    await expect(dialog).not.toContainText("준비 중");
  });

  test("/approval 문의하기", async ({ page }) => {
    await seedSession(page, "PENDING");
    await page.goto("/approval");
    await page.getByRole("button", { name: "문의하기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(CONTACT_LINE);
    await expect(dialog).not.toContainText("준비 중");
  });

  test("/approval/rejected 문의하기", async ({ page }) => {
    await seedSession(page, "REJECTED");
    await page.goto("/approval/rejected");
    await page.getByRole("button", { name: "문의하기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(CONTACT_LINE);
    await expect(dialog).not.toContainText("준비 중");
  });
});

test.describe("S1-4 도착지와 옛 온보딩 주소", () => {
  test("로그인 직후 /dashboard에 도착한다", async ({ page }) => {
    await page.route("**/api/wholesale/auth/login", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ approvalStatus: "APPROVED" }),
      }),
    );
    await page.goto("/login");
    await page.getByLabel("이메일").fill(EMAIL);
    await page.getByLabel("비밀번호").fill("ondo1234!");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("/onboarding/bank-account를 주소로 열면 /settlements로 간다", async ({
    page,
  }) => {
    await seedSession(page, "APPROVED");
    await page.goto("/onboarding/bank-account");
    await expect(page).toHaveURL(/\/settlements$/);
    await expect(page.locator("body")).not.toContainText("서버가 없어요");
  });
});
