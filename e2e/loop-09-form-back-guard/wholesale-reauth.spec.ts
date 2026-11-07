import { expect, test, type Page } from "@playwright/test";
import { armFetchGate, installFetchGate, openFetchGate, T0 } from "./helpers";
import {
  countDialogs,
  requests,
  UPLOAD,
  watchRequests,
} from "../loop-03-upload-lifecycle/helpers";
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
  OTHER,
  signIn,
  signOut,
} from "../loop-08b-chat-filter-history/helpers";

/**
 * loop-09 S2(#403) — 업로드 401로 잠긴 상품 폼이 다른 탭의 같은 계정 로그인으로 풀린다.
 *
 * 두 탭은 같은 context의 두 페이지다(08c `openSecondTab` 꼴). sessionStorage는 탭마다 따로라 탭 2는 로그인 화면부터
 * 시작하고, BroadcastChannel은 닿는다. 목(MSW)은 탭마다 따로라 서버 세션을 흉내 내지 않는다 — 탭 1의 잠금은
 * `auth401` 파일 한 장이 만들고, 재로그인 뒤 요청은 그냥 성공한다(기획 §5-2).
 */

const ME = "e2e@ondo.test";
const SESSION_LOST =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";
const RESTORED = "다시 로그인했어요. 이어서 저장할 수 있어요.";

function nameInput(page: Page) {
  return page.getByLabel("품명", { exact: true });
}

function lostAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: SESSION_LOST });
}

function restoredStatus(page: Page) {
  return page.getByRole("status").filter({ hasText: RESTORED });
}

function reloginLink(page: Page) {
  return page.getByRole("link", { name: "새 탭에서 로그인" });
}

function retryButton(page: Page) {
  return page.getByRole("button", { name: /다시 시도$/ });
}

async function openSecondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  return tab;
}

/** 등록 칸 1장(a.jpg) 뒤 `auth401` → 잠금. 잠금 전 등록 칸 `src`를 돌려준다 */
async function registerThenLock(page: Page, before: number): Promise<string> {
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

/** 탭 2에서 같은 계정 로그인 → 탭 1로 돌아와 풀림을 본다 */
async function reloginInSecondTab(page: Page): Promise<void> {
  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await page.bringToFront();
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  // 문은 기록 바깥쪽이다 — 열린 뒤에야 기록이 생긴다(helpers 주석)
  await installFetchGate(page);
  await login(page);
});

test("S2-2 (R1 등록) auth401 잠금 → 탭 2 같은 계정 로그인 → 탭 1 풀림 문구, 저장과 + 켜짐, 품명과 등록 칸 그대로, 이동 0", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await nameInput(page).fill("재인증 상품");
  const src = await registerThenLock(page, 0);

  await reloginInSecondTab(page);

  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  await expect(lostAlert(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  await expect(addSlot(page)).toBeEnabled();
  await expect(nameInput(page)).toHaveValue("재인증 상품");
  await expect(registered(page)).toHaveCount(1);
  await expect(registered(page).first().locator("img")).toHaveAttribute(
    "src",
    src,
  );
  expect(new URL(page.url()).pathname).toBe("/products/new");
  expect(dialogs.count).toBe(0);
});

test("S2-3 (R2 등록) 풀린 뒤 저장 → POST 본문 listing.images = 잠금 전 URL, 업로드 재요청 0, 상세로 이동", async ({
  page,
}) => {
  await openCreateWithPost(page);
  const src = await registerThenLock(page, 0);
  await reloginInSecondTab(page);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  const uploadsAtRestore = (await requests(page, UPLOAD)).length;

  await fillProductPanel(page);
  await fillPostPanel(page);
  const body = await submitCreate(page);

  expect(body.listing.images).toEqual([src]);
  const posts = await requests(page, { path: /\/products$/, method: "POST" });
  expect(posts.at(-1)?.status).toBe(201);
  expect((await requests(page, UPLOAD)).length).toBe(uploadsAtRestore);
  expect(page.url()).toMatch(/\/products\?productId=\d+$/);
  // 저장을 누르면 풀림 문구는 사라진다(이동 전 화면은 떠났으니 상세에도 없다)
  await expect(restoredStatus(page)).toHaveCount(0);
});

test("S2-4 (R1 R2 수정) 1장 올림 → auth401 잠금 → 탭 2 로그인 → 풀림 → 저장 PATCH 200, images = 서버 목록 + 새 URL 1개", async ({
  page,
}) => {
  await openEdit(page, 1002);
  /*
   * 들어올 때 서버 URL 목록. 칸의 `img`에서 읽지 않는다 — 시드 CDN 주소는 실제로 안 열려
   * `ListingImage`가 아이콘으로 바꿔 그린다(img 0개). loop-01 `SEED_1002`와 같은 값
   */
  const entry = ["https://cdn.ondo.test/listings/2002/1.jpg"];
  await expect(registered(page)).toHaveCount(entry.length);

  const added = await registerThenLock(page, entry.length);
  await reloginInSecondTab(page);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });

  await saveButton(page).click();
  await page.waitForURL(/productId=1002/);
  const patches = await requests(page, {
    path: /\/products\/1002$/,
    method: "PATCH",
  });
  expect(patches.at(-1)?.status).toBe(200);
  const body = await lastUpdateRequest(page);
  expect(body.listing?.images).toEqual([...entry, added]);
});

test("S2-5 (되살림) 잠금 중 `새 탭에서 로그인` → 새 탭 /login, 원래 탭 이동 0 → 새 탭 로그인 → 원래 탭 풀림, 링크 0", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await nameInput(page).fill("링크 상품");
  await registerThenLock(page, 0);

  const link = reloginLink(page);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/login");
  await expect(link).toHaveAttribute("target", "_blank");
  // 링크는 알림 밖 형제다 — 알림 글자는 그대로
  await expect(lostAlert(page)).toHaveText(SESSION_LOST);

  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    link.click(),
  ]);
  await tab.waitForURL(/\/login$/);
  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(
    0,
  );
  await expect(nameInput(page)).toHaveValue("링크 상품");

  await signIn(tab, ME);
  await page.bringToFront();
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  await expect(reloginLink(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/products/new");
  expect(dialogs.count).toBe(0);
});

test("S2-6 (R3) 잠금 중 탭 2 다른 계정 로그인 → 탭 1 /login, 폼 0 → 탭 1 다시 로그인 → 빈 등록 폼", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await nameInput(page).fill("앞 계정 상품");
  await registerThenLock(page, 0);

  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);
  await page.bringToFront();

  await page.waitForURL(/\/login/);
  await expect(nameInput(page)).toHaveCount(0);
  expect(dialogs.count).toBe(0);

  await signIn(page, ME);
  await openCreateWithPost(page);
  await expect(nameInput(page)).toHaveValue("");
  await expect(registered(page)).toHaveCount(0);
  await expect(page.getByText("앞 계정 상품")).toHaveCount(0);
});

test("S2-7 ① 잠금 아닌 폼 + 탭 2 같은 계정 로그인 → 탭 1 변화 0(고정 시계 500ms 뒤)", async ({
  page,
}) => {
  await page.goto("/products/new");
  await nameInput(page).fill("그대로 상품");
  // 시계는 도착 뒤에 깐다(02-dev-255 §4 2)
  await page.clock.install({ time: T0 });

  await reloginInSecondTab(page);
  await page.clock.runFor(500);

  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(nameInput(page)).toHaveValue("그대로 상품");
  await expect(restoredStatus(page)).toHaveCount(0);
  await expect(lostAlert(page)).toHaveCount(0);
});

test("S2-7 ② 탭 2 로그아웃 → 탭 1 /login, 폼 0, dialog 이벤트 0", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await page.goto("/products/new");
  await nameInput(page).fill("로그아웃 상품");

  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await signOut(tab);
  await page.bringToFront();

  await page.waitForURL(/\/login/);
  await expect(nameInput(page)).toHaveCount(0);
  expect(dialogs.count).toBe(0);
});

test("S2-8 (늦은 401) 업로드를 문에 붙잡은 채 탭 2 같은 계정 로그인 → 문 열기 → 401 → 잠금 0, 그 칸만 다시 시도", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductPanel(page);
  await fillPostPanel(page);
  await armFetchGate(page, /\/listing-images$/, "POST");
  await chooseFiles(page, [jpg("auth401.jpg")]);
  // 문이 기록 바깥이라 `waitUploadsStarted`는 0을 본다 — 진행 칸으로 "요청이 떠났다"를 본다
  await expect(slotsIn(page, "uploading")).toHaveCount(1);

  await reloginInSecondTab(page);
  // 잠금이 없었으니 풀림 문구도 없다
  await expect(restoredStatus(page)).toHaveCount(0);
  await openFetchGate(page);

  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(retryButton(page)).toBeEnabled();
  await expect
    .poll(async () => (await requests(page, UPLOAD)).at(-1)?.status)
    .toBe(401);
  await expect(lostAlert(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  await expect(addSlot(page)).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/products/new");
});

test("S2-9 (재로그인 뒤 재시도) fail500once 실패 칸 → auth401 잠금, 다시 시도 disabled → 탭 2 로그인 → enabled → 눌러서 등록", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("r-fail500once.jpg")]);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(retryButton(page)).toBeEnabled();

  await chooseFiles(page, [jpg("auth401.jpg")]);
  await expect(lostAlert(page)).toBeVisible();
  await expect(retryButton(page)).toBeDisabled();

  await reloginInSecondTab(page);
  await expect(restoredStatus(page)).toBeVisible({ timeout: 5_000 });
  await expect(retryButton(page)).toBeEnabled();

  await retryButton(page).click();
  await expect(registered(page)).toHaveCount(1);
  await expect(slotsIn(page, "failed")).toHaveCount(0);
});
