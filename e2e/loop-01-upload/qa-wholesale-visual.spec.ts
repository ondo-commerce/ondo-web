import { expect, test } from "@playwright/test";
import {
  addSlot,
  cancelButton,
  cells,
  chooseFiles,
  fieldError,
  fillProductForm,
  grid,
  jpg,
  leaveDialog,
  login,
  openCreateWithPost,
  openEdit,
  png,
  registered,
  saveButton,
  slotsIn,
  uploadNote,
} from "./helpers";
import {
  computedColor,
  contrast,
  horizontalOverflow,
  observe,
  shot,
  styles,
  WHITE,
} from "./qa-helpers";

/**
 * QA 실측(loop-01-upload). 와이어프레임 `16_listing-image-upload/00_index.html`의 `#state-*`
 * 섹션과 구현 화면을 **토큰 단위로** 대조하고 스크린샷을 `runs/loop-01-upload/qa/`에 남긴다.
 *
 * 단언은 와이어프레임이 적은 값(README "디자인 결정" 1~14, _base.css 토큰)이다 — 취향이 아니다.
 * 값은 theme.css: destructive=red-500(251,44,54) · destructive-strong=red-700(193,0,7) ·
 * muted-foreground=gray-500(106,114,130) · secondary-foreground=gray-600(75,85,99) · ring=gray-500.
 */
const DONE = { timeout: 15_000 };
const RED_500 = { r: 251, g: 44, b: 54, a: 1 };
const RED_700 = { r: 193, g: 0, b: 7, a: 1 };
const GRAY_500 = { r: 106, g: 114, b: 130, a: 1 };
const GRAY_600 = { r: 75, g: 85, b: 99, a: 1 };
const GRAY_900 = { r: 16, g: 24, b: 40, a: 1 };

function near(a: { r: number; g: number; b: number }, b: typeof a, tol = 3) {
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol
  );
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("QA-V1 #state-empty — + 는 muted-foreground, hint 끝 제한 한 줄 500 굵기·secondary-foreground, 가로 스크롤 0", async ({
  page,
}) => {
  await openCreateWithPost(page);
  expect(await horizontalOverflow(page)).toBe(0);

  const plus = addSlot(page);
  const plusColor = await computedColor(plus, "color");
  expect(near(plusColor, GRAY_500), `+ 색 ${plusColor.raw}`).toBe(true);
  expect(contrast(plusColor, WHITE)).toBeGreaterThanOrEqual(4.5);
  const plusBox = await styles(plus, [
    "width",
    "height",
    "border-style",
    "border-radius",
    "font-size",
  ]);
  expect(plusBox).toMatchObject({
    width: "88px",
    height: "88px",
    "border-style": "dashed",
    "border-radius": "8px",
    "font-size": "20px",
  });

  const limit = page.locator('[data-ac="S2-1 S3-8"] b');
  await expect(limit).toHaveText("jpg, png · 한 장 4MB까지 · 최대 9장");
  const limitStyle = await styles(limit, ["font-weight", "font-size"]);
  expect(limitStyle["font-weight"]).toBe("500");
  expect(limitStyle["font-size"]).toBe("13px");
  const limitColor = await computedColor(limit, "color");
  expect(near(limitColor, GRAY_600), `제한 줄 색 ${limitColor.raw}`).toBe(true);

  await page.screenshot({ path: shot("v1-state-empty") });
});

test("QA-V2 #state-loading — 진행 3(aria-busy·베일 60%·띠) + 대기 2, 저장 잠김 + 문구 foreground", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(
    page,
    Array.from({ length: 5 }, (_, i) => jpg(`slow5s-${i}.jpg`)),
  );
  await expect(slotsIn(page, "uploading")).toHaveCount(3);
  await expect(slotsIn(page, "queued")).toHaveCount(2);

  const up = slotsIn(page, "uploading").first();
  const veil = up.locator("div[aria-hidden]").first();
  const veilBg = await computedColor(veil, "background-color");
  expect(veilBg.a).toBeCloseTo(0.6, 1);
  const band = up.locator("div").last();
  const bandBg = await computedColor(band, "background-color");
  expect(bandBg.a).toBeGreaterThanOrEqual(0.88);
  const bandStyle = await styles(band, ["font-size", "line-height"]);
  expect(bandStyle).toMatchObject({
    "font-size": "12px",
    "line-height": "16px",
  });
  await expect(up).toHaveAttribute("tabindex", "0");

  await expect(saveButton(page)).toBeDisabled();
  const note = uploadNote(page);
  await expect(note).toHaveText("사진 올리는 중…");
  const noteColor = await computedColor(note, "color");
  // #254 F8: muted 회색은 꺼진 안내로 읽혀 foreground 로 바꿨다
  expect(near(noteColor, GRAY_900), `문구 색 ${noteColor.raw}`).toBe(true);
  expect((await styles(note, ["font-size"]))["font-size"]).toBe("14px");

  await page.screenshot({ path: shot("v2-state-loading") });
  await grid(page).screenshot({ path: shot("v2-state-loading-grid") });
  await expect(registered(page)).toHaveCount(5, { timeout: 25_000 });
});

test("QA-V3 #state-done — 대표 칩 우상단(top 8·right 2·h 20), × 좌상단 24px, 등록 칸 88px", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);

  const first = registered(page).first();
  const chip = first.getByText("대표");
  const chipStyle = await styles(chip, ["top", "right", "height", "font-size"]);
  expect(chipStyle).toMatchObject({
    top: "8px",
    right: "2px",
    height: "20px",
    "font-size": "12px",
  });
  const remove = first.getByRole("button", { name: "이미지 1 빼기" });
  const rmStyle = await styles(remove, ["top", "left", "width", "height"]);
  expect(rmStyle).toMatchObject({
    top: "4px",
    left: "4px",
    width: "24px",
    height: "24px",
  });
  await expect(registered(page).nth(1).getByText("대표")).toHaveCount(0);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 7장 더 올릴 수 있어요",
  );
  await grid(page).screenshot({ path: shot("v3-state-done-grid") });
});

test("QA-V4 #state-error — 재시도형 실패 칸: destructive 1px 선(outline), 문구 destructive-strong, 흰 면, 미리보기 흐림, 대비", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(page, [jpg("a.jpg"), jpg("y-fail500once.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("data-kind", "retry");

  const outline = await computedColor(failed, "outline-color");
  const outlineStyle = await styles(failed, [
    "outline-width",
    "outline-style",
    "outline-offset",
    "border-width",
  ]);
  expect(near(outline, RED_500), `선 색 ${outline.raw}`).toBe(true);
  expect(outlineStyle).toMatchObject({
    "outline-width": "1px",
    "outline-style": "solid",
    "outline-offset": "-1px",
    "border-width": "0px",
  });
  expect(contrast(outline, WHITE)).toBeGreaterThanOrEqual(3);

  const bg = await computedColor(failed, "background-color");
  expect(near(bg, WHITE), `면 ${bg.raw}`).toBe(true);
  const preview = failed.locator("div[aria-hidden]").first();
  expect((await styles(preview, ["opacity"]))["opacity"]).toBe("0.1");

  const alert = failed.getByRole("alert");
  const text = await computedColor(alert, "color");
  expect(near(text, RED_700), `문구 색 ${text.raw}`).toBe(true);
  expect(contrast(text, WHITE)).toBeGreaterThanOrEqual(4.5);
  const alertStyle = await styles(alert, [
    "font-size",
    "line-height",
    "padding-top",
  ]);
  expect(alertStyle).toMatchObject({
    "font-size": "12px",
    "line-height": "16px",
    "padding-top": "28px",
  });
  const retry = page.getByRole("button", { name: "이미지 2 다시 시도" });
  await expect(retry).toBeVisible();
  const retryColor = await computedColor(retry, "color");
  expect(near(retryColor, RED_700), `다시 시도 색 ${retryColor.raw}`).toBe(
    true,
  );
  expect(
    (await styles(retry, ["text-decoration-line"]))["text-decoration-line"],
  ).toContain("underline");

  const note = uploadNote(page);
  await expect(note).toHaveText("실패한 사진 1장은 저장되지 않아요");
  const noteColor = await computedColor(note, "color");
  expect(near(noteColor, RED_700), `문구 색 ${noteColor.raw}`).toBe(true);
  await expect(saveButton(page)).toBeEnabled();
  await expect(saveButton(page)).toHaveAttribute("aria-describedby", /.+/);

  await page.screenshot({ path: shot("v4-state-error") });
  await grid(page).screenshot({ path: shot("v4-state-error-grid") });

  // 다시 시도 → 등록 칸, 문구 사라짐
  await retry.click();
  await expect(registered(page)).toHaveCount(2, DONE);
  await expect(note).toHaveCount(0);
});

test("QA-V5 #state-error-repick — 다시 고르기형: 재시도 없음, 짧은 꼴 + 전체 문장 aria-label, × 만", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [
    jpg("a.jpg"),
    {
      name: "heic-as.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("hello"),
    },
  ]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("data-kind", "repick");
  await expect(failed).toHaveAccessibleName(
    "이미지 2, jpg·png만 올릴 수 있어요. 다시 골라 주세요",
  );
  await expect(failed.getByText("jpg·png만 돼요")).toBeVisible();
  await expect(failed.getByText("다시 골라 주세요")).toBeVisible();
  await expect(page.getByRole("button", { name: /다시 시도/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "이미지 2 빼기" }),
  ).toBeVisible();
  const reason = failed.getByText("jpg·png만 돼요");
  expect((await styles(reason, ["font-weight"]))["font-weight"]).toBe("500");
  await grid(page).screenshot({ path: shot("v5-state-error-repick-grid") });
});

test("QA-V6 #state-rejected — 사전 검사 목록: 13px destructive-strong, 파일명 500, 아이콘 14px, 칸 없음", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [
    { name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("x") },
    { name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) },
  ]);
  const list = page.locator('ul[role="alert"][data-ac="S2-7 S2-8"]');
  await expect(list.locator("li")).toHaveCount(2);
  await expect(cells(page)).toHaveCount(0);
  const listStyle = await styles(list, ["font-size", "margin-top"]);
  expect(listStyle["font-size"]).toBe("13px");
  const color = await computedColor(list, "color");
  expect(near(color, RED_700), `목록 색 ${color.raw}`).toBe(true);
  const name = list.locator("li b").first();
  expect((await styles(name, ["font-weight"]))["font-weight"]).toBe("500");
  const icon = list.locator("li svg").first();
  expect(await styles(icon, ["width", "height"])).toMatchObject({
    width: "14px",
    height: "14px",
  });
  await expect(list.locator("li").first()).toContainText("JPEG로 보내기");
  await page.screenshot({ path: shot("v6-state-rejected") });
});

test("QA-V7 #state-full — 9칸이 차면 + 가 없고 격자가 두 줄로 접히며 잘리지 않는다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(
    page,
    Array.from({ length: 9 }, (_, i) => jpg(`f${i}.jpg`)),
  );
  await expect(registered(page)).toHaveCount(9, DONE);
  await expect(addSlot(page)).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
  const boxes = await registered(page).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()),
  );
  const panel = await grid(page).evaluate((e) => {
    const body = e.closest("fieldset")?.getBoundingClientRect();
    return body ? { left: body.left, right: body.right } : null;
  });
  expect(panel).not.toBeNull();
  for (const b of boxes) {
    expect(b.width).toBe(88);
    expect(b.left).toBeGreaterThanOrEqual(panel!.left);
    expect(b.right).toBeLessThanOrEqual(panel!.right + 1);
  }
  await page.screenshot({ path: shot("v7-state-full") });
});

test("QA-V8 #state-required — 0장 저장: 라벨 *, 오류 줄, + 포커스 + aria-describedby, 포커스 링 실측(키보드 경로)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  const field = page.locator('[data-ac="S3-7"]');
  const star = field.getByText("*", { exact: true });
  await expect(star).toBeVisible();
  const starColor = await computedColor(star, "color");
  expect(near(starColor, RED_700), `* 색 ${starColor.raw}`).toBe(true);

  // 키보드로 저장 — 프로그램 포커스에 :focus-visible 이 붙는 경로
  await saveButton(page).focus();
  await page.keyboard.press("Enter");
  const error = fieldError(page, "listing.images");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/대표 이미지를 1장 이상 올려 주세요\./);
  const plus = addSlot(page);
  await expect(plus).toBeFocused();
  await expect(plus).toHaveAttribute(
    "aria-describedby",
    "product-listing-images-error",
  );
  await expect(plus).toHaveAttribute("aria-invalid", "true");

  const focusVisible = await plus.evaluate((e) => e.matches(":focus-visible"));
  const ring = await styles(plus, [
    "outline-width",
    "outline-style",
    "outline-offset",
    "box-shadow",
  ]);
  observe("V8-focus-ring", { focusVisible, ...ring });
  await page.screenshot({ path: shot("v8-state-required") });
  await grid(page).screenshot({ path: shot("v8-state-required-grid") });

  // 와이어프레임 DD11: 포커스 링 ring 2px / offset 2px (--color-ring)
  const hasRing =
    (ring["outline-style"] !== "none" && ring["outline-width"] !== "0px") ||
    ring["box-shadow"] !== "none";
  expect(hasRing, "DD11 포커스 링이 없다").toBe(true);
});

test("QA-V9 #state-disabled — 시즌 종료 1006: * 없음, fieldset opacity .6, +·×·input 전부 disabled, 이미지는 그대로", async ({
  page,
}) => {
  await openEdit(page, 1006);
  const field = page.locator('[data-ac="S3-7"]');
  await expect(field.getByText("*", { exact: true })).toHaveCount(0);
  const fieldset = page.locator("fieldset", { has: grid(page) });
  expect((await styles(fieldset, ["opacity"]))["opacity"]).toBe("0.6");
  await expect(addSlot(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "이미지 1 빼기" }),
  ).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(registered(page).first()).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const n = await registered(page).count();
  expect(n).toBeGreaterThan(0);
  await page.screenshot({ path: shot("v9-state-disabled") });
});

test("QA-V10 취소 모달(D22, 와이어프레임 섹션 없음) — 제목·설명·버튼·포커스, 스크린샷", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await page.getByLabel("품명", { exact: true }).fill("a");
  await cancelButton(page).click();
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-ac", "S3-11 S3-14");
  await expect(dialog.getByRole("button", { name: "계속 작성" })).toBeFocused();
  await expect(dialog).toContainText(
    "저장하지 않은 입력과 올리는 중인 사진은 남지 않아요",
  );
  const radius = (await styles(dialog, ["border-radius"]))["border-radius"];
  expect(radius).toBe("10px");
  await page.screenshot({ path: shot("v10-leave-dialog") });
});

test("QA-V11 #state-order-hold — 보류 칸은 베일 없이 선명, 띠 '순서 대기', ×·대표 없음", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-A.jpg"), png("B.png")]);
  const held = slotsIn(page, "held");
  await expect(held).toHaveCount(1, DONE);
  await expect(held).toContainText("순서 대기");
  await expect(held.locator("div[aria-hidden]")).toHaveCount(0);
  await expect(held.getByRole("button")).toHaveCount(0);
  await expect(held.getByText("대표")).toHaveCount(0);
  await expect(held).not.toHaveAttribute("aria-busy", /.+/);
  await grid(page).screenshot({ path: shot("v11-state-order-hold-grid") });
  await expect(registered(page)).toHaveCount(2, DONE);
});
