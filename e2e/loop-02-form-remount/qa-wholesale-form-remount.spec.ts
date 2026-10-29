import { expect, test, type Page } from "@playwright/test";
import {
  chooseFiles,
  fillProductForm,
  jpg,
  lastProductRequest,
  login,
  openCreateWithPost,
  registered,
  saveButton,
} from "../loop-01-upload/helpers";

/**
 * loop-02-form-remount QA. 개발 spec(wholesale-link-entry-input)이 못 남긴 증거 셋을 다시 돌릴 수 있게 둔다.
 * 1) F9 원인: 목록 화면에서 부분 일치 `getByLabel("품명")`이 무엇을 잡는가(규칙 8 — 잡은 요소를 증거로)
 * 2) S1-4 보강: 세션 없이 전체 로드하면 품명 칸이 **한 번도** 붙지 않는가(도착 뒤 0개가 아니라 내내 0개)
 * 3) S1-7: 패턴 4 흐름(전체 로드 → 채움 → 재시도 연타 → 저장 연타)의 저장 본문 `name`. 개발 probe 는 커밋되지 않았다
 */
const DONE = { timeout: 15_000 };

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("F9 원인 — /products 에서 부분 일치 품명 locator 는 목록 검색창을 잡고, 정확 일치는 아무것도 안 잡는다", async ({
  page,
}) => {
  await page.goto("/products");
  const partial = page.getByLabel("품명");
  await expect(partial).toHaveCount(1);
  const grabbed = await partial.evaluate((el) => ({
    tag: el.tagName,
    aria: el.getAttribute("aria-label"),
    url: location.pathname,
  }));
  expect(grabbed).toEqual({
    tag: "INPUT",
    aria: "품번·품명 검색",
    url: "/products",
  });
  await expect(page.getByLabel("품명", { exact: true })).toHaveCount(0);
});

/**
 * 품명 칸이 DOM 에 붙은 횟수를 sessionStorage 에 쌓는다. 전체 로드로 문서가 바뀌어도 탭 안에서 이어지게
 * window 가 아니라 sessionStorage 에 둔다(window 에 두면 /login 이 전체 로드일 때 0 으로 리셋돼 거짓 통과)
 */
async function countNameMounts(page: Page) {
  await page.addInitScript(() => {
    const KEY = "qa.nameMounted";
    if (sessionStorage.getItem(KEY) === null) sessionStorage.setItem(KEY, "0");
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (
            n instanceof Element &&
            (n.id === "product-name" || n.querySelector("#product-name"))
          )
            sessionStorage.setItem(
              KEY,
              String(Number(sessionStorage.getItem(KEY)) + 1),
            );
    }).observe(document, { childList: true, subtree: true });
  });
}
const readNameMounts = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("qa.nameMounted"));

test("S1-4 보강 대조 — 세션이 있으면 같은 감시가 품명 칸을 센다(감시가 헛돌지 않는다)", async ({
  page,
}) => {
  await countNameMounts(page);
  await page.goto("/products/new");
  await expect(page.getByLabel("품명", { exact: true })).toBeVisible();
  expect(Number(await readNameMounts(page))).toBeGreaterThanOrEqual(1);
});

test("S1-4 보강 — 세션 없이 /products/new 전체 로드: /login 도착까지 품명 칸이 한 번도 DOM 에 붙지 않는다", async ({
  page,
}) => {
  await page.evaluate(() =>
    sessionStorage.removeItem("ondo.wholesale.session"),
  );
  await countNameMounts(page);
  await page.goto("/products/new");
  await page.waitForURL(/\/login/);
  await expect(
    page.getByText("도매 사장님 로그인", { exact: true }),
  ).toBeVisible();
  expect(await readNameMounts(page)).toBe("0");
});

test("S1-7 패턴 4 흐름 — 저장 본문 name 이 채운 품명이다", async ({ page }) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(page, [jpg("y-fail500once.jpg")]);
  const retry = page.getByRole("button", {
    name: "이미지 1 다시 시도",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await retry.dblclick().catch(() => undefined);
  await expect(registered(page)).toHaveCount(1, DONE);
  await saveButton(page).dblclick();
  await page.waitForURL(/\/products\?productId=\d+/);
  const body = (await lastProductRequest(page)) as { name?: string };
  expect(body.name).toBe("e2e 업로드 상품");
});

const QA_SHOT = (name: string) =>
  `.claude/harness/runs/loop-02-form-remount/qa/${name}.png`;

test("사장 1 — 목록에서 상품 등록을 눌러 뜨자마자 품명을 친다: 2초 뒤 화면 그대로(스크린샷)", async ({
  page,
}) => {
  await page.goto("/products");
  await page.getByRole("link", { name: "상품 등록", exact: true }).click();
  const name = page.getByLabel("품명", { exact: true });
  await expect(name).toBeVisible();
  await name.fill("린넨 셔츠");
  await page.waitForTimeout(2_000);
  await expect(name).toHaveValue("린넨 셔츠");
  await page.screenshot({ path: QA_SHOT("owner1-link-entry-typed") });
});

test("사장 3 — 로그아웃된 탭에서 /products/new 주소로 들어온다: 로그인 화면(스크린샷)", async ({
  page,
}) => {
  await page.evaluate(() =>
    sessionStorage.removeItem("ondo.wholesale.session"),
  );
  await page.goto("/products/new");
  await page.waitForURL(/\/login/);
  // getByText 는 h1 과 Next route announcer(role=alert, 같은 문구)를 둘 다 잡아 strict 위반이 난다
  await expect(
    page.getByRole("heading", { name: "도매 사장님 로그인", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: QA_SHOT("owner3-no-session-login") });
});
