import { expect, test, type Page } from "@playwright/test";
import {
  armGetFault,
  disarmGetFault,
  expectEntrances,
  formLine,
  getFaultHits,
  HOOK,
  installGetFault,
  listenSessionBroadcast,
  nameInput,
  reloginInSecondTab,
  reloginLink,
  restoredStatus,
  SAVE_AUTH_LATE,
  SAVE_AUTH_LATE_PARTIAL,
  serverDetail,
  SERVER_401_TEXT,
  SESSION_LOST,
  SESSION_LOST_PARTIAL,
  waitSessionBroadcast,
} from "./helpers";
import {
  armFetchGate,
  installFetchGate,
  openFetchGate,
  pinnedPriceInput,
  T0,
} from "../loop-09-form-back-guard/helpers";
import {
  countDialogs,
  requests,
  watchRequests,
  type WatchedRequest,
} from "../loop-03-upload-lifecycle/helpers";
import {
  addSlot,
  chooseFiles,
  fillPostPanel,
  fillProductPanel,
  jpg,
  lastProductRequest,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  slotsIn,
  statusRadio,
  uploadRequestCount,
} from "../loop-01-upload/helpers";

/**
 * loop-10 S2(#404) — 상품 저장 401도 업로드 401처럼 폼을 잠그고, 다른 탭의 같은 계정 로그인으로
 * 풀린 뒤 같은 화면에서 다시 저장한다. 401은 목 손잡이 `[auth401]`(품명 또는 저장된 게시글 제목,
 * 같은 키 첫 요청만)이 만든다. 목은 탭마다 따로라 탭 2 로그인은 방송만 보낸다(loop-09와 같다).
 */

const POST_PRODUCTS = { path: /\/products$/, method: "POST" } as const;

test.beforeEach(async ({ page }) => {
  // 순서가 감싸는 순서다(helpers 머리 주석). 셋 다 첫 `goto`(login) 전에
  await installGetFault(page);
  await watchRequests(page);
  await installFetchGate(page);
  await login(page);
});

test("S2-3 S2-4 등록 POST 401 → 잠금, 입력 남음 → 탭 2 같은 계정 로그인 → 풀림 → 저장 201, 같은 품명, 목록 이동", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await fillProductPanel(page);
  await fillPostPanel(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1);
  const name = `니트 ${HOOK}`;
  await nameInput(page).fill(name);
  const price = page.getByRole("textbox", { name: "블랙 M 판매가" });
  // 시계는 도착 뒤에 깐다(loop-09 02-dev-255 §4 2)
  await page.clock.install({ time: T0 });

  // S2-3 잠금
  await saveButton(page).click();
  await expect(formLine(page)).toHaveText(SESSION_LOST);
  await expect(formLine(page)).toHaveAttribute("data-ac", "S4-3 S4-7 10:S2-3");
  await page.clock.runFor(500);
  expect(new URL(page.url()).pathname).toBe("/products/new");
  expect(dialogs.count).toBe(0);
  await expect(reloginLink(page)).toHaveCount(1);
  await expect(saveButton(page)).toBeDisabled();
  await expect(nameInput(page)).toHaveValue(name);
  await expect(price).toHaveValue("12000");
  await expect(page.getByText(SERVER_401_TEXT)).toHaveCount(0);

  // S2-4 풀림 → 저장
  await listenSessionBroadcast(page);
  await reloginInSecondTab(page);
  await waitSessionBroadcast(page);
  await expect(restoredStatus(page)).toHaveCount(1);
  await expect(formLine(page)).toHaveCount(0);
  await expect(reloginLink(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();

  await saveButton(page).click();
  await expect(restoredStatus(page)).toHaveCount(0);
  await page.waitForURL(/\/products\?productId=\d+$/);
  const posts = await requests(page, POST_PRODUCTS);
  expect(posts.map((r) => r.status)).toEqual([401, 201]);
  const body = (await lastProductRequest(page)) as { name: string };
  expect(body.name).toBe(name);
  expect(dialogs.count).toBe(0);
});

test("S2-5 수정 PATCH 401 + 올린 사진과 실패 칸 → 세 입구 동시 잠김 → 풀림 셋 → 저장 PATCH 200, 본문 그대로, 업로드 재요청 0", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openEdit(page, 1002);
  await expect(registered(page)).toHaveCount(1);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(2);
  await chooseFiles(page, [jpg("fail500.jpg")]);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  const retry = failed.getByRole("button", { name: /다시 시도$/ });
  await expect(retry).toBeEnabled();
  const uploads = await uploadRequestCount(page);
  const added = (await lastAddedUrl(page)) ?? "";

  const name = `${await nameInput(page).inputValue()} ${HOOK}`;
  await nameInput(page).fill(name);
  const price = await pinnedPriceInput(page);
  await price.fill("15500");
  await page.clock.install({ time: T0 });

  await saveButton(page).click();
  await expect(formLine(page)).toHaveText(SESSION_LOST);
  await page.clock.runFor(500);
  expect(new URL(page.url()).pathname).toBe("/products/1002/edit");
  expect(dialogs.count).toBe(0);
  await expectEntrances([saveButton(page), addSlot(page), retry], false);
  await expect(registered(page)).toHaveCount(2);
  await expect(failed).toHaveCount(1);
  expect(await uploadRequestCount(page)).toBe(uploads);

  await listenSessionBroadcast(page);
  await reloginInSecondTab(page);
  await waitSessionBroadcast(page);
  await expect(restoredStatus(page)).toHaveCount(1);
  await expectEntrances([saveButton(page), addSlot(page), retry], true);

  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=1002$/);
  const patches = await requests(page, {
    path: /\/products\/1002$/,
    method: "PATCH",
  });
  expect(patches.map((r) => r.status)).toEqual([401, 200]);
  const body = (await lastProductRequest(page)) as {
    name: string;
    listing: { images: string[]; variantPrices: { salePrice: number }[] };
  };
  expect(body.name).toBe(name);
  expect(body.listing.variantPrices.map((p) => p.salePrice)).toContain(15500);
  expect(body.listing.images).toContain(added);
  expect(await uploadRequestCount(page)).toBe(uploads);
});

/** S2-6 ①②③: 1001(ON_SALE)을 반쯤 저장 잠금까지 끌고 가 잠금, GET 0, 서버 반쯤을 단언한다 */
async function lockPartially(page: Page, dialogs: { count: number }) {
  await openEdit(page, 1001);
  await armGetFault(page, /\/products\/1001$/);
  const title = page.getByLabel("게시글 이름");
  const hooked = `${await title.inputValue()} ${HOOK}`;
  await title.fill(hooked);
  await statusRadio(page, "시즌 종료").click();
  await page.clock.install({ time: T0 });

  // ① 잠금
  await saveButton(page).click();
  await expect(formLine(page)).toHaveText(SESSION_LOST_PARTIAL);
  await expect(formLine(page)).toHaveAttribute("data-ac", "S4-3 S4-7 10:S2-6");
  await page.clock.runFor(500);
  expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
  expect(dialogs.count).toBe(0);
  await expect(reloginLink(page)).toHaveCount(1);
  await expect(saveButton(page)).toBeDisabled();
  await expect(statusRadio(page, "시즌 종료")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(title).toHaveValue(hooked);
  const firstRound = await requests(page, {
    path: /\/products\/1001$|season-end$/,
  });
  // 들어올 때의 상세 GET은 빼고 본다(저장 도중 GET은 ②가 고장 횟수로 본다)
  expect(firstRound.filter((r) => r.method !== "GET").map(line)).toEqual([
    "PATCH 200",
    "POST 401",
  ]);

  // ② 저장 도중 상세 GET 0
  expect(await getFaultHits(page)).toBe(0);

  // ③ 서버는 반쯤
  await disarmGetFault(page);
  const half = await serverDetail(page, 1001);
  expect(half.listing.title).toContain(HOOK);
  expect(half.listing.status).toBe("ON_SALE");
}

/*
 * AC 조건 변경(02-dev-404 §조건 변경 1): ④ "잠금 중 판매가 한 칸을 P로"는 화면에서 할 수 없다. `시즌 종료`를 고른
 * 폼은 게시글 칸(이름, 설명, 가격표)을 잠근다 — 반쯤 저장은 늘 `시즌 종료`를 고른 상태라 판매가 칸이 disabled다.
 * 그래서 잠금 중엔 열려 있는 품명을 고치고, 원래 조건은 아래 시험이 `test.fail`로 남긴다.
 */
test("S2-6 원래 조건 ④ 반쯤 저장 잠금 중 판매가 칸을 고칠 수 있다", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await lockPartially(page, dialogs);
  const price = await pinnedPriceInput(page);
  test.fail(
    true,
    "시즌 종료를 고른 폼은 가격표를 잠근다(기존 동작, 이번 변경 아님)",
  );
  await expect(price).toBeEnabled({ timeout: 1_000 });
});

test("S2-6 반쯤 저장(PATCH 200 → 시즌 종료 401) → 반쯤 저장 잠금, 저장 도중 GET 0 → 잠금 중 품명 고침 → 풀림 → PATCH → 시즌 종료, 서버 = 지금 입력", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await lockPartially(page, dialogs);

  // ④ 잠금 중 품명 고침(조건 변경, 위 주석)
  const renamed = "잠금 중 고친 셔츠";
  await nameInput(page).fill(renamed);

  // ⑤ 풀림 → 저장
  await listenSessionBroadcast(page);
  await reloginInSecondTab(page);
  await waitSessionBroadcast(page);
  await expect(restoredStatus(page)).toHaveCount(1);
  const before = (await requests(page, { path: /./ })).length;
  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=1001$/);
  const after = (await requests(page, { path: /./ })).slice(before);
  const saveRound = after.filter((r) =>
    /\/products\/1001$|season-end$/.test(r.url),
  );
  expect(saveRound.slice(0, 2).map(line)).toEqual(["PATCH 200", "POST 200"]);
  expect(saveRound[1]?.url).toMatch(/season-end$/);
  const body = (await lastProductRequest(page)) as { name: string };
  expect(body.name).toBe(renamed);

  // ⑥ 서버 최종
  const final = await serverDetail(page, 1001);
  expect(final.listing.status).toBe("SEASON_ENDED");
  expect(final.listing.title).toContain(HOOK);
  expect(final.name).toBe(renamed);
});

test("S2-7 늦은 401(재로그인 전에 떠난 등록 POST) → 잠금 0, 늦은 401 문구, 저장 켜짐 → 다시 저장 201 → 목록", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductPanel(page);
  await fillPostPanel(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1);
  const name = `니트 ${HOOK}`;
  await nameInput(page).fill(name);
  await listenSessionBroadcast(page);

  await armFetchGate(page, /\/products$/, "POST");
  await saveButton(page).click();
  // 저장 버튼 잠김 = 요청이 출발해 문에 섰다
  await expect(saveButton(page)).toBeDisabled();
  await reloginInSecondTab(page);
  await waitSessionBroadcast(page);
  await openFetchGate(page);

  await expect(formLine(page)).toHaveText(SAVE_AUTH_LATE);
  // 10-M2: 표식은 문구 요소에
  await expect(formLine(page)).toHaveAttribute("data-ac", "10:S2-7");
  await expect(page.getByText(SESSION_LOST)).toHaveCount(0);
  await expect(reloginLink(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  await expect(nameInput(page)).toHaveValue(name);
  expect(new URL(page.url()).pathname).toBe("/products/new");

  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=\d+$/);
  const posts = await requests(page, POST_PRODUCTS);
  expect(posts.map((r) => r.status)).toEqual([401, 201]);
});

/*
 * 10-M1(메타 리뷰): 수정 화면의 늦은 401 세 갈래. 문은 진짜 `fetch` 전에 서므로 "재로그인 전에 떠난
 * 요청"까지 증명한다(S2-7과 같은 범위). 셋 다 1001(ON_SALE)에서 시작한다.
 */
const PATCH_1001 = /\/products\/1001$/;

/** 게시글 제목에 손잡이 + `시즌 종료` → PATCH는 200, 시즌 종료가 첫 401 */
async function partialSetup(page: Page): Promise<void> {
  await openEdit(page, 1001);
  const title = page.getByLabel("게시글 이름");
  await title.fill(`${await title.inputValue()} ${HOOK}`);
  await statusRadio(page, "시즌 종료").click();
  await listenSessionBroadcast(page);
}

async function reloginWhileHeld(page: Page): Promise<void> {
  await reloginInSecondTab(page);
  await waitSessionBroadcast(page);
  await openFetchGate(page);
}

test("10-M1 ① 수정 PATCH 늦은 401 → 잠금 0, 늦은 401 문구, 저장 켜짐", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await nameInput(page).fill(`${await nameInput(page).inputValue()} ${HOOK}`);
  await listenSessionBroadcast(page);
  await armFetchGate(page, PATCH_1001, "PATCH");
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();
  await reloginWhileHeld(page);

  await expect(formLine(page)).toHaveText(SAVE_AUTH_LATE);
  await expect(formLine(page)).toHaveAttribute("data-ac", "10:S2-7");
  await expect(reloginLink(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
});

test("10-M1 ② 반쯤 저장의 시즌 종료 늦은 401 → 잠금 0, 반쯤 저장 늦은 문구, 저장 켜짐", async ({
  page,
}) => {
  await partialSetup(page);
  await armFetchGate(page, /season-end$/, "POST");
  await saveButton(page).click();
  // PATCH 200이 기록되면 시즌 종료가 문에 섰다(문은 기록 바깥이다)
  await expect
    .poll(async () =>
      (await requests(page, { path: PATCH_1001, method: "PATCH" })).map(line),
    )
    .toEqual(["PATCH 200"]);
  await reloginWhileHeld(page);

  await expect(formLine(page)).toHaveText(SAVE_AUTH_LATE_PARTIAL);
  await expect(formLine(page)).toHaveAttribute("data-ac", "10:S2-7");
  await expect(reloginLink(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
});

test("10-M1 ③ PATCH 대기 중 재로그인 → PATCH 200 → 새 세대로 떠난 시즌 종료 401 → 반쯤 저장 잠금", async ({
  page,
}) => {
  await partialSetup(page);
  await armFetchGate(page, PATCH_1001, "PATCH");
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();
  await reloginWhileHeld(page);

  await expect(formLine(page)).toHaveText(SESSION_LOST_PARTIAL);
  await expect(formLine(page)).toHaveAttribute("data-ac", "S4-3 S4-7 10:S2-6");
  await expect(reloginLink(page)).toHaveCount(1);
  await expect(saveButton(page)).toBeDisabled();
  const sent = await requests(page, { path: /\/products\/1001$|season-end$/ });
  expect(sent.filter((r) => r.method !== "GET").map(line)).toEqual([
    "PATCH 200",
    "POST 401",
  ]);
});

function line(r: WatchedRequest): string {
  return `${r.method} ${r.status}`;
}

/** 방금 올린 등록 칸의 서버 URL. 목이 마지막 업로드 응답으로 준 blob URL을 칸 `img`가 그린다 */
function lastAddedUrl(page: Page): Promise<string | null> {
  return registered(page).last().locator("img").getAttribute("src");
}
