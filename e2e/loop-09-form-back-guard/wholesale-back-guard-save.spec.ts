import { expect, test, type Page } from "@playwright/test";
import {
  armFetchGate,
  enterCreateFromList,
  enterEditFromDetail,
  firstPriceInput,
  here,
  installFetchGate,
  leaveButton,
  menuLink,
  nameInput,
  openFetchGate,
  recordParsedResponses,
  saveLog,
  spyRouter,
  T0,
} from "./helpers";
import {
  fillProductPanel,
  leaveDialog,
  login,
  saveButton,
} from "../loop-01-upload/helpers";
import { requests, watchRequests } from "../loop-03-upload-lifecycle/helpers";

/**
 * #255 S1-15 — 저장 중 뒤로가기(hold, ⑫)와 떠난 뒤 끝난 저장(⑬).
 * 저장 요청은 `installFetchGate`로 붙잡는다. "이동 0"은 흐르는 페이지 시계를 1초 민 뒤 본다.
 */

const A = 1001;
const PATCH_A = new RegExp(`/api/wholesale/products/${A}$`);
const POST_PRODUCTS = /\/api\/wholesale\/products$/;
const createButton = (page: Page) =>
  page.getByRole("button", { name: "상품 등록", exact: true });

async function expectUrl(page: Page, url: string | RegExp) {
  if (typeof url === "string") await expect.poll(() => here(page)).toBe(url);
  else await expect.poll(() => here(page)).toMatch(url);
}

/*
 * 응답 기록(상태 코드)은 앱이 본문을 읽고 onSuccess를 돌리기 전에 생긴다. 바로 URL을 보면 늦은
 * 이동이 오기 전이라 "그대로"가 거저 맞는다(변이 시험에서 확인). 그래서 그 응답의 본문 파싱이
 * 끝난 것을 기다리고, 시계 1초를 밀어 콜백까지 돌린 뒤 라우터 호출 0과 URL을 본다(09-R4).
 * networkidle(실시간 500ms)은 쓰지 않는다.
 */
async function settleAfterSave(page: Page, path: RegExp) {
  await expect
    .poll(async () => (await saveLog(page)).parsed.some((u) => path.test(u)))
    .toBe(true);
  await page.clock.runFor(1000);
  expect((await saveLog(page)).router).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installFetchGate(page);
  await recordParsedResponses(page);
  await page.clock.install({ time: T0 });
  await login(page);
});

test("① 수정 저장 중 뒤로 → 1초 뒤 모달 0, URL, 판매가, 저장 잠김 그대로 → 문 열기 → 상세", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await armFetchGate(page, PATCH_A, "PATCH");
  await firstPriceInput(page).fill("15000");
  const changed = await firstPriceInput(page).inputValue();
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();

  await page.goBack();
  await page.clock.runFor(1000);
  await expectUrl(page, `/products/${A}/edit`);
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(firstPriceInput(page)).toHaveValue(changed);
  await expect(saveButton(page)).toBeDisabled();

  await openFetchGate(page);
  await expectUrl(page, `/products?productId=${A}`);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("①' 변경 없이 수정 저장 중 뒤로 → 1초 뒤 수정 URL과 서버값, 모달 0 → 문 열기 → 상세 (09-R1)", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await armFetchGate(page, PATCH_A, "PATCH");
  const server = await firstPriceInput(page).inputValue();
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();

  await page.goBack();
  await page.clock.runFor(1000);
  await expectUrl(page, `/products/${A}/edit`);
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(firstPriceInput(page)).toHaveValue(server);
  await expect(saveButton(page)).toBeDisabled();

  await openFetchGate(page);
  await expectUrl(page, `/products?productId=${A}`);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("② 등록 저장 중 뒤로 → 모달 0, URL, 품명 그대로 → 문 열기 → 목록에 새 상품", async ({
  page,
}) => {
  await enterCreateFromList(page);
  await armFetchGate(page, POST_PRODUCTS, "POST");
  await fillProductPanel(page);
  await createButton(page).click();
  await expect(createButton(page)).toBeDisabled();

  await page.goBack();
  await page.clock.runFor(1000);
  await expectUrl(page, "/products/new");
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue("e2e 업로드 상품");

  await openFetchGate(page);
  await expectUrl(page, /^\/products\?productId=\d+$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("③ 수정 저장 중 재고 Link 모달 나가기 → 문 열기 → PATCH 200 뒤에도 재고", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await armFetchGate(page, PATCH_A, "PATCH");
  await firstPriceInput(page).fill("15000");
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();

  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await expectUrl(page, "/inventory");
  await spyRouter(page);

  await openFetchGate(page);
  await expect
    .poll(async () =>
      (await requests(page, { path: PATCH_A, method: "PATCH" })).map(
        (r) => r.status,
      ),
    )
    .toEqual([200]);
  await settleAfterSave(page, PATCH_A);
  await expectUrl(page, "/inventory");
});

test("④ 등록 저장 중 재고 Link 모달 나가기 → 문 열기 → POST 201 뒤에도 재고", async ({
  page,
}) => {
  await enterCreateFromList(page);
  await armFetchGate(page, POST_PRODUCTS, "POST");
  await fillProductPanel(page);
  await createButton(page).click();
  await expect(createButton(page)).toBeDisabled();

  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await expectUrl(page, "/inventory");
  await spyRouter(page);

  await openFetchGate(page);
  await expect
    .poll(async () =>
      (await requests(page, { path: POST_PRODUCTS, method: "POST" })).map(
        (r) => r.status,
      ),
    )
    .toEqual([201]);
  await settleAfterSave(page, POST_PRODUCTS);
  await expectUrl(page, "/inventory");
});
