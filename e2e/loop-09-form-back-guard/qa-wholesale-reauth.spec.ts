import { expect, test, type Page } from "@playwright/test";
import { armFetchGate, installFetchGate, openFetchGate, T0 } from "./helpers";
import {
  addSlot,
  chooseFiles,
  fillPostPanel,
  fillProductPanel,
  jpg,
  lastUpdateRequest,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  slotsIn,
  submitCreate,
} from "../loop-01-upload/helpers";
import {
  countDialogs,
  requests,
  UPLOAD,
  watchRequests,
} from "../loop-03-upload-lifecycle/helpers";
import {
  OTHER,
  signIn,
  signOut,
} from "../loop-08b-chat-filter-history/helpers";

/**
 * loop-09 QA — #403 S2 재인증 복구를 개발 spec과 따로 본다(brief-qa 할 것 2-8 ~ 2-10).
 * 개발 spec보다 더 보는 것:
 * - 탭 1이 잠금 뒤 어떤 URL로도 이동하지 않았는지를 `framenavigated` 기록으로(`/login` 0)
 * - 링크 `rel`과 풀린 뒤 링크 0, 1280x800 스크린샷(잠금, 풀림)
 * - S2-6 앞 계정 품명이 로그인 화면 본문에도 0
 * - S2-8 같은 문에 걸린 일반 파일 1장이 늦은 401 뒤에도 등록된다(큐 계속, 기획 §4-4 늦은 401 행)
 */

const ME = "e2e@ondo.test";
const SESSION_LOST =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";
const RESTORED = "다시 로그인했어요. 이어서 저장할 수 있어요.";
const SHOTS = ".claude/harness/runs/loop-09-form-back-guard/qa";

const nameInput = (page: Page) => page.getByLabel("품명", { exact: true });
const lostAlert = (page: Page) =>
  page.getByRole("alert").filter({ hasText: SESSION_LOST });
const restoredStatus = (page: Page) =>
  page.getByRole("status").filter({ hasText: RESTORED });
const reloginLink = (page: Page) =>
  page.getByRole("link", { name: "새 탭에서 로그인", exact: true });
const retryButton = (page: Page) =>
  page.getByRole("button", { name: /다시 시도$/ });

/** 탭 1의 메인 프레임 이동 URL을 모은다 */
function trackNavigations(page: Page): string[] {
  const urls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname);
  });
  return urls;
}

async function secondTabSignIn(page: Page, email: string): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await signIn(tab, email);
  await page.bringToFront();
  return tab;
}

async function lockAfterOne(page: Page, before: number): Promise<string> {
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(before + 1);
  const src = await registered(page).last().locator("img").getAttribute("src");
  expect(src).toBeTruthy();
  await chooseFiles(page, [jpg("auth401.jpg")]);
  await expect(lostAlert(page)).toHaveText(SESSION_LOST);
  await expect(saveButton(page)).toBeDisabled();
  await expect(addSlot(page)).toBeDisabled();
  return src ?? "";
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installFetchGate(page);
  await login(page);
});

test.describe("1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("S2-2 + S2-3 + S2-5 잠금(링크) → 탭 2 같은 계정 → 풀림, 이동 0 → 저장 POST images = 잠금 전 URL, 재요청 0", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await openCreateWithPost(page);
    await fillProductPanel(page);
    await nameInput(page).fill("재인증 상품");
    await fillPostPanel(page);
    const navs = trackNavigations(page);
    const src = await lockAfterOne(page, 0);

    await expect(reloginLink(page)).toHaveAttribute("href", "/login");
    await expect(reloginLink(page)).toHaveAttribute("target", "_blank");
    await expect(reloginLink(page)).toHaveAttribute("rel", "noopener");
    // 디자인 실측: 링크는 본문 글자색(text-foreground)과 알림과 같은 14px, 한 줄 안에 같이 선다
    const look = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find(
        (a) => a.textContent === "새 탭에서 로그인",
      )!;
      const alert = [...document.querySelectorAll('[role="alert"]')].find((p) =>
        p.textContent?.startsWith("로그인이 끊겼어요"),
      )!;
      const probe = document.createElement("span");
      probe.className = "text-foreground";
      document.body.append(probe);
      const foreground = getComputedStyle(probe).color;
      probe.remove();
      const ls = getComputedStyle(link);
      const as = getComputedStyle(alert);
      const lr = link.getBoundingClientRect();
      const ar = alert.getBoundingClientRect();
      return {
        linkColor: ls.color === foreground,
        linkSize: ls.fontSize,
        alertSize: as.fontSize,
        underline: ls.textDecorationLine,
        sameRow:
          Math.abs(lr.top + lr.height / 2 - (ar.top + ar.height / 2)) < 2,
        gap: Math.round(lr.left - ar.right),
      };
    });
    test.info().annotations.push({
      type: "S2-5 실측",
      description: JSON.stringify(look),
    });
    expect(look).toMatchObject({
      linkColor: true,
      linkSize: "14px",
      alertSize: "14px",
      underline: "underline",
      sameRow: true,
      gap: 12,
    });
    await page.screenshot({ path: `${SHOTS}/2026-11-08-s2-locked-1280.png` });
    const uploadsAtLock = (await requests(page, UPLOAD)).length;

    await secondTabSignIn(page, ME);
    await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
    await expect(lostAlert(page)).toHaveCount(0);
    await expect(reloginLink(page)).toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    await expect(addSlot(page)).toBeEnabled();
    await expect(nameInput(page)).toHaveValue("재인증 상품");
    await expect(registered(page)).toHaveCount(1);
    await expect(registered(page).locator("img")).toHaveAttribute("src", src);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    expect(navs).toEqual([]);
    expect(dialogs.count).toBe(0);
    await page.screenshot({
      path: `${SHOTS}/2026-11-08-s2-restored-1280.png`,
    });

    const body = await submitCreate(page);
    expect(body.listing.images).toEqual([src]);
    const posts = await requests(page, {
      path: /\/api\/wholesale\/products$/,
      method: "POST",
    });
    expect(posts.map((p) => p.status)).toEqual([201]);
    expect((await requests(page, UPLOAD)).length).toBe(uploadsAtLock);
    expect(navs.filter((p) => p === "/login")).toEqual([]);
  });
});

/*
 * 기획 §4-5 4 "이 문구는 저장을 누르면 사라진다". 개발 S2-3은 저장 성공 뒤 이동한 화면에서 0을 봐서
 * 화면이 바뀐 덕에 거저 맞는다. 검증 실패로 폼에 머무는 경우를 본다(변이 QM5).
 */
test("S2-2 더 봄: 풀림 문구는 저장을 누르면 사라진다 — 검증 실패로 폼에 머물러도", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await lockAfterOne(page, 0);
  await secondTabSignIn(page, ME);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });

  await saveButton(page).click();
  await expect(restoredStatus(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(registered(page)).toHaveCount(1);
});

test("S2-4 수정 1장 → 잠금 → 탭 2 로그인 → 풀림 → PATCH images = 서버 목록 + 새 URL 순서 그대로", async ({
  page,
}) => {
  await openEdit(page, 1002);
  const entry = ["https://cdn.ondo.test/listings/2002/1.jpg"];
  await expect(registered(page)).toHaveCount(1);
  const added = await lockAfterOne(page, 1);

  await secondTabSignIn(page, ME);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  await saveButton(page).click();
  await page.waitForURL(/productId=1002$/);
  const patches = await requests(page, {
    path: /\/products\/1002$/,
    method: "PATCH",
  });
  expect(patches.map((p) => p.status)).toEqual([200]);
  expect((await lastUpdateRequest(page)).listing?.images).toEqual([
    ...entry,
    added,
  ]);
});

test("S2-6 잠금 중 탭 2 다른 계정 → 탭 1 /login, 로그인 화면에 앞 품명 0 → 다시 로그인 → 빈 폼", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await nameInput(page).fill("앞 계정 상품");
  await lockAfterOne(page, 0);

  await secondTabSignIn(page, OTHER);
  await page.waitForURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "도매 사장님 로그인" }),
  ).toBeVisible();
  await expect(nameInput(page)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("앞 계정 상품");
  expect(dialogs.count).toBe(0);

  await signIn(page, ME);
  expect(await page.locator("body").innerText()).not.toContain("앞 계정 상품");
  await openCreateWithPost(page);
  await expect(nameInput(page)).toHaveValue("");
  await expect(registered(page)).toHaveCount(0);
});

test("S2-7 ① 잠금 아닌 폼 + 탭 2 같은 계정 → 고정 시계 500ms 뒤 URL, 품명, 문구, 이동 0", async ({
  page,
}) => {
  await page.goto("/products/new");
  await nameInput(page).fill("그대로 상품");
  await page.clock.install({ time: T0 });
  const navs = trackNavigations(page);
  const length = await page.evaluate(() => window.history.length);

  await secondTabSignIn(page, ME);
  await page.clock.runFor(500);

  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(nameInput(page)).toHaveValue("그대로 상품");
  await expect(restoredStatus(page)).toHaveCount(0);
  await expect(lostAlert(page)).toHaveCount(0);
  expect(navs).toEqual([]);
  expect(await page.evaluate(() => window.history.length)).toBe(length);
});

test("S2-7 ② 탭 2 로그아웃 → 탭 1 /login, 품명 0, dialog 0", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await page.goto("/products/new");
  await nameInput(page).fill("로그아웃 상품");

  const tab = await secondTabSignIn(page, ME);
  await signOut(tab);
  await page.bringToFront();
  await page.waitForURL(/\/login/);
  await expect(nameInput(page)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("로그아웃 상품");
  expect(dialogs.count).toBe(0);
});

test("S2-8 늦은 401: 문에 걸린 auth401 + 일반 1장 → 탭 2 로그인 → 문 열기 → 잠금 0, 실패 칸 1, 일반 1장 등록", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductPanel(page);
  await fillPostPanel(page);
  await armFetchGate(page, /\/listing-images$/, "POST");
  await chooseFiles(page, [jpg("auth401.jpg"), jpg("b.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(2);

  await secondTabSignIn(page, ME);
  await expect(restoredStatus(page)).toHaveCount(0);
  await openFetchGate(page);

  await expect
    .poll(async () => (await requests(page, UPLOAD)).map((r) => r.status))
    .toEqual(expect.arrayContaining([401, 201]));
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(registered(page)).toHaveCount(1);
  await expect(retryButton(page)).toHaveCount(1);
  await expect(retryButton(page)).toBeEnabled();
  await expect(lostAlert(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  await expect(addSlot(page)).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/products/new");
});

test("S2-9 실패 칸 → auth401 잠금(다시 시도 disabled) → 탭 2 로그인 → enabled → 눌러서 등록", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("r-fail500once.jpg")]);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(retryButton(page)).toBeEnabled();

  await chooseFiles(page, [jpg("auth401.jpg")]);
  await expect(lostAlert(page)).toBeVisible();
  await expect(retryButton(page)).toBeDisabled();

  await secondTabSignIn(page, ME);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  await expect(retryButton(page)).toBeEnabled();
  const before = (await requests(page, UPLOAD)).length;
  await retryButton(page).click();
  await expect(registered(page)).toHaveCount(1);
  await expect(slotsIn(page, "failed")).toHaveCount(0);
  expect((await requests(page, UPLOAD)).length).toBe(before + 1);
});
