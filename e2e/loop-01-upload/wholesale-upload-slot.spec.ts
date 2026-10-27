import { expect, test } from "@playwright/test";
import {
  addSlot,
  cells,
  chooseFiles,
  expectDecoded,
  fillProductForm,
  JPG_WIDTH,
  jpg,
  login,
  openCreateWithPost,
  png,
  PNG_WIDTH,
  registered,
  saveButton,
  slotsIn,
  submitCreate,
  uploadNote,
  uploadRequestCount,
} from "./helpers";

/**
 * S2 — 슬롯에서 올리기 (#250). 셀렉터는 와이어프레임의 `data-state`·`aria-label`·`role` 이다.
 *
 * 시간을 단언하지 않는다. "진행 중"은 목의 `slow5s` 손잡이(5초)로 잡고, 완료는 폴링 `expect`
 * 로 기다린다. 보통 업로드는 600ms, slow 는 5초라 완료 대기는 넉넉히 15초다.
 */
const DONE = { timeout: 15_000 };

test.beforeEach(async ({ page }) => {
  await login(page);
  await openCreateWithPost(page);
});

test("S2-1 + 를 누르면 파일 선택이 열린다 — multiple · accept jpg,png · '준비 중' 문구 없음", async ({
  page,
}) => {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    addSlot(page).click(),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  expect(await chooser.element().getAttribute("accept")).toBe(
    "image/jpeg,image/png",
  );
  await expect(page.getByText("준비 중")).toHaveCount(0);
  await expect(addSlot(page)).not.toHaveAttribute("aria-describedby", /.+/);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 9장 더 올릴 수 있어요",
  );
});

test("S2-3 · S2-4 진행 중 신호 → 등록 칸 + 대표, 저장 본문 images[0] 이 응답 url", async ({
  page,
}) => {
  await fillProductForm(page);
  await chooseFiles(page, [jpg("slow5s.jpg")]);

  // S2-3 — 응답 전에 격자 끝에 진행 칸, 저장은 잠김
  const uploading = slotsIn(page, "uploading");
  await expect(uploading).toHaveCount(1);
  await expect(uploading).toHaveAttribute("aria-busy", "true");
  await expect(uploading).toContainText("올리는 중");
  await expectDecoded(uploading.locator("img"));
  await expect(saveButton(page)).toBeDisabled();
  const note = uploadNote(page);
  await expect(note).toHaveText("사진 올리는 중…");
  await expect(saveButton(page)).toHaveAttribute("aria-describedby", /.+/);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 8장 더 올릴 수 있어요",
  );

  // S2-4 — 완료되면 등록 칸, 첫 장 대표, 버튼 풀림
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(uploading).toHaveCount(0);
  await expectDecoded(registered(page).first().locator("img"));
  await expect(registered(page).first().getByText("대표")).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
  await expect(note).toHaveCount(0);

  const url = await registered(page).first().locator("img").getAttribute("src");
  expect(url).toMatch(/^blob:/);
  const body = await submitCreate(page);
  expect(body.listing.images).toEqual([url]);
});

test("S2-5 정상 1 + fail500 1 → 재시도형 실패 칸, 빼기, 실패 남긴 채 저장하면 1장만 실린다", async ({
  page,
}) => {
  await fillProductForm(page);
  await chooseFiles(page, [jpg("a.jpg"), jpg("x-fail500.jpg")]);

  const failed = slotsIn(page, "failed");
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("data-kind", "retry");
  await expect(failed.getByRole("alert")).toContainText("올리지 못했어요");
  await expect(
    page.getByRole("button", { name: "이미지 2 다시 시도" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이미지 2 빼기" }),
  ).toBeVisible();
  // 실패 칸은 등록 칸 뒤에 고정
  await expect(cells(page).nth(1)).toHaveAttribute("data-state", "failed");
  await expect(uploadNote(page)).toContainText(
    "실패한 사진 1장은 저장되지 않아요",
  );
  await expect(saveButton(page)).toBeEnabled();

  await page.getByRole("button", { name: "이미지 2 빼기" }).click();
  await expect(failed).toHaveCount(0);
  await expect(uploadNote(page)).toHaveCount(0);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 8장 더 올릴 수 있어요",
  );

  // 실패 칸을 남긴 채 저장 — 성공분만 실린다
  await chooseFiles(page, [jpg("x-fail500.jpg")]);
  await expect(failed).toHaveCount(1);
  await expect(uploadNote(page)).toContainText(
    "실패한 사진 1장은 저장되지 않아요",
  );
  const body = await submitCreate(page);
  expect(body.listing.images).toHaveLength(1);
});

test("S2-7 사전 검사 — gif · 0바이트 jpg · 상한+1 jpg 는 칸을 만들지 않고 이유 3줄, 요청 0건", async ({
  page,
}) => {
  await chooseFiles(page, [
    { name: "c.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") },
    { name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) },
    {
      name: "big.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
    },
  ]);
  const lines = page.getByRole("alert").locator("li");
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText("c.gif");
  await expect(lines.nth(0)).toContainText("jpg·png만 올릴 수 있어요");
  await expect(lines.nth(1)).toContainText("empty.jpg");
  await expect(lines.nth(1)).toContainText("비어 있는 파일이에요");
  await expect(lines.nth(2)).toContainText("big.jpg");
  await expect(lines.nth(2)).toContainText("4MB까지");
  await expect(cells(page)).toHaveCount(0);
  expect(await uploadRequestCount(page)).toBe(0);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 9장 더 올릴 수 있어요",
  );
});

test("S2-8 등록 6 + 진행 1 + 실패 1 에서 3장 고르면 1장만, '2장은 칸이 없어 빠졌어요', 9칸 차면 + 없음", async ({
  page,
}) => {
  await chooseFiles(
    page,
    Array.from({ length: 6 }, (_, i) => jpg(`r${i}.jpg`)),
  );
  await expect(registered(page)).toHaveCount(6, DONE);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 3장 더 올릴 수 있어요",
  );

  await chooseFiles(page, [jpg("slow5s.jpg"), jpg("x-fail500.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 1장 더 올릴 수 있어요",
  );

  await chooseFiles(page, [jpg("p1.jpg"), jpg("p2.jpg"), jpg("p3.jpg")]);
  await expect(page.getByRole("alert").locator("li")).toHaveText([
    "2장은 칸이 없어 빠졌어요",
  ]);
  await expect(addSlot(page)).toHaveCount(0);
  await expect(cells(page)).toHaveCount(9);

  await expect(registered(page)).toHaveCount(8, DONE);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(addSlot(page)).toHaveCount(0);
});

test("S2-9 slow5s 5장 → 진행 최대 3 + 대기 2, 끝나면 5장 등록", async ({
  page,
}) => {
  await chooseFiles(
    page,
    Array.from({ length: 5 }, (_, i) => jpg(`slow5s-${i}.jpg`)),
  );
  await expect(slotsIn(page, "uploading")).toHaveCount(3);
  await expect(slotsIn(page, "queued")).toHaveCount(2);
  await expect(slotsIn(page, "queued").first()).not.toHaveAttribute(
    "aria-busy",
    /.+/,
  );
  await expect(slotsIn(page, "queued").first()).toContainText("대기");
  await expect(saveButton(page)).toBeDisabled();
  await expect(registered(page)).toHaveCount(5, { timeout: 25_000 });
  await expect(saveButton(page)).toBeEnabled();
});

test("S2-10 시즌 종료 수정 화면 — + 와 드래그가 비활성", async ({ page }) => {
  await page.goto("/products/1006/edit");
  await expect(
    page.getByRole("heading", { name: "게시글 수정" }),
  ).toBeVisible();
  await expect(addSlot(page)).toBeDisabled();
  await expect(addSlot(page)).toHaveAttribute("data-ac", /S2-10/);
  await expect(registered(page).first()).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  // 등록 칸의 × (S3-1, #251) 도 잠긴다
  await expect(
    page.getByRole("button", { name: "이미지 1 빼기" }),
  ).toBeDisabled();
});

test("S2-12 순서 — slow5s A, 보통 B: B 가 먼저 끝나도 보류, A 끝나면 [A, B] 와 대표 A", async ({
  page,
}) => {
  await chooseFiles(page, [jpg("slow5s-A.jpg"), png("B.png")]);
  // B 는 끝났지만 보류 — images 는 아직 []
  await expect(slotsIn(page, "held")).toHaveCount(1, DONE);
  await expect(slotsIn(page, "held")).toContainText("순서 대기");
  await expect(registered(page)).toHaveCount(0);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);

  await expect(registered(page)).toHaveCount(2, DONE);
  await expectDecoded(registered(page).nth(0).locator("img"), JPG_WIDTH);
  await expectDecoded(registered(page).nth(1).locator("img"), PNG_WIDTH);
  await expect(registered(page).nth(0).getByText("대표")).toBeVisible();
});

test("S2-12 순서 — A 가 fail500 이면 B 완료 직후 [B], 실패 칸은 뒤에", async ({
  page,
}) => {
  await chooseFiles(page, [jpg("x-fail500-A.jpg"), png("B.png")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await expectDecoded(registered(page).first().locator("img"), PNG_WIDTH);
  await expect(registered(page).first().getByText("대표")).toBeVisible();
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(cells(page).nth(1)).toHaveAttribute("data-state", "failed");
});

test("S2-13 같은 jpg 를 다시 고르면 두 번째 업로드가 나가고 칸이 2개", async ({
  page,
}) => {
  await chooseFiles(page, [jpg("same.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await chooseFiles(page, [jpg("same.jpg")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  expect(await uploadRequestCount(page)).toBe(2);
});

test("S2-14 재시도 — fail500once → 다시 시도 → 요청 2 → 등록. 다시 고르기형은 재시도 없음", async ({
  page,
}) => {
  await chooseFiles(page, [jpg("y-fail500once.jpg")]);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("data-kind", "retry");
  await page.getByRole("button", { name: "이미지 1 다시 시도" }).click();
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(failed).toHaveCount(0);
  expect(await uploadRequestCount(page)).toBe(2);

  // 확장자만 jpg 인 txt — 사전 검사는 지나고 서버(목)가 415
  await chooseFiles(page, [
    { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("hello") },
  ]);
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("data-kind", "repick");
  await expect(
    page.getByRole("alert", {
      name: "jpg·png만 올릴 수 있어요. 다시 골라 주세요",
    }),
  ).toBeVisible();
  await expect(failed).toContainText("다시 골라 주세요");
  await expect(page.getByRole("button", { name: /다시 시도/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "이미지 2 빼기" }),
  ).toBeVisible();
});

test("S2-15 9칸 연속 — 8장 뒤 2장 고르면 1장만, 실패해도 + 없음, 빼기 뒤 + 복귀", async ({
  page,
}) => {
  await chooseFiles(
    page,
    Array.from({ length: 8 }, (_, i) => jpg(`e${i}.jpg`)),
  );
  await expect(registered(page)).toHaveCount(8, DONE);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 1장 더 올릴 수 있어요",
  );

  await chooseFiles(page, [jpg("x-fail500.jpg"), jpg("extra.jpg")]);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(page.getByRole("alert").locator("li")).toHaveText([
    "1장은 칸이 없어 빠졌어요",
  ]);
  await expect(addSlot(page)).toHaveCount(0);

  await page.getByRole("button", { name: "이미지 9 빼기" }).click();
  await expect(slotsIn(page, "failed")).toHaveCount(0);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 1장 더 올릴 수 있어요",
  );
});
