import { expect, test } from "@playwright/test";
import {
  collectConsoleErrors,
  FAILURE_TEXT,
  requests,
  revokedUrls,
  uploadAbortStats,
  waitUploadsStarted,
  watchRequests,
} from "./helpers";
import {
  cancelButton,
  cells,
  chooseFiles,
  expectDecoded,
  jpg,
  leaveDialog,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  slotsIn,
  statusRadio,
} from "../loop-01-upload/helpers";

/**
 * #252 S4 — 업로드 큐 수명주기 중 취소·언마운트 쪽(S4-1 ①②, S4-5, S4-6, S4-8).
 * 상단 메뉴 Link 경로(S4-1 ③)는 Link 가드와 같이 `wholesale-link-leave-guard.spec.ts` 에 있다.
 */

/** `slow5s` 는 5초 걸린다. 그보다 길게 기다려 늦은 결과가 정말 안 오는지 본다 */
const LATE_RESULT_WAIT_MS = 5_500;

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await login(page);
});

test.describe("S4-1 의도한 취소는 요청을 끊고 실패 칸을 만들지 않는다", () => {
  test("① 함께 게시 해제 → abort 2, reject 2, 재체크 때 빈 격자", async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await openCreateWithPost(page);
    await chooseFiles(page, [jpg("slow5s-1.jpg"), jpg("slow5s-2.jpg")]);
    await waitUploadsStarted(page, 2);
    await expect(slotsIn(page, "uploading")).toHaveCount(2);

    await page.getByText("온도 마켓에 함께 게시").click();
    await expect(page.getByRole("heading", { name: "게시글 등록" })).toBeVisible();

    await expect.poll(() => uploadAbortStats(page)).toEqual({
      aborted: 2,
      rejected: 2,
    });
    await page.waitForTimeout(LATE_RESULT_WAIT_MS);
    await page.getByText("온도 마켓에 함께 게시").click();
    await expect(cells(page)).toHaveCount(0);
    await expect(registered(page)).toHaveCount(0);
    await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test("② 취소 → 나가기 → abort 2, reject 2, 늦은 결과 없음", async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await openCreateWithPost(page);
    await chooseFiles(page, [jpg("slow5s-1.jpg"), jpg("slow5s-2.jpg")]);
    await waitUploadsStarted(page, 2);

    await cancelButton(page).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await page.waitForURL((url) => url.pathname === "/products");

    await expect.poll(() => uploadAbortStats(page)).toEqual({
      aborted: 2,
      rejected: 2,
    });
    await page.waitForTimeout(LATE_RESULT_WAIT_MS);
    expect(new URL(page.url()).pathname).toBe("/products");
    await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test("S4-5 5장 올린 뒤 등록 칸 5장이 전부 그려지고, 격자는 서버 URL을 놓지 않는다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(
    page,
    [1, 2, 3, 4, 5].map((n) => jpg(`five-${n}.jpg`)),
  );
  await expect(registered(page)).toHaveCount(5, { timeout: 15_000 });
  await expect(cells(page)).toHaveCount(5);

  const imgs = registered(page).locator("img");
  for (let i = 0; i < 5; i += 1) await expectDecoded(imgs.nth(i));

  const sources = await imgs.evaluateAll((list) =>
    list.map((e) => (e as HTMLImageElement).src),
  );
  const revoked = await revokedUrls(page);
  expect(sources.filter((src) => revoked.includes(src))).toEqual([]);
});

test("S4-6 수정 화면 업로드 중 시즌 종료 → 사진 1장 추가, PATCH 다음 상태 변경 200", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await expect(registered(page)).toHaveCount(2);
  await chooseFiles(page, [jpg("slow5s-season.jpg")]);
  await waitUploadsStarted(page, 1);

  await statusRadio(page, "시즌 종료").click();
  await expect(statusRadio(page, "시즌 종료")).toBeChecked();

  // 토글은 격자를 잠글 뿐 언마운트하지 않는다 — 요청이 끝나 등록 칸이 된다
  await expect(registered(page)).toHaveCount(3, { timeout: 10_000 });
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=1001/);

  const [patch] = await requests(page, {
    path: /\/products\/1001$/,
    method: "PATCH",
  });
  expect(patch?.status).toBe(200);
  const body = (await page.evaluate(
    () =>
      (window as unknown as { __lastProductRequest?: unknown })
        .__lastProductRequest,
  )) as { listing?: { images: string[] } };
  expect(body.listing?.images).toHaveLength(3);

  await expect
    .poll(async () => {
      const [seasonEnd] = await requests(page, {
        path: /\/listings\/2001\/season-end$/,
        method: "POST",
      });
      return seasonEnd
        ? `${seasonEnd.status}:${seasonEnd.listingStatus}`
        : "none";
    })
    .toBe("200:SEASON_ENDED");
});

test.describe("S4-8 대기·진행 칸이 있으면 저장 잠금, 저장 요청 0회", () => {
  test("등록", async ({ page }) => {
    await openCreateWithPost(page);
    await chooseFiles(page, [jpg("slow5s-lock.jpg")]);
    await waitUploadsStarted(page, 1);

    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(
      await requests(page, { path: /\/products$/, method: "POST" }),
    ).toHaveLength(0);
  });

  test("수정", async ({ page }) => {
    await openEdit(page, 1001);
    await chooseFiles(page, [jpg("slow5s-lock.jpg")]);
    await waitUploadsStarted(page, 1);

    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(
      await requests(page, { path: /\/products\/1001$/, method: "PATCH" }),
    ).toHaveLength(0);
  });
});
