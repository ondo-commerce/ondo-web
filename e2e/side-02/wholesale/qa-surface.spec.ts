import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { forbiddenScan } from "../public/shared";
import { QA_DIR, qaHits, shot } from "../qa-shared";

/**
 * side-02 QA — 도매(mock, 3100). production과 **같은 자리**를 이 브랜치에서 다시 연다.
 * 화면마다 전체 스크린샷과 금칙어 결과(`qa/hits-local.jsonl`)를 남긴다.
 * 로그인 목이 없어 dev spec(`dummy-copy.spec.ts`)처럼 세션 보관소를 심는다.
 */
const SESSION_KEY = "ondo.wholesale.session";
const EMAIL = "raon@ondo.test";
const NOTICE =
  "지금은 온라인 가입을 받지 않아요. 체험은 안내받은 테스트 계정으로 해 주세요";

async function seed(page: Page, status: "APPROVED" | "PENDING" | "REJECTED") {
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

/**
 * mock 모드 표의 거래처 "봄봄상회"는 MSW 스냅샷(스펙 예시)이 준 행 값이다 — 소스에
 * 박힌 더미가 아니다. 표 칸(<td>)에서 온 것만 빼고 나머지는 그대로 센다.
 */
const withoutMockRows = (hits: string[]) =>
  hits.filter((h) => !h.startsWith("봄봄상회 | <td>"));

async function record(page: Page, name: string): Promise<string[]> {
  await shot(page, `local-w-${name}`);
  const hits = await qaHits(page);
  appendFileSync(
    `${QA_DIR}/hits-local.jsonl`,
    `${JSON.stringify({ app: "wholesale", name, url: page.url(), hits })}\n`,
  );
  return hits;
}

test.describe("QA 도매 미로그인 화면 — production과 같은 자리", () => {
  test("/login + 비밀번호 찾기 다이얼로그", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
    expect(await record(page, "login")).toEqual([]);
    await page
      .getByRole("button", { name: "비밀번호 찾기", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await record(page, "login-dialog")).toEqual([]);
  });

  test("/signup", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: "도매 회원가입" }),
    ).toBeVisible();
    expect(await record(page, "signup")).toEqual([]);
  });

  test("/approval 로그아웃", async ({ page }) => {
    await page.goto("/approval");
    await expect(page.getByText("로그인이 필요해요")).toBeVisible();
    expect(await record(page, "approval-loggedout")).toEqual([]);
  });

  test("/approval/rejected 로그아웃", async ({ page }) => {
    await page.goto("/approval/rejected");
    await expect(page.getByText("로그인이 필요해요")).toBeVisible();
    expect(await record(page, "approval-rejected-loggedout")).toEqual([]);
  });

  test("/chats (기록만 — 채팅 미머지, 기획 N10)", async ({ page }) => {
    await page.goto("/chats");
    await page.waitForLoadState("networkidle");
    await record(page, "chats");
  });

  test("/approval 승인 대기 + 문의하기", async ({ page }) => {
    await seed(page, "PENDING");
    await page.goto("/approval");
    await page.getByRole("button", { name: "문의하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await record(page, "approval-pending-dialog")).toEqual([]);
  });

  test("/approval/rejected", async ({ page }) => {
    await seed(page, "REJECTED");
    await page.goto("/approval/rejected");
    await expect(
      page.getByRole("heading", { name: "가입이 거절됐어요" }),
    ).toBeVisible();
    expect(await record(page, "approval-rejected")).toEqual([]);
  });
});

test.describe("QA 도매 로그인 뒤 (세션 심기, mock)", () => {
  test("/dashboard 계정 메뉴", async ({ page }) => {
    await seed(page, "APPROVED");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /계정 메뉴/ }).click();
    await expect(page.getByText(EMAIL, { exact: true })).toBeVisible();
    expect(withoutMockRows(await record(page, "dashboard-menu"))).toEqual([]);
  });

  test("/settlements", async ({ page }) => {
    await seed(page, "APPROVED");
    await page.goto("/settlements");
    await page.waitForLoadState("networkidle");
    expect(withoutMockRows(await record(page, "settlements"))).toEqual([]);
  });

  /*
   * F7: 예전 공개 스모크는 "준비 중"을 dialog, data-ac, dl, alert, status 안에서만
   * 세서 상품 등록의 "이미지 업로드는 준비 중이에요"(<p>)를 못 잡았다(QA 때 test.fail).
   * 이제 스모크(`forbiddenScan`)가 본문 전체를 센다. 이 문장은 BE 업로드 API 대기라
   * 허용 목록(`ALLOWED_TEXTS`)에 사유와 함께 올렸다 — 스모크가 **보고 나서** 뺐는지를 본다.
   */
  test("F7 스모크 검사가 /products/new의 '준비 중' 문장을 보고 허용 목록으로만 뺀다", async ({
    page,
  }) => {
    await seed(page, "APPROVED");
    await page.goto("/products/new");
    await page.waitForLoadState("networkidle");
    /* 평가위원이 게시글 칸을 펼쳐야 이미지 칸이 보인다 */
    await page.getByText("온도 마켓에 함께 게시", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "이미지 추가", exact: true }),
    ).toBeVisible();
    const qa = await record(page, "products-new");
    /* 보이는 화면에는 있다 — QA 검사로 확인 */
    expect(qa.some((h) => h.startsWith("준비 중"))).toBe(true);
    /* 스모크 검사는 그걸 봤고, 허용 목록 사유로만 뺐다. 다른 "준비 중"은 없다 */
    const smoke = await forbiddenScan(page);
    appendFileSync(
      `${QA_DIR}/hits-local.jsonl`,
      `${JSON.stringify({ app: "wholesale", name: "products-new-smoke", url: page.url(), ...smoke })}\n`,
    );
    expect(
      smoke.allowed.some((h) => h.includes("이미지 업로드는 준비 중이에요")),
    ).toBe(true);
    expect(smoke.hits.filter((h) => h.includes("준비 중"))).toEqual([]);
  });
});

test.describe("QA 사장 시나리오 (a) 가입 폼 Enter", () => {
  test("값을 다 채우고 마지막 칸에서 Enter → 이동 없음, 안내가 버튼 설명으로 읽힌다", async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/") && r.method() !== "GET")
        writes.push(`${r.method()} ${r.url()}`);
    });
    await page.goto("/signup");
    const fill = (f: string, v: string) =>
      page.locator(`#account-${f}`).fill(v);
    await fill("storeName", "온도의류");
    await fill("ownerName", "김온도");
    await fill("email", "new@ondo.test");
    await fill("password", "ondo1234!");
    await fill("passwordConfirm", "ondo1234!");
    await fill("phone", "010-1234-5678");
    await fill("bizNo", "123-45-67890");
    await fill("address", "청평화패션몰 2층 24호");
    await page.locator("#account-address").press("Enter");

    /* 규칙 8: Enter를 받은 요소와 안내 위치를 남긴다 */
    const evidence = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const notice = document.getElementById("account-signup-closed");
      const rect = notice?.getBoundingClientRect();
      const button = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "가입하기",
      );
      const bRect = button?.getBoundingClientRect();
      const style = notice ? getComputedStyle(notice) : null;
      return {
        url: location.pathname,
        active: active ? `${active.tagName.toLowerCase()}#${active.id}` : null,
        noticeTop: rect ? Math.round(rect.top) : null,
        noticeBottom: rect ? Math.round(rect.bottom) : null,
        buttonTop: bRect ? Math.round(bRect.top) : null,
        viewport: window.innerHeight,
        noticeColor: style?.color,
        noticeBg: style?.backgroundColor,
        noticeRadius: style?.borderRadius,
        session: sessionStorage.getItem("ondo.wholesale.session"),
      };
    });
    appendFileSync(
      `${QA_DIR}/scenario-a.json`,
      `${JSON.stringify(evidence)}\n`,
    );
    await shot(page, "local-w-signup-enter");

    await expect(page).toHaveURL(/\/signup$/);
    expect(evidence.session).toBeNull();
    expect(writes).toEqual([]);
    await expect(page.locator("body")).not.toContainText("심사 중");
    await expect(
      page.getByRole("button", { name: "가입하기", exact: true }),
    ).toHaveAccessibleDescription(NOTICE);
    await expect(page.locator("form")).toHaveAttribute(
      "aria-describedby",
      "account-signup-closed",
    );

    /* 반복 4패턴 4(실행 신호): 잠긴 '가입하기'까지 내려갔을 때 이유가 화면에 있는가.
       F6 — 1470x900에서 안내는 버튼보다 1000px 넘게 위라 버튼과 같이 안 보인다 */
    const button = page.getByRole("button", { name: "가입하기", exact: true });
    await button.scrollIntoViewIfNeeded();
    const atButton = await page.evaluate(() => {
      const r = document
        .getElementById("account-signup-closed")!
        .getBoundingClientRect();
      return {
        noticeBottom: Math.round(r.bottom),
        viewport: window.innerHeight,
      };
    });
    appendFileSync(
      `${QA_DIR}/scenario-a.json`,
      `${JSON.stringify({ atButton })}\n`,
    );
    await page.screenshot({ path: `${QA_DIR}/local-w-signup-at-button.png` });
  });
});
