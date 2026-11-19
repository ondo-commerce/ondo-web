import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertSameDay,
  assertStubServers,
  bell,
  box,
  chatNav,
  moreButton,
  openPanel,
  pageOverflow,
  panel,
  rows,
  startNotify,
} from "./helpers";

/**
 * #305 S2-8 — 가려진 대상(05a F3, 05b M5). 헤더에 종이 하나 더 들어선 뒤 네 폭에서 아이콘과 검색이 눌리는지,
 * 패널 끝 행이 화면 안인지. 와이어프레임 `20_retail-notifications` `#state-header-widths`, 디자인 결정 48~50.
 *
 * 검색칸 하한은 기획 Q3 값(390 ≥ 90, 360 ≥ 60)이다. 디자인은 와이어프레임에서 89/59를 재고 88/58로 낮추자고
 * 했지만(결정 48), 앱에선 390 107px, 360 77px가 나와 원래 하한을 그대로 지킨다(10-30 실측).
 * 320은 검색칸 대신 돋보기 버튼(결정 49).
 */

assertStubServers();
test.afterAll(assertSameDay);

const VIEWPORTS = [
  { width: 320, height: 640, searchMin: null },
  { width: 360, height: 800, searchMin: 60 },
  { width: 390, height: 844, searchMin: 90 },
  { width: 1470, height: 900, searchMin: 340 },
] as const;

/** 그 요소 중심점에서 맨 위에 있는 요소가 그 요소(또는 그 안)인가 */
async function hitsItself(page: Page, target: Locator): Promise<boolean> {
  const b = await box(target);
  const handle = await target.elementHandle();
  return page.evaluate(
    ({ x, y, el }) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && el !== null && (el === hit || el.contains(hit));
    },
    { x: b.x + b.width / 2, y: b.y + b.height / 2, el: handle },
  );
}

function header(page: Page): Locator {
  return page.getByRole("banner");
}

function searchToggle(page: Page): Locator {
  return header(page).getByRole("button", { name: "통합 검색 열기" });
}

for (const vp of VIEWPORTS) {
  test(`S2-8 ${vp.width}x${vp.height} 가로 스크롤 0, 검색 ${vp.searchMin ?? "돋보기"}, 헤더 아이콘 중심이 그 아이콘`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startNotify(page, "/");
    expect((await pageOverflow(page)).x).toBe(0);

    const icons: Locator[] = [
      chatNav(page),
      bell(page),
      header(page).getByRole("link", { name: /^장바구니/ }),
      header(page).getByRole("button", { name: /계정 메뉴$/ }),
    ];
    const wish = header(page).getByRole("link", { name: "찜 목록" });
    if (vp.width > 640) {
      await expect(wish).toBeVisible();
      icons.push(wish);
    } else await expect(wish).toBeHidden();

    if (vp.searchMin === null) {
      await expect(header(page).getByRole("search")).toBeHidden();
      icons.push(searchToggle(page));
    } else {
      await expect(searchToggle(page)).toBeHidden();
      const search = await box(header(page).getByRole("search"));
      expect(search.width).toBeGreaterThanOrEqual(vp.searchMin);
    }

    for (const icon of icons) {
      const b = await box(icon);
      expect(b.x, "왼쪽 끝 안").toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, "오른쪽 끝 안").toBeLessThanOrEqual(vp.width);
      expect(await hitsItself(page, icon)).toBe(true);
    }
  });
}

test("S2-8 320 돋보기 → 그 줄이 검색 입력(포커스) + 닫기, Esc → 원래 줄 + 돋보기 포커스, Enter → /search?q=", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startNotify(page, "/");
  await openPanel(page);
  await searchToggle(page).click();
  await expect(panel(page), "검색을 펼치면 패널은 닫힌다").toHaveCount(0);
  const input = header(page).getByRole("searchbox", { name: "통합 검색" });
  await expect(input).toBeFocused();
  await expect(bell(page), "펼친 동안 종은 안 보인다").toBeHidden();
  await expect(
    header(page).getByRole("button", { name: "닫기", exact: true }),
  ).toBeVisible();
  expect((await pageOverflow(page)).x).toBe(0);

  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(searchToggle(page)).toBeFocused();
  await expect(bell(page)).toBeVisible();

  await searchToggle(page).click();
  await header(page).getByRole("button", { name: "닫기", exact: true }).click();
  await expect(searchToggle(page)).toBeFocused();

  await searchToggle(page).click();
  await header(page).getByRole("searchbox", { name: "통합 검색" }).fill("린넨");
  await header(page)
    .getByRole("searchbox", { name: "통합 검색" })
    .press("Enter");
  await expect(page).toHaveURL("/search?q=%EB%A6%B0%EB%84%A8");
  await expect(searchToggle(page)).toBeVisible();
});

for (const width of [360, 390] as const) {
  test(`S2-8 ${width} 계정 메뉴 → 찜 목록 → /wishlist`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await startNotify(page, "/");
    await header(page)
      .getByRole("button", { name: /계정 메뉴$/ })
      .click();
    await page.getByRole("link", { name: "찜 목록", exact: true }).click();
    await expect(page).toHaveURL("/wishlist");
  });
}

for (const vp of VIEWPORTS) {
  test(`S2-8 ${vp.width}x${vp.height} 패널 끝까지 내리면 더 보기와 마지막 행 중심이 그 요소, 폰 폭 좌우 16 안쪽`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startNotify(page, "/");
    await openPanel(page);
    await expect(rows(page)).toHaveCount(20);
    const list = panel(page).locator(".overflow-y-auto");
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

    for (const target of [rows(page).last(), moreButton(page)]) {
      const b = await box(target);
      expect(b.y + b.height, "화면 아래 끝 안").toBeLessThanOrEqual(vp.height);
      expect(await hitsItself(page, target)).toBe(true);
    }

    const p = await box(panel(page));
    if (vp.width <= 640) {
      expect(Math.round(p.x)).toBeGreaterThanOrEqual(16);
      expect(Math.round(p.x + p.width)).toBeLessThanOrEqual(vp.width - 16);
      const rowBox = await box(rows(page).last());
      expect(rowBox.height, "폰 폭 행 최소 44").toBeGreaterThanOrEqual(44);
    } else {
      expect(Math.round(p.width)).toBe(360);
      const b = await box(bell(page));
      expect(Math.abs(p.x + p.width - (b.x + b.width))).toBeLessThanOrEqual(1);
    }
  });
}
