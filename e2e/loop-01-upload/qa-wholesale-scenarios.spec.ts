import { expect, test } from "@playwright/test";
import {
  addSlot,
  cancelButton,
  cells,
  chooseFiles,
  expectDecoded,
  fillPostPanel,
  fillProductForm,
  fillProductPanel,
  jpg,
  leaveDialog,
  login,
  openCreateWithPost,
  png,
  registered,
  saveButton,
  slotsIn,
  submitCreate,
  uploadNote,
  uploadRequestCount,
} from "./helpers";
import { anySaveButton, observe, shot } from "./qa-helpers";

/**
 * QA — 사장 시나리오 3개 + 반복 결함 4패턴(ondo-verify §3).
 * 개발이 짠 경로가 아니라 하루 일과다. 막히면 "무엇을 못 하는가"가 04-qa.md 에 있다.
 */
const DONE = { timeout: 15_000 };

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("사장 1 — 신상 9장 한 번에 올리고 등록: 3파동으로 다 올라가고 상세에 9장", async ({
  page,
}) => {
  await page.goto("/products/new");
  await fillProductPanel(page);
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toBeVisible();
  await chooseFiles(
    page,
    Array.from({ length: 9 }, (_, i) =>
      i % 2 === 0 ? jpg(`shot-${i}.jpg`) : png(`shot-${i}.png`),
    ),
  );
  // 동시 3 — 처음엔 진행 3 + 대기 6, 저장 잠김
  await expect(slotsIn(page, "uploading")).toHaveCount(3);
  await expect(slotsIn(page, "queued")).toHaveCount(6);
  await expect(saveButton(page)).toBeDisabled();
  await expect(addSlot(page)).toHaveCount(0);

  await expect(registered(page)).toHaveCount(9, DONE);
  await expect(saveButton(page)).toBeEnabled();
  await expect(uploadNote(page)).toHaveCount(0);
  expect(await uploadRequestCount(page)).toBe(9);
  await fillPostPanel(page);
  await page.screenshot({ path: shot("s1-nine-before-save") });

  const body = await submitCreate(page);
  expect(body.listing.images).toHaveLength(9);
  const images = page.getByRole("img", { name: /^e2e 게시글 이미지 [1-9]$/ });
  await expect(images).toHaveCount(9);
  await expectDecoded(images.first());
  await page.screenshot({ path: shot("s1-nine-detail") });
});

test("사장 2 — 한 장이 실패해서 빼고 저장: 실패 칸 × → 문구 사라지고 1장만 실린다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(page, [jpg("front.jpg"), jpg("back-fail500.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await expect(uploadNote(page)).toHaveText(
    "실패한 사진 1장은 저장되지 않아요",
  );

  await page.getByRole("button", { name: "이미지 2 빼기" }).click();
  await expect(failed).toHaveCount(0);
  await expect(uploadNote(page)).toHaveCount(0);
  await expect(addSlot(page)).toHaveAccessibleName(
    "이미지 추가, 8장 더 올릴 수 있어요",
  );
  const body = await submitCreate(page);
  expect(body.listing.images).toHaveLength(1);
  await expect(
    page.getByRole("img", { name: /^e2e 게시글 이미지 1$/ }),
  ).toHaveCount(1);
});

test("사장 3 — 올리다가 취소 눌렀다가 계속 작성: 업로드가 끊기지 않고 끝나 등록 칸이 된다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await page.getByLabel("품명", { exact: true }).fill("신상 셔츠");
  await chooseFiles(page, [jpg("slow5s-front.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);

  await cancelButton(page).click();
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "계속 작성" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("품명", { exact: true })).toHaveValue(
    "신상 셔츠",
  );
  // 올리던 사진이 그대로 끝난다
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(saveButton(page)).toBeEnabled();
  expect(await uploadRequestCount(page)).toBe(1);
});

/* ------------------------------------------------------------------------
 * 반복 결함 4패턴
 * ------------------------------------------------------------------------ */

test("패턴 1 숫자 입력 방어 — 이번 변경엔 숫자칸이 없다(격자 안 input 은 file 하나). 판매가 칸은 기존 가드 그대로", async ({
  page,
}) => {
  await openCreateWithPost(page);
  const inputs = page.locator('[data-ac="S3-7"] input');
  await expect(inputs).toHaveCount(1);
  await expect(inputs).toHaveAttribute("type", "file");
  // 기존 판매가 칸의 가드가 이번 변경으로 풀리지 않았는지 한 번만
  await fillProductForm(page);
  const price = page.getByRole("textbox", { name: "블랙 M 판매가" });
  await price.fill("45.5");
  await expect(price).not.toHaveValue("455");
});

test("패턴 2 가려진 대상 — 함께 게시를 끄면 격자가 사라지고 저장은 listing 없이 간다(올린 장이 몰래 실리지 않는다)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toHaveCount(0);
  await anySaveButton(page).click();
  await page.waitForURL(/\/products\?productId=\d+/);
  const body = (await page.evaluate(
    () =>
      (window as unknown as { __lastProductRequest?: unknown })
        .__lastProductRequest,
  )) as { listing: unknown };
  expect(body.listing).toBeNull();
});

test("패턴 3 왕복 소실 — 실패 칸·거절 목록은 함께 게시 해제→재체크에서 사라진다(격자 상태). 등록 칸만 남는다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [
    jpg("a.jpg"),
    jpg("x-fail500.jpg"),
    { name: "c.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") },
  ]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(slotsIn(page, "failed")).toHaveCount(1);
  await expect(page.locator('ul[role="alert"] li')).toHaveCount(1);
  await expect(uploadNote(page)).toHaveText(
    "실패한 사진 1장은 저장되지 않아요",
  );

  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toHaveCount(0);
  // 격자가 사라지면 잠금·문구도 같이 사라져야 저장할 길이 있다
  await expect(uploadNote(page)).toHaveCount(0);
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(registered(page)).toHaveCount(1);
  const failedAfter = await slotsIn(page, "failed").count();
  const rejectedAfter = await page.locator('ul[role="alert"] li').count();
  observe("패턴3-roundtrip", {
    failedAfter,
    rejectedAfter,
    note: "기획안 §4 분기: 대기·진행분은 버려진다 — 실패 칸·거절 목록은 명시 없음",
  });
  await expect(cells(page)).toHaveCount(1 + failedAfter);
});

test("패턴 4 실행 신호 — 다시 시도 두 번 연타해도 요청은 1번만 더 나간다, 저장 연타는 isPending 이 막는다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(page, [jpg("y-fail500once.jpg")]);
  const retry = page.getByRole("button", { name: "이미지 1 다시 시도" });
  await expect(retry).toBeVisible();
  await retry.dblclick().catch(() => undefined);
  await expect(registered(page)).toHaveCount(1, DONE);
  expect(await uploadRequestCount(page)).toBe(2);

  // 저장 연타(dblclick) — 등록은 한 번만. 목은 페이지 수명이라 **클라이언트 이동**으로 목록에 가서
  // 같은 품명 행이 1개인지 센다(전체 이동은 목을 리셋한다)
  await saveButton(page).dblclick();
  await page.waitForURL(/\/products\?productId=\d+/);
  const id = Number(new URL(page.url()).searchParams.get("productId"));
  expect(id).toBeGreaterThan(0);
  await page.getByRole("link", { name: "상품" }).first().click();
  await page.waitForURL((url) => url.pathname === "/products" && !url.search);
  const rows = page.getByText("e2e 업로드 상품", { exact: true });
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  observe("패턴4-save-dblclick", { productId: id, rowsWithName: count });
  expect(count).toBe(1);
});

/* ------------------------------------------------------------------------
 * 키보드 · 접근성 구조 (S3-1 키보드 경로, 중첩 interactive)
 * ------------------------------------------------------------------------ */

test("키보드 — × 에 포커스를 두고 Enter·Space 를 누르면 빠진다(S3-1 의 × 는 버튼이다)", async ({
  page,
}) => {
  // F4 회귀 테스트(G3 수정 #251 에서 test.fail 표시를 뗐다). 껍데기가 activatorNode 라 버튼의 Enter 는 버튼 몫이다
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const remove = page.getByRole("button", { name: "이미지 1 빼기" });
  await remove.focus();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  const afterEnter = await registered(page).count();
  // dnd-kit 이 집었다면 live region 에 "Picked up" 안내가 뜬다
  const announced = await page
    .locator("#DndLiveRegion-0, [id^=DndLiveRegion]")
    .allTextContents()
    .catch(() => []);
  observe("키보드-×-Enter", { afterEnter, announced });
  if (afterEnter === 2) {
    await page.keyboard.press("Escape");
    await remove.focus();
    await page.keyboard.press("Space");
    observe("키보드-×-Space", { afterSpace: await registered(page).count() });
  }
  await expect(registered(page)).toHaveCount(1);
  await expect(registered(page).first()).toHaveAccessibleName("이미지 1, 대표");
});

test("구조 — 등록 칸 손잡이(role=button, dnd-kit)는 × 버튼을 품지 않는다(#254 F5)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const shell = registered(page).first();
  const info = await shell.evaluate((e) => {
    const handle = e.querySelector('[aria-roledescription="sortable"]');
    return {
      role: handle?.getAttribute("role") ?? null,
      tabindex: handle?.getAttribute("tabindex") ?? null,
      roledescription: handle?.getAttribute("aria-roledescription") ?? null,
      nestedButtons: handle?.querySelectorAll("button").length ?? -1,
      siblingButtons: e.querySelectorAll(":scope > button").length,
    };
  });
  observe("구조-등록칸-중첩", info);
  expect(info.role).toBe("button");
  expect(info.nestedButtons).toBe(0);
  expect(info.siblingButtons).toBe(1);
});
