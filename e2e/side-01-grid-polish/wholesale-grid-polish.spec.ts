import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addSlot,
  chooseFiles,
  fieldError,
  fillProductForm,
  jpg,
  login,
  openCreateWithPost,
  openEdit,
  png,
  registered,
  saveButton,
  slotsIn,
  uploadNote,
} from "../loop-01-upload/helpers";
import {
  computedColor,
  contrast,
  styles,
  WHITE,
} from "../loop-01-upload/qa-helpers";

/**
 * side-01-grid-polish (#254). 게시글 이미지 격자의 × 구조(F5), 포커스 링(F6), 하단 바 문구 색(F8).
 * 기준은 와이어프레임 16번 `.slot[tabindex]:focus-visible`·`.rm:focus-visible`(outline 2px ring,
 * offset 2px)과 `.actionbar .note`(색 지정 없음 = foreground). 값은 theme.css:
 * ring = gray-500(106,114,130), foreground = gray-900(16,24,40), destructive-strong = red-700.
 */
const DONE = { timeout: 15_000 };
const GRAY_500 = { r: 106, g: 114, b: 130, a: 1 };
const GRAY_900 = { r: 16, g: 24, b: 40, a: 1 };
const RED_700 = { r: 193, g: 0, b: 7, a: 1 };

function near(a: { r: number; g: number; b: number }, b: typeof a, tol = 3) {
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol
  );
}

/** 등록 칸 N의 집기 손잡이. 이름이 "이미지 N" 또는 "이미지 N, 대표" */
function handle(page: Page, n: number): Locator {
  return page.getByRole("button", {
    name: new RegExp(`^이미지 ${n}(, 대표)?$`),
  });
}

/** dnd-kit 이 집거나 옮길 때 안내를 쓰는 곳 */
async function liveRegionText(page: Page): Promise<string> {
  const texts = await page.locator("[id^=DndLiveRegion]").allTextContents();
  return texts.join(" ");
}

/** S1-5 의 링 값. 키보드 포커스에서만(`:focus-visible`) 나와야 한다 */
async function expectRing(el: Locator): Promise<void> {
  await expect(el).toBeFocused();
  expect(await el.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  const ring = await styles(el, [
    "outline-width",
    "outline-style",
    "outline-offset",
  ]);
  expect(ring).toMatchObject({
    "outline-width": "2px",
    "outline-style": "solid",
    "outline-offset": "2px",
  });
  // Button 은 `transition-colors`라 outline-color 가 150ms 동안 글자색에서 넘어온다
  await expect
    .poll(async () => near(await computedColor(el, "outline-color"), GRAY_500))
    .toBe(true);
}

/** 키보드 포커스를 만든다. `focus()`만으론 :focus-visible 이 안 붙는 칸이 있어 Tab 으로 들어간다 */
async function tabTo(page: Page, el: Locator): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if (await el.evaluate((e) => e === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab 으로 닿지 않는다");
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("S1-1 등록 화면 — 손잡이 안 button 0개, × 는 손잡이 밖에 1개", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const nested = await page
    .locator('[data-ac="S2-8"] [role="button"] button')
    .count();
  expect(nested).toBe(0);
  await expect(page.getByRole("button", { name: "이미지 1 빼기" })).toHaveCount(
    1,
  );
  await expect(handle(page, 1)).toHaveAttribute(
    "aria-roledescription",
    "sortable",
  );
});

test("S1-1 수정 화면 — 시드 이미지 칸도 손잡이 안 button 0개", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await expect(registered(page).first()).toBeVisible(DONE);
  const nested = await page
    .locator('[data-ac="S2-8"] [role="button"] button')
    .count();
  expect(nested).toBe(0);
  await expect(page.getByRole("button", { name: "이미지 1 빼기" })).toHaveCount(
    1,
  );
});

test("S1-2 F4 회귀 — × 에 포커스, Enter 로 2→1, Space 로 1→0, 집기 안내 없음", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);

  const remove = page.getByRole("button", { name: "이미지 1 빼기" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(registered(page)).toHaveCount(1);
  expect(await liveRegionText(page)).not.toMatch(/Picked up|Draggable item/);

  await remove.focus();
  await page.keyboard.press("Space");
  await expect(registered(page)).toHaveCount(0);
  expect(await liveRegionText(page)).not.toMatch(/Picked up|Draggable item/);
});

test("S1-3 손잡이 키보드 정렬 — 이미지 2 를 Space·←·Space 로 대표 자리에", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png"), jpg("c.jpg")]);
  await expect(registered(page)).toHaveCount(3, DONE);
  const second = await registered(page)
    .nth(1)
    .locator("img")
    .getAttribute("src");

  // KeyboardSensor 는 한 키마다 칸을 다시 재고 안내를 쓴다. 안내가 바뀌기 전에 다음 키를 누르면 씹힌다
  await handle(page, 2).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => liveRegionText(page)).toMatch(/moved over/);
  const picked = await liveRegionText(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => liveRegionText(page)).not.toBe(picked);
  await page.keyboard.press("Space");
  await expect.poll(() => liveRegionText(page)).toMatch(/dropped/);

  await expect(handle(page, 1)).toHaveAccessibleName("이미지 1, 대표");
  await expect(registered(page).nth(0).locator("img")).toHaveAttribute(
    "src",
    second ?? "",
  );
});

test("S1-4 마우스로 칸 2 를 칸 1 자리로 끈 뒤 칸 1 의 × — 순서 바뀌고 그 장이 빠진다, × 는 좌상단 4/4 24px", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const [firstSrc, secondSrc] = await Promise.all([
    registered(page).nth(0).locator("img").getAttribute("src"),
    registered(page).nth(1).locator("img").getAttribute("src"),
  ]);

  const from = await handle(page, 2).boundingBox();
  const to = await handle(page, 1).boundingBox();
  if (!from || !to) throw new Error("칸이 안 보인다");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // 8px 문턱을 넘기고 몇 번에 나눠 옮겨야 closestCenter 가 따라온다
  await page.mouse.move(
    from.x + from.width / 2 - 20,
    from.y + from.height / 2,
    {
      steps: 5,
    },
  );
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(registered(page).nth(0).locator("img")).toHaveAttribute(
    "src",
    secondSrc ?? "",
  );

  // 놓은 뒤 칸이 transform 전환으로 미끄러져 들어온다. 멈춘 뒤에 눌러야 자리를 잰 값이 맞다
  await expect
    .poll(() =>
      registered(page)
        .nth(0)
        .evaluate((e) => getComputedStyle(e).transform),
    )
    .toBe("none");
  // dnd-kit PointerSensor 는 드래그를 놓은 뒤 50ms 동안 document click 을 삼킨다(core 6.3.1
  // detach). 사람 손은 그 안에 다시 못 누르지만 Playwright 는 누른다
  await page.waitForTimeout(100);
  const remove = registered(page)
    .nth(0)
    .getByRole("button", { name: "이미지 1 빼기" });
  expect(
    await styles(remove, ["top", "left", "width", "height"]),
  ).toMatchObject({ top: "4px", left: "4px", width: "24px", height: "24px" });
  // 중심 클릭이 손잡이에 가리지 않고 × 에 닿는다
  await remove.click();
  await expect(registered(page)).toHaveCount(1);
  await expect(registered(page).nth(0).locator("img")).toHaveAttribute(
    "src",
    firstSrc ?? "",
  );
});

test("S1-5 함께 게시 0장 저장(Enter) — + 로 포커스, 링 2px solid offset 2px ring", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await saveButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(fieldError(page, "listing.images")).toBeVisible();
  await expectRing(addSlot(page));
});

test("S1-6 손잡이 · 진행 칸 · 실패 칸 — Tab 포커스 링이 S1-5 와 같다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), jpg("fail500.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await expect(slotsIn(page, "failed")).toHaveCount(1, DONE);
  await chooseFiles(page, [jpg("slow5s-ring.jpg")]);
  const uploading = slotsIn(page, "uploading");
  await expect(uploading).toHaveCount(1);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const h = handle(page, 1);
  await tabTo(page, h);
  await expectRing(h);
  const failed = slotsIn(page, "failed");
  await tabTo(page, failed);
  await expectRing(failed);
  await tabTo(page, uploading);
  await expectRing(uploading);
});

test("S1-7 등록 칸 × — Tab 포커스 링이 S1-5 와 같다", async ({ page }) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const remove = page.getByRole("button", { name: "이미지 1 빼기" });
  await tabTo(page, remove);
  await expectRing(remove);
});

test("S1-8 올리는 중 문구 — foreground(gray-900), 흰 바탕 대비 4.5 이상, 14px", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-note.jpg")]);
  const note = uploadNote(page);
  await expect(note).toHaveText("사진 올리는 중…");
  const color = await computedColor(note, "color");
  expect(near(color, GRAY_900), `문구 색 ${color.raw}`).toBe(true);
  expect(contrast(color, WHITE)).toBeGreaterThanOrEqual(4.5);
  expect((await styles(note, ["font-size"]))["font-size"]).toBe("14px");
});

test("S1-9 실패 1, 진행 0 — 문구는 destructive-strong 그대로", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("fail500.jpg")]);
  await expect(slotsIn(page, "failed")).toHaveCount(1, DONE);
  const note = uploadNote(page);
  await expect(note).toHaveText("실패한 사진 1장은 저장되지 않아요");
  const color = await computedColor(note, "color");
  expect(near(color, RED_700), `문구 색 ${color.raw}`).toBe(true);
});
