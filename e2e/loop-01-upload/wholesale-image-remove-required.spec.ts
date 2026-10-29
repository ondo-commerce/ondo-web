import { expect, test } from "@playwright/test";
import {
  addSlot,
  cancelButton,
  cells,
  chooseFiles,
  detailImageSlots,
  fieldError,
  fillProductForm,
  formAlert,
  jpg,
  lastUpdateRequest,
  leaveDialog,
  login,
  openCreateWithPost,
  openEdit,
  png,
  pressWithinDragThreshold,
  handleOf,
  registered,
  saveButton,
  slotsIn,
  statusRadio,
  submitCreate,
  uploadRequestCount,
} from "./helpers";

/**
 * S3 — 빼기 · 필수 · 왕복 보존 · 취소 확인 (#251). 셀렉터는 와이어프레임의 `data-ac`·
 * `aria-label`·`role` 이다. 시간을 단언하지 않는다 — 완료는 폴링 `expect` 로 기다린다.
 *
 * 수정 화면 표본(목 시드): 1001 게시글 2장 · 1002 1장 · 1004 1장 · 1006 시즌 종료.
 * 시드 이미지는 `https://cdn.ondo.test/…` 라 브라우저에서 안 불러와지지만(아이콘으로 떨어짐)
 * URL 비교엔 상관없다. 새로 올린 장은 `blob:` 이라 `img` 가 그려진다.
 */
const DONE = { timeout: 15_000 };
const SEED_1001 = [
  "https://cdn.ondo.test/listings/2001/1.jpg",
  "https://cdn.ondo.test/listings/2001/2.jpg",
];
const SEED_1002 = ["https://cdn.ondo.test/listings/2002/1.jpg"];
const SEED_1004 = ["https://cdn.ondo.test/listings/2004/1.jpg"];

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("S3-1 · S3-2 × — 8px 안 클릭으로 빠지고 대표가 다음 장으로, PATCH 와 상세에 그 URL 없음", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await expect(registered(page)).toHaveCount(2);
  await chooseFiles(page, [jpg("c.jpg")]);
  await expect(registered(page)).toHaveCount(3, DONE);
  const added = await registered(page)
    .nth(2)
    .locator("img")
    .getAttribute("src");
  expect(added).toMatch(/^blob:/);

  // 등록 칸마다 × 가 있고 이름이 "이미지 N 빼기"
  for (const n of [1, 2, 3])
    await expect(
      page.getByRole("button", { name: `이미지 ${n} 빼기` }),
    ).toBeVisible();

  // 손떨림(3px) 안에서 누른다 — 드래그가 아니라 클릭이다. 되묻지 않는다
  await pressWithinDragThreshold(
    page.getByRole("button", { name: "이미지 1 빼기" }),
  );
  await expect(registered(page)).toHaveCount(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(handleOf(registered(page).nth(0))).toHaveAccessibleName(
    "이미지 1, 대표",
  );
  await expect(registered(page).nth(0).getByText("대표")).toBeVisible();
  await expect(registered(page).nth(1).getByText("대표")).toHaveCount(0);
  await expect(registered(page).nth(1).locator("img")).toHaveAttribute(
    "src",
    added ?? "",
  );
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 7장 더 올릴 수 있어요",
  );

  // S3-2 — PATCH 에 뺀 URL 이 없고, 상세를 다시 열어도 2장
  await saveButton(page).click();
  await page.waitForURL(/productId=1001/);
  const body = await lastUpdateRequest(page);
  expect(body.listing?.images).toEqual([SEED_1001[1], added]);
  await expect(detailImageSlots(page)).toHaveCount(2);
});

test("S3-3 왕복 — 1장 올린 뒤 시즌 종료로 저장해도 PATCH listing.images 에 새 URL 이 실린다", async ({
  page,
}) => {
  await openEdit(page, 1002);
  await chooseFiles(page, [jpg("c.jpg")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const added = await registered(page)
    .nth(1)
    .locator("img")
    .getAttribute("src");

  await statusRadio(page, "시즌 종료").click();
  // 잠겼지만 이미지는 그대로 보인다(S2-10)
  await expect(addSlot(page)).toBeDisabled();
  await expect(registered(page)).toHaveCount(2);

  await saveButton(page).click();
  await page.waitForURL(/productId=1002/);
  const body = await lastUpdateRequest(page);
  expect(body.listing?.images).toEqual([...SEED_1002, added]);
  await expect(detailImageSlots(page)).toHaveCount(2);
});

test("S3-4 왕복 — 2장 올린 뒤 함께 게시 해제 → 재체크하면 2장 그대로", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const before = await registered(page)
    .locator("img")
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));

  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toHaveCount(0);
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(registered(page)).toHaveCount(2);
  const after = await registered(page)
    .locator("img")
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
  expect(after).toEqual(before);
  await expect(registered(page).nth(0).getByText("대표")).toBeVisible();
});

test("S3-5 왕복 — [fail400once] 저장 실패 뒤 사진 그대로, 다시 저장하면 같은 URL · 업로드 요청 1", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await page.getByLabel("게시글 이름").fill("[fail400once] e2e 게시글");
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const url = await registered(page).first().locator("img").getAttribute("src");

  await saveButton(page).click();
  await expect(fieldError(page, "listing.title")).toBeVisible();
  await expect(page.getByLabel("게시글 이름")).toBeFocused();
  await expect(registered(page)).toHaveCount(1);
  await expect(registered(page).first().locator("img")).toHaveAttribute(
    "src",
    url ?? "",
  );
  expect(await uploadRequestCount(page)).toBe(1);

  const body = await submitCreate(page);
  expect(body.listing.images).toEqual([url]);
  expect(await uploadRequestCount(page)).toBe(1);
});

test("S3-7 등록 — 함께 게시면 라벨 *, 0장 저장은 격자 아래 오류 + 포커스 +, 1장 올리면 오류 사라짐", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  const field = page.locator('[data-ac="S3-7"]');
  await expect(field.getByText("게시글 이미지")).toBeVisible();
  await expect(field.getByText("*", { exact: true })).toBeVisible();

  await saveButton(page).click();
  const error = fieldError(page, "listing.images");
  await expect(error).toBeVisible();
  await expect(error).toContainText("대표 이미지를 1장 이상 올려 주세요.");
  await expect(addSlot(page)).toBeFocused();
  await expect(addSlot(page)).toHaveAttribute(
    "aria-describedby",
    "product-listing-images-error",
  );
  await expect(page).toHaveURL(/\/products\/new/);

  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(error).toHaveCount(0);
  await expect(addSlot(page)).not.toHaveAttribute("aria-describedby", /.+/);

  const body = await submitCreate(page);
  expect(body.listing.images).toHaveLength(1);
});

test("S3-7 수정 — 판매 중이면 0장 막힘, 시즌 종료면 * 없이 저장됨, 재개 토글만 해도 0장이면 막힘", async ({
  page,
}) => {
  await openEdit(page, 1002);
  const field = page.locator('[data-ac="S3-7"]');
  await expect(field.getByText("*", { exact: true })).toBeVisible();

  // 판매 중 · 0장 → 막힘
  await page.getByRole("button", { name: "이미지 1 빼기" }).click();
  await expect(registered(page)).toHaveCount(0);
  await saveButton(page).click();
  await expect(fieldError(page, "listing.images")).toBeVisible();
  await expect(addSlot(page)).toBeFocused();
  await expect(page).toHaveURL(/\/products\/1002\/edit/);

  // 시즌 종료로 토글 → * 가 빠지고 0장이어도 저장된다 (PATCH → 상태 변경)
  await statusRadio(page, "시즌 종료").click();
  await expect(field.getByText("*", { exact: true })).toHaveCount(0);
  await saveButton(page).click();
  await page.waitForURL(/productId=1002/);
  const body = await lastUpdateRequest(page);
  expect(body.listing?.images).toEqual([]);
  await expect(detailImageSlots(page)).toHaveCount(0);

  // 같은 세션(목 상태 유지)에서 수정 화면으로 — 게시글을 안 고치고 판매 중으로만 토글해 저장
  await page.getByRole("link", { name: "상품 관리" }).click();
  await expect(statusRadio(page, "시즌 종료")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(field.getByText("*", { exact: true })).toHaveCount(0);
  await statusRadio(page, "판매중").click();
  await expect(field.getByText("*", { exact: true })).toBeVisible();
  await saveButton(page).click();
  await expect(fieldError(page, "listing.images")).toBeVisible();
  await expect(addSlot(page)).toBeFocused();
  await expect(page).toHaveURL(/\/products\/1002\/edit/);
});

test("S3-10 부분 성공 — PATCH 201 뒤 상태 변경 500: _form 오류 · 사진 그대로. 재저장은 listing 없이 상태만, 업로드 1", async ({
  page,
}) => {
  await openEdit(page, 1004);
  await page
    .getByLabel("게시글 이름")
    .fill("[status-fail-once] 코튼 반팔 티셔츠");
  await chooseFiles(page, [jpg("c.jpg")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const added = await registered(page)
    .nth(1)
    .locator("img")
    .getAttribute("src");
  await statusRadio(page, "시즌 종료").click();

  await saveButton(page).click();
  await expect(formAlert(page)).toBeVisible();
  await expect(page).toHaveURL(/\/products\/1004\/edit/);
  const first = await lastUpdateRequest(page);
  expect(first.listing?.images).toEqual([...SEED_1004, added]);
  await expect(registered(page)).toHaveCount(2);
  await expect(registered(page).nth(1).locator("img")).toHaveAttribute(
    "src",
    added ?? "",
  );
  await expect(statusRadio(page, "시즌 종료")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await uploadRequestCount(page)).toBe(1);

  await saveButton(page).click();
  await page.waitForURL(/productId=1004/);
  const second = await lastUpdateRequest(page);
  expect(second).not.toHaveProperty("listing");
  expect(await uploadRequestCount(page)).toBe(1);
  await expect(detailImageSlots(page)).toHaveCount(2);
  // 최종 상태 시즌 종료 — 같은 세션에서 수정 화면을 다시 열면 토글이 시즌 종료
  await page.getByRole("link", { name: "상품 관리" }).click();
  await expect(statusRadio(page, "시즌 종료")).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("S3-11 취소 확인 — 등록 품명 한 글자 / 수정 값 하나 / 올리는 중, 나가기는 기존 목적지로", async ({
  page,
}) => {
  // ① 등록 화면, 품명 한 글자
  await page.goto("/products/new");
  await page.getByLabel("품명", { exact: true }).fill("a");
  await cancelButton(page).click();
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "계속 작성" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "나가기" })).toBeVisible();
  await dialog.getByRole("button", { name: "나가기" }).click();
  await page.waitForURL((url) => url.pathname === "/products" && !url.search);

  // ② 수정 화면, 게시글 이름 한 글자
  await openEdit(page, 1001);
  await page.getByLabel("게시글 이름").fill("빈티지 플라워 셔츠!");
  await cancelButton(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "나가기" }).click();
  await page.waitForURL(/\/products\?productId=1001$/);

  // ③ 등록 화면, 사진이 올라가는 중(입력은 없음)
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);
  await cancelButton(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "나가기" }).click();
  await page.waitForURL((url) => url.pathname === "/products" && !url.search);
});

test("S3-12 입력이 없으면 취소는 모달 없이 바로 이동 — 등록 /products, 수정 /products?productId", async ({
  page,
}) => {
  await page.goto("/products/new");
  await expect(cancelButton(page)).toBeVisible();
  await cancelButton(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForURL((url) => url.pathname === "/products" && !url.search);

  await openEdit(page, 1001);
  await cancelButton(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForURL(/\/products\?productId=1001$/);
});

test("S3-13 beforeunload — 입력·슬롯이 있으면 새로고침·탭 닫기에 경고, 거부하면 그대로. 없으면 0건", async ({
  page,
}) => {
  const seen: string[] = [];
  page.on("dialog", (dialog) => {
    seen.push(dialog.type());
    void dialog.dismiss();
  });

  // 입력 없음 — 새로고침은 그냥 된다
  await page.goto("/products/new");
  await page.reload();
  await expect(page.getByLabel("품명", { exact: true })).toBeVisible();
  expect(seen).toEqual([]);

  // 품명 + 올리는 중 슬롯
  await page.getByLabel("품명", { exact: true }).fill("a");
  await page.getByText("온도 마켓에 함께 게시").click();
  await chooseFiles(page, [jpg("slow5s.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);

  // 거부된 새로고침은 완료되지 않는다 — 짧게 기다리고 실패를 삼킨다
  await page.reload({ timeout: 3_000 }).catch(() => undefined);
  await expect.poll(() => seen).toEqual(["beforeunload"]);
  await expect(page.getByLabel("품명", { exact: true })).toHaveValue("a");
  await expect(cells(page)).toHaveCount(1);

  await page.close({ runBeforeUnload: true });
  await expect.poll(() => seen).toEqual(["beforeunload", "beforeunload"]);
  await expect(page.getByLabel("품명", { exact: true })).toHaveValue("a");
  await expect(cells(page)).toHaveCount(1);
});

test("S3-14 계속 작성 · Esc — 모달이 닫히고 입력·슬롯·함께 게시가 그대로, 포커스는 취소 버튼으로", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await page.getByLabel("품명", { exact: true }).fill("a");
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);

  await cancelButton(page).click();
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "계속 작성" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cancelButton(page)).toBeFocused();
  await expect(page.getByLabel("품명", { exact: true })).toHaveValue("a");
  await expect(registered(page)).toHaveCount(1);
  await expect(addSlot(page)).toBeVisible();
  await expect(page).toHaveURL(/\/products\/new/);

  await cancelButton(page).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("품명", { exact: true })).toHaveValue("a");
  await expect(registered(page)).toHaveCount(1);
});
