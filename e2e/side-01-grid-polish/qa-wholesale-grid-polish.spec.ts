import { expect, test, type Locator, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  addSlot,
  chooseFiles,
  grid,
  jpg,
  login,
  openCreateWithPost,
  openEdit,
  png,
  registered,
  uploadNote,
} from "../loop-01-upload/helpers";
import {
  computedColor,
  contrast,
  styles,
  type Rgb,
} from "../loop-01-upload/qa-helpers";

/**
 * side-01-grid-polish QA (#254). 개발 spec(wholesale-grid-polish.spec.ts)이 안 본 것만 잰다.
 * 1. 접근 트리(aria snapshot) — 칸 이름이 손잡이에만 한 번 있는가(F1)
 * 2. 링·문구의 대비를 **실제 뒤 배경**으로 잰다(개발 spec 은 흰색 가정)
 * 3. × 가 손잡이에 가리지 않는지 elementFromPoint 로
 * 4. 대기 칸, 수정 화면 문구, 마우스 클릭엔 링이 안 나오는지
 * 스크린샷과 관찰값은 runs/side-01-grid-polish/qa/ 에 남긴다.
 */
const QA_DIR = path.resolve(
  __dirname,
  "../../.claude/harness/runs/side-01-grid-polish/qa",
);
mkdirSync(QA_DIR, { recursive: true });
const shot = (name: string) => path.join(QA_DIR, `${name}.png`);
function observe(name: string, data: unknown): void {
  const line = JSON.stringify({ at: new Date().toISOString(), name, data });
  appendFileSync(path.join(QA_DIR, "observations.jsonl"), `${line}\n`);
  test.info().annotations.push({ type: name, description: line });
}

const DONE = { timeout: 15_000 };
const GRAY_500 = { r: 106, g: 114, b: 130, a: 1 };
const GRAY_900 = { r: 16, g: 24, b: 40, a: 1 };

function near(a: Rgb, b: Rgb, tol = 3) {
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol
  );
}

/** 요소 뒤에 실제로 칠해진 배경 — 투명이면 부모로 올라간다 */
async function backdrop(el: Locator): Promise<Rgb & { raw: string }> {
  return el.evaluate((node) => {
    let cur: Element | null = node.parentElement;
    let raw = "rgba(0, 0, 0, 0)";
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        raw = bg;
        break;
      }
      cur = cur.parentElement;
    }
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d 없음");
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data) as [
      number,
      number,
      number,
      number,
    ];
    return { r, g, b, a: a / 255, raw };
  });
}

function handle(page: Page, n: number): Locator {
  return page.getByRole("button", {
    name: new RegExp(`^이미지 ${n}(, 대표)?$`),
  });
}

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

test("QA-A1 접근 트리 — 등록 칸 2개의 role·이름 순서를 기록, 이름은 손잡이에만(F1)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  const snap = await grid(page).ariaSnapshot();
  observe("aria-snapshot-registered-2", snap);

  // 칸마다 group 이름과 그 안 첫 button(손잡이) 이름을 나란히 뽑는다
  const pairs = await registered(page).evaluateAll((cells) =>
    cells.map((c) => {
      const h = c.querySelector('[aria-roledescription="sortable"]');
      return {
        groupRole: c.getAttribute("role"),
        groupName: c.getAttribute("aria-label"),
        handleRole: h?.getAttribute("role") ?? null,
        handleName: h?.getAttribute("aria-label") ?? null,
        handleDescribedBy: h?.getAttribute("aria-describedby") ?? null,
        removeName:
          c.querySelector(":scope > button")?.getAttribute("aria-label") ??
          null,
      };
    }),
  );
  observe("group-vs-handle-name", pairs);
  // F1 수정 뒤: 바깥 칸은 역할·이름이 없고, 이름은 손잡이에만 한 번 있다
  pairs.forEach((p, i) => {
    expect(p.groupRole).toBeNull();
    expect(p.groupName).toBeNull();
    expect(p.handleRole).toBe("button");
    expect(p.handleName).toBe(i === 0 ? "이미지 1, 대표" : `이미지 ${i + 1}`);
  });
});

test("QA-A2 × 중심과 손잡이 중심 hit test — 각자 자기 요소가 맞는다(등록·수정)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg"), png("b.png")]);
  await expect(registered(page)).toHaveCount(2, DONE);
  for (const cell of await registered(page).all()) {
    const hit = await cell.evaluate((c) => {
      const rm = c.querySelector(":scope > button");
      const h = c.querySelector('[aria-roledescription="sortable"]');
      if (!rm || !h) return null;
      const r = rm.getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      const atRm = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      const atH = document.elementFromPoint(
        hr.x + hr.width / 2,
        hr.y + hr.height / 2,
      );
      return {
        rmHit: !!atRm && rm.contains(atRm),
        handleHit: !!atH && h.contains(atH),
        handleBox: [hr.width, hr.height],
        cellBox: [
          c.getBoundingClientRect().width,
          c.getBoundingClientRect().height,
        ],
      };
    });
    observe("hit-test-create", hit);
    expect(hit).toMatchObject({ rmHit: true, handleHit: true });
    // 칸 껍데기와 손잡이 크기가 같다(88px) — × 의 absolute 기준이 손잡이와 어긋나지 않는다
    expect(hit?.handleBox).toEqual(hit?.cellBox);
  }

  await openEdit(page, 1001);
  await expect(registered(page).first()).toBeVisible(DONE);
  const rm = page.getByRole("button", { name: "이미지 1 빼기", exact: true });
  const ok = await rm.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!at && b.contains(at);
  });
  expect(ok).toBe(true);
});

test("QA-A3 링 대비 — ring 색 대 실제 뒤 배경 3:1 이상, 손잡이 링 반경 8px", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const h = handle(page, 1);
  await tabTo(page, h);
  await expect
    .poll(async () => near(await computedColor(h, "outline-color"), GRAY_500))
    .toBe(true);
  const ring = await computedColor(h, "outline-color");
  const bg = await backdrop(registered(page).first());
  const ratio = contrast(ring, bg);
  const radius = (await styles(h, ["border-radius"]))["border-radius"];
  observe("ring-contrast", { ring: ring.raw, bg: bg.raw, ratio, radius });
  expect(ratio).toBeGreaterThanOrEqual(3);
  expect(radius).toBe("8px");
  await grid(page).screenshot({
    path: shot("ring-handle"),
    animations: "disabled",
  });

  const rm = page.getByRole("button", { name: "이미지 1 빼기", exact: true });
  await tabTo(page, rm);
  await expect
    .poll(async () => near(await computedColor(rm, "outline-color"), GRAY_500))
    .toBe(true);
  await grid(page).screenshot({
    path: shot("ring-remove"),
    animations: "disabled",
  });
});

test("QA-A4 대기 칸 — Tab 링이 2px solid offset 2px ring", async ({ page }) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [
    jpg("slow5s-1.jpg"),
    jpg("slow5s-2.jpg"),
    jpg("slow5s-3.jpg"),
    jpg("slow5s-4.jpg"),
  ]);
  const cells = await grid(page)
    .locator("> [data-state]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  observe("states-4-slow", cells);
  const waiting = grid(page).locator(
    '> [data-state]:not([data-state="uploading"]):not([data-state="registered"]):not([data-state="failed"])',
  );
  await expect(waiting).toHaveCount(1);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await tabTo(page, waiting);
  expect(await waiting.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  expect(
    await styles(waiting, ["outline-width", "outline-style", "outline-offset"]),
  ).toMatchObject({
    "outline-width": "2px",
    "outline-style": "solid",
    "outline-offset": "2px",
  });
  expect(near(await computedColor(waiting, "outline-color"), GRAY_500)).toBe(
    true,
  );
  await grid(page).screenshot({
    path: shot("ring-waiting"),
    animations: "disabled",
  });
});

test("QA-A5 마우스로 손잡이를 누르면 링이 안 나온다(:focus-visible 아님)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1, DONE);
  const h = handle(page, 1);
  await h.click();
  const st = await h.evaluate((e) => ({
    focused: e === document.activeElement,
    visible: e.matches(":focus-visible"),
    outline: getComputedStyle(e).outlineStyle,
  }));
  observe("mouse-click-handle", st);
  expect(st.visible).toBe(false);
});

test("QA-A6 문구 대비 — 등록·수정 모두 foreground, 실제 뒤 배경 4.5 이상", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-create.jpg")]);
  const note = uploadNote(page);
  await expect(note).toHaveText("사진 올리는 중…");
  const c1 = await computedColor(note, "color");
  const b1 = await backdrop(note);
  observe("note-create", {
    color: c1.raw,
    bg: b1.raw,
    ratio: contrast(c1, b1),
  });
  expect(near(c1, GRAY_900)).toBe(true);
  expect(contrast(c1, b1)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: shot("note-create") });

  await openEdit(page, 1001);
  await expect(registered(page).first()).toBeVisible(DONE);
  await chooseFiles(page, [jpg("slow5s-edit.jpg")]);
  const note2 = uploadNote(page);
  await expect(note2).toHaveText("사진 올리는 중…");
  const c2 = await computedColor(note2, "color");
  const b2 = await backdrop(note2);
  observe("note-edit", { color: c2.raw, bg: b2.raw, ratio: contrast(c2, b2) });
  expect(near(c2, GRAY_900)).toBe(true);
  expect(contrast(c2, b2)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: shot("note-edit") });
});

test("QA-A7 + 링 — Tab 포커스 링 색과 뒤 배경 대비 3:1 이상", async ({
  page,
}) => {
  await openCreateWithPost(page);
  const add = addSlot(page);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await tabTo(page, add);
  await expect
    .poll(async () => near(await computedColor(add, "outline-color"), GRAY_500))
    .toBe(true);
  const bg = await backdrop(add);
  observe("add-ring", {
    bg: bg.raw,
    ratio: contrast(await computedColor(add, "outline-color"), bg),
  });
  await grid(page).screenshot({
    path: shot("ring-add"),
    animations: "disabled",
  });
  expect(
    contrast(await computedColor(add, "outline-color"), bg),
  ).toBeGreaterThanOrEqual(3);
});

/**
 * 링이 가장 가까운 스크롤 박스(Panel.Body `overflow-y-auto`, 패딩 0)에 잘리는지. 링은 칸 밖으로
 * 4px(offset 2 + width 2) 나간다. overflow-y:auto 면 x 도 auto 로 계산돼 왼쪽 4px 가 잘린다.
 * 결함 F2 회귀 — 격자 `p-1`로 고쳤다(test.fail 뗌).
 */
async function clipRoom(el: Locator) {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    let cur: Element | null = node.parentElement;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.overflowX !== "visible") {
        const pr = cur.getBoundingClientRect();
        return {
          el: `${node.tagName.toLowerCase()}[role=${node.getAttribute("role")}][aria-label="${node.getAttribute("aria-label")}"]`,
          clipper: `${cur.tagName.toLowerCase()}.${cur.className.toString().split(" ").join(".")}`,
          overflowX: cs.overflowX,
          left: r.left - 4 - pr.left,
          top: r.top - 4 - pr.top,
        };
      }
      cur = cur.parentElement;
    }
    return null;
  });
}

test.describe("QA-A8 링 잘림", () => {
  test.use({ deviceScaleFactor: 3 });

  test("QA-A8 첫 칸 손잡이와 0장일 때 + 의 링 왼쪽 4px 가 스크롤 박스 안에 들어온다", async ({
    page,
  }) => {
    await openCreateWithPost(page);
    const add = addSlot(page);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await tabTo(page, add);
    const addRoom = await clipRoom(add);
    observe("clip-add", addRoom);
    const ab = await add.boundingBox();
    if (ab)
      await page.screenshot({
        path: shot("clip-add"),
        clip: { x: ab.x - 20, y: ab.y - 12, width: 130, height: 112 },
      });

    await chooseFiles(page, [jpg("a.jpg")]);
    await expect(registered(page)).toHaveCount(1, DONE);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const h = handle(page, 1);
    await tabTo(page, h);
    await page.waitForTimeout(200);
    const hRoom = await clipRoom(h);
    observe("clip-handle", hRoom);
    const hb = await h.boundingBox();
    if (hb)
      await page.screenshot({
        path: shot("clip-handle"),
        clip: { x: hb.x - 20, y: hb.y - 12, width: 130, height: 112 },
      });

    expect(addRoom?.left).toBeGreaterThanOrEqual(0);
    expect(hRoom?.left).toBeGreaterThanOrEqual(0);
  });
});
