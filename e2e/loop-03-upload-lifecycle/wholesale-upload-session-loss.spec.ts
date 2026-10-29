import { expect, test, type Page } from "@playwright/test";
import {
  countDialogs,
  FAILURE_TEXT,
  requests,
  uploadAbortStats,
  waitUploadsStarted,
  watchRequests,
} from "./helpers";
import {
  addSlot,
  cells,
  chooseFiles,
  fillProductForm,
  jpg,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  slotsIn,
} from "../loop-01-upload/helpers";

/**
 * #252 S4-3 · S4-7 — 업로드가 401/403 을 받으면 화면은 남고 큐만 멈춘다.
 *
 * `a.jpg` 를 먼저 등록 칸까지 올린 뒤 나머지를 고른다. 동시 3이라 한 번에 고르면 바로 오는
 * 401 이 600ms 걸리는 성공보다 먼저 와서 "완료분 보존"을 못 본다(Codex r1-7).
 */

const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";
const NOT_APPROVED = "승인된 계정만 사용할 수 있습니다.";

function nameInput(page: Page) {
  return page.getByLabel("품명", { exact: true });
}

function sessionAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: SESSION_LOST });
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await login(page);
});

/** 등록 칸 1장 → `slow5s` 진행 시작 → `auth*` 선택. 나간 업로드 요청 수를 돌려준다 */
async function uploadThenFail(page: Page, hook: "auth401" | "auth403") {
  const before = (await requests(page, { path: /\/listing-images$/ })).length;
  // 고르기 **전에** 센다. 고른 뒤 세면 응답이 먼저 반영됐을 때 없는 개수를 기다린다(F2)
  const registeredCount = (await registered(page).count()) + 1;
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(registeredCount);
  await chooseFiles(page, [jpg("slow5s-auth.jpg")]);
  await waitUploadsStarted(page, before + 2);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);
  await chooseFiles(page, [jpg(`${hook}.jpg`)]);
  return registeredCount;
}

test.describe("S4-3 업로드 401/403 — 완료분과 입력은 남고 진행 칸만 조용히 빠진다", () => {
  test("401 등록 화면", async ({ page }) => {
    const dialogs = countDialogs(page);
    await openCreateWithPost(page);
    await nameInput(page).fill("세션 끊김 상품");

    const kept = await uploadThenFail(page, "auth401");
    expect(kept).toBe(1);

    await expect(sessionAlert(page)).toBeVisible();
    await expect(registered(page)).toHaveCount(1);
    await expect(cells(page)).toHaveCount(1);
    await expect.poll(() => uploadAbortStats(page)).toEqual({
      aborted: 1,
      rejected: 1,
    });

    // slow5s 가 끝났을 시간까지 기다려도 늦은 결과·이동이 없다
    await page.waitForTimeout(5_500);
    await expect(registered(page)).toHaveCount(1);
    await expect(cells(page)).toHaveCount(1);
    await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    await expect(nameInput(page)).toHaveValue("세션 끊김 상품");
    expect(dialogs.count).toBe(0);
  });

  test("401 수정 화면", async ({ page }) => {
    const dialogs = countDialogs(page);
    await openEdit(page, 1001);
    await nameInput(page).fill("수정 중 이름");

    const kept = await uploadThenFail(page, "auth401");
    expect(kept).toBe(3);

    await expect(sessionAlert(page)).toBeVisible();
    await expect(cells(page)).toHaveCount(3);
    await expect.poll(() => uploadAbortStats(page)).toEqual({
      aborted: 1,
      rejected: 1,
    });
    await page.waitForTimeout(5_500);
    await expect(registered(page)).toHaveCount(3);
    expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
    await expect(nameInput(page)).toHaveValue("수정 중 이름");
    expect(dialogs.count).toBe(0);
  });

  test("403 등록 화면 — 같은 정리, 서버 문구, 저장 버튼은 살아 있다", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await openCreateWithPost(page);
    await nameInput(page).fill("승인 대기 상품");

    await uploadThenFail(page, "auth403");

    await expect(
      page.getByRole("alert").filter({ hasText: NOT_APPROVED }),
    ).toBeVisible();
    await expect(registered(page)).toHaveCount(1);
    await expect(cells(page)).toHaveCount(1);
    await expect.poll(() => uploadAbortStats(page)).toEqual({
      aborted: 1,
      rejected: 1,
    });
    await expect(saveButton(page)).toBeEnabled();
    await expect(addSlot(page)).toBeEnabled();
    await expect(sessionAlert(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    expect(dialogs.count).toBe(0);
  });

  test("앞 칸을 기다리던 완료분(보류)은 등록 칸으로 올라가 남는다(§4-3-4)", async ({
    page,
  }) => {
    await openCreateWithPost(page);
    await chooseFiles(page, [jpg("slow5s-front.jpg"), jpg("a.jpg")]);
    await expect(slotsIn(page, "held")).toHaveCount(1);
    await chooseFiles(page, [jpg("auth401.jpg")]);

    await expect(sessionAlert(page)).toBeVisible();
    await expect(registered(page)).toHaveCount(1);
    await expect(cells(page)).toHaveCount(1);
  });
});

test.describe("S4-7 401 뒤 저장과 + 잠금", () => {
  test("등록 — 저장 disabled, 이유 문구를 가리킴, 눌러도 POST 0회, 이동 0회", async ({
    page,
  }) => {
    // 폼이 유효하고 등록 칸 1장이 있다 — 잠금이 없으면 이 클릭은 POST 를 보낸다(F3)
    await openCreateWithPost(page);
    await fillProductForm(page);
    await uploadThenFail(page, "auth401");
    await expect(sessionAlert(page)).toBeVisible();

    await expectLocked(page);
    await saveButton(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(
      await requests(page, { path: /\/products$/, method: "POST" }),
    ).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe("/products/new");
  });

  test("수정 — PATCH 0회", async ({ page }) => {
    await openEdit(page, 1001);
    await uploadThenFail(page, "auth401");
    await expect(sessionAlert(page)).toBeVisible();

    await expectLocked(page);
    await saveButton(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(
      await requests(page, { path: /\/products\/1001$/, method: "PATCH" }),
    ).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
  });
});

test("F1 401 정지 뒤 기존 실패 칸 — 다시 시도는 잠기고 새 요청 0, 빼기는 된다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("fail500.jpg")]);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await chooseFiles(page, [jpg("auth401.jpg")]);
  await expect(sessionAlert(page)).toBeVisible();

  const sent = (await requests(page, { path: /\/listing-images$/ })).length;
  const retry = failed.getByRole("button", { name: /다시 시도$/ });
  await expect(retry).toBeDisabled();
  await retry.click({ force: true });
  await page.waitForTimeout(1_000);
  expect((await requests(page, { path: /\/listing-images$/ })).length).toBe(
    sent,
  );
  await expect(slotsIn(page, "uploading")).toHaveCount(0);
  await expect(slotsIn(page, "queued")).toHaveCount(0);

  await failed.getByRole("button", { name: /빼기$/ }).click();
  await expect(failed).toHaveCount(0);
});

async function expectLocked(page: Page) {
  await expect(saveButton(page)).toBeDisabled();
  const alertId = await sessionAlert(page).getAttribute("id");
  expect(alertId).toBeTruthy();
  const describedBy = (await saveButton(page).getAttribute("aria-describedby")) ?? "";
  expect(describedBy.split(" ")).toContain(alertId);
  await expect(addSlot(page)).toBeDisabled();
}
