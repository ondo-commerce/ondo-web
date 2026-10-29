import { expect, test, type Page } from "@playwright/test";
import {
  collectConsoleErrors,
  countDialogs,
  FAILURE_TEXT,
  uploadAbortStats,
  waitUploadsStarted,
  watchRequests,
} from "./helpers";
import {
  cancelButton,
  chooseFiles,
  fillProductPanel,
  jpg,
  leaveDialog,
  login,
  openCreateWithPost,
  openEdit,
} from "../loop-01-upload/helpers";

/**
 * #252 S5 — 앱 안 Link 이탈 가드. 상단 메뉴·로고·계정 메뉴 Link 를 실제로 누른다.
 * 품명은 정확 일치로 잡는다 — 목록의 `품번·품명 검색` 칸과 섞이면 남의 칸에 쓴다(#253).
 */

function nameInput(page: Page) {
  return page.getByLabel("품명", { exact: true });
}

function menuLink(page: Page, label: string) {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: label });
}

function logoLink(page: Page) {
  return page.getByRole("link", { name: "온도 ERP" });
}

function continueButton(page: Page) {
  return leaveDialog(page).getByRole("button", { name: "계속 작성" });
}

function leaveButton(page: Page) {
  return leaveDialog(page).getByRole("button", { name: "나가기" });
}

/** 목록에서 `상품 등록` 링크로 들어온다 — 이전 이력이 있는 진입(Codex r1-7) */
async function enterCreateFromList(page: Page) {
  await page.goto("/products");
  await page.getByRole("link", { name: "상품 등록" }).click();
  await page.waitForURL((url) => url.pathname === "/products/new");
  await expect(nameInput(page)).toBeVisible();
}

function pathname(page: Page) {
  return new URL(page.url()).pathname;
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await login(page);
});

test.describe("S5-1 입력이 있으면 Link 가 모달을 띄운다", () => {
  test("등록 화면 — 상단 메뉴 재고: 계속 작성이면 남고, 나가기면 재고로", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");

    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();
    expect(pathname(page)).toBe("/products/new");
    await expect(nameInput(page)).toHaveValue("가");

    await continueButton(page).click();
    await expect(leaveDialog(page)).toBeHidden();
    await expect(nameInput(page)).toHaveValue("가");
    expect(pathname(page)).toBe("/products/new");

    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveButton(page).click();
    await page.waitForURL((url) => url.pathname === "/inventory");
  });

  test("수정 화면 — 로고 Link 도 같다", async ({ page }) => {
    await openEdit(page, 1001);
    await nameInput(page).fill("바뀐 품명");

    await logoLink(page).click();
    await expect(leaveDialog(page)).toBeVisible();
    expect(pathname(page)).toBe("/products/1001/edit");
    await continueButton(page).click();
    await expect(nameInput(page)).toHaveValue("바뀐 품명");

    await logoLink(page).click();
    await leaveButton(page).click();
    await page.waitForURL((url) => url.pathname === "/dashboard");
  });

  test("계정 메뉴 Link — 메뉴가 닫히고 모달이 뜬다", async ({ page }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");

    await page.getByRole("button", { name: /계정 메뉴$|^계정$/ }).click();
    const bankLink = page.getByRole("link", {
      name: /정산 계좌 등록|계좌 수정/,
    });
    await bankLink.click();

    await expect(leaveDialog(page)).toBeVisible();
    await expect(bankLink).toBeHidden();
    expect(pathname(page)).toBe("/products/new");
    await expect(nameInput(page)).toHaveValue("가");

    await leaveButton(page).click();
    await page.waitForURL((url) => url.pathname !== "/products/new");
  });
});

test.describe("S5-2 입력이 없으면 Link 가 모달 없이 바로 간다", () => {
  test("등록 초기값", async ({ page }) => {
    await enterCreateFromList(page);
    await menuLink(page, "재고").click();
    await page.waitForURL((url) => url.pathname === "/inventory");
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("수정 서버값 그대로", async ({ page }) => {
    await openEdit(page, 1001);
    await menuLink(page, "재고").click();
    await page.waitForURL((url) => url.pathname === "/inventory");
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("등록 — 입력했다 다 지우면", async ({ page }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await nameInput(page).fill("");
    await menuLink(page, "재고").click();
    await page.waitForURL((url) => url.pathname === "/inventory");
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("수정 — 바꿨다 원래 값으로 되돌리면", async ({ page }) => {
    await openEdit(page, 1001);
    const original = await nameInput(page).inputValue();
    await nameInput(page).fill("잠깐 바꿈");
    await nameInput(page).fill(original);
    await menuLink(page, "재고").click();
    await page.waitForURL((url) => url.pathname === "/inventory");
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});

test("S5-3 ⌘/Ctrl+클릭은 가드하지 않는다 — 새 탭, 원래 탭은 그대로", async ({
  page,
  context,
}) => {
  await enterCreateFromList(page);
  await nameInput(page).fill("가");

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    menuLink(page, "재고").click({ modifiers: ["ControlOrMeta"] }),
  ]);
  // 새 탭은 about:blank 로 먼저 열린다 — 로드 상태가 아니라 실제 이동을 기다린다(F4).
  // 세션은 탭별 sessionStorage 라 새 탭이 ErpGuard 에 걸려 /login 으로 갈 수도 있다. 둘 다 "열렸다"다
  await popup.waitForURL(
    (url) => url.pathname === "/inventory" || url.pathname === "/login",
  );

  expect(pathname(page)).toBe("/products/new");
  await expect(nameInput(page)).toHaveValue("가");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("S5-4 Link 로 연 모달을 닫으면 포커스는 취소 버튼", () => {
  test("계속 작성", async ({ page }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();
    await continueButton(page).click();
    await expect(cancelButton(page)).toBeFocused();
  });

  test("Esc", async ({ page }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(leaveDialog(page)).toBeHidden();
    await expect(cancelButton(page)).toBeFocused();
  });
});

test.describe("S5-5 떠나기로 한 이동엔 모달도 경고도 없다", () => {
  test("등록 성공 뒤 이동", async ({ page }) => {
    const dialogs = countDialogs(page);
    await enterCreateFromList(page);
    await fillProductPanel(page);
    // `함께 게시` 없이 상품만 — 버튼 문구가 `상품 등록`이다
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    await page.waitForURL(/\/products\?productId=\d+/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await menuLink(page, "재고").click();
    await page.waitForURL((url) => url.pathname === "/inventory");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });

  test("취소 → 나가기 뒤 이동", async ({ page }) => {
    const dialogs = countDialogs(page);
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await cancelButton(page).click();
    await leaveButton(page).click();
    await page.waitForURL((url) => url.pathname === "/products");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });
});

test("S4-1 ③ 업로드 중 상단 메뉴 Link → 나가기: abort 2, reject 2, 늦은 결과 없음", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-1.jpg"), jpg("slow5s-2.jpg")]);
  await waitUploadsStarted(page, 2);

  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await page.waitForURL((url) => url.pathname === "/inventory");

  await expect
    .poll(() => uploadAbortStats(page))
    .toEqual({
      aborted: 2,
      rejected: 2,
    });
  await page.waitForTimeout(5_500);
  expect(pathname(page)).toBe("/inventory");
  await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
