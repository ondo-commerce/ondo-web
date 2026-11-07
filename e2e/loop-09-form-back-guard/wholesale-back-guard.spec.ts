import { expect, test, type Page } from "@playwright/test";
import {
  continueButton,
  enterCreateFromList,
  enterEditFromDetail,
  firstPriceInput,
  here,
  historyFields,
  historyLength,
  leaveButton,
  menuLink,
  nameInput,
  openPopup,
  pinnedPriceInput,
  popstatePaths,
  readSession,
  recordPopstates,
  resetPopstates,
  seedSession,
  T0,
} from "./helpers";
import {
  chooseFiles,
  fillProductPanel,
  jpg,
  leaveDialog,
  login,
  registered,
  saveButton,
} from "../loop-01-upload/helpers";
import {
  countDialogs,
  FAILURE_TEXT,
  uploadAbortStats,
  waitUploadsStarted,
  watchRequests,
} from "../loop-03-upload-lifecycle/helpers";

/**
 * #255 S1 — 상품 폼 브라우저 뒤로가기 이탈 가드(기획 §4-2 정책표).
 * 뒤로가기, 앞으로가기 뒤에는 URL, 모달, 입력값을 각각 기다린다 — `goBack()` 반환만으로
 * 가드가 판정을 끝냈다고 보지 않는다. "이동 0"은 흐르는 페이지 시계를 1초 민 뒤 URL로 본다.
 */

const LIST = "/products";
const NEW = "/products/new";
const A = 1001;
const B = 1002;
/** 목 시드 1002의 판매가(`packages/api/src/mocks/wholesale/product.ts` variant 3006, 3007) */
const B_SEED_PRICE = "23000";

async function expectUrl(page: Page, url: string) {
  await expect.poll(() => here(page)).toBe(url);
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await recordPopstates(page);
  await login(page);
});

test.describe("S1-3 (B2 등록) 뒤로가기 → 모달 → 나가기", () => {
  test("① 입력, 옵션, 판매가, 이미지 1장 → 보초 state 세 필드 → 모달에서 계속 작성 → 다시 뒤로 → 나가기는 목록 한 번에", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await enterCreateFromList(page);
    await fillProductPanel(page);
    await nameInput(page).fill("뒤로 상품");
    await page.getByText("온도 마켓에 함께 게시").click();
    // 모달이 열리면 radix가 바깥을 aria-hidden으로 숨긴다 — role 단언은 includeHidden
    const price = page.getByRole("textbox", {
      name: "블랙 M 판매가",
      includeHidden: true,
    });
    await price.fill("12000");
    await chooseFiles(page, [jpg("a.jpg")]);
    await expect(registered(page)).toHaveCount(1);
    const src = await registered(page).locator("img").getAttribute("src");
    const priceValue = await price.inputValue();

    expect(await historyFields(page)).toEqual({
      mark: true,
      na: true,
      tree: true,
    });

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await expectUrl(page, NEW);
    await expect(nameInput(page)).toHaveValue("뒤로 상품");
    await expect(
      page.getByRole("checkbox", { name: "블랙 M", includeHidden: true }),
    ).toBeChecked();
    await expect(price).toHaveValue(priceValue);
    await expect(registered(page).locator("img")).toHaveAttribute(
      "src",
      src ?? "",
    );
    await expect(continueButton(page)).toBeFocused();

    await continueButton(page).click();
    await expect(leaveDialog(page)).toBeHidden();
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await expectUrl(page, NEW);

    await resetPopstates(page);
    await leaveButton(page).click();
    await expectUrl(page, LIST);
    await expect(nameInput(page)).toHaveCount(0);
    expect(dialogs.count).toBe(0);
    expect(await popstatePaths(page)).toEqual([LIST]);
  });

  test("② 입력 없이 slow5s 업로드 중 뒤로 → 모달 → 나가기: abort 1, 실패 문구 0", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await page.getByText("온도 마켓에 함께 게시").click();
    await chooseFiles(page, [jpg("slow5s.jpg")]);
    await waitUploadsStarted(page, 1);

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await expectUrl(page, NEW);
    await leaveButton(page).click();
    await expectUrl(page, LIST);

    await expect
      .poll(() => uploadAbortStats(page))
      .toMatchObject({
        aborted: 1,
      });
    await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
  });
});

test("S1-4 (B2 수정) 상세 → 상품 관리 → 판매가 변경 → 뒤로 → 모달 → 나가기는 들어오기 전 상세", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await firstPriceInput(page).fill("15000");
  const changed = await firstPriceInput(page).inputValue();

  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await expectUrl(page, `/products/${A}/edit`);
  await expect(firstPriceInput(page)).toHaveValue(changed);

  await leaveButton(page).click();
  await expectUrl(page, `${LIST}?productId=${A}`);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test.describe("S1-5 모달이 열린 채 뒤로, 앞으로", () => {
  test("① 뒤로가기 모달 중 뒤로 → 모달 그대로 → 계속 작성 → 뒤로 → 또 모달", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();

    await page.goBack();
    await expect(leaveDialog(page)).toHaveCount(1);
    await expectUrl(page, NEW);
    await expect(nameInput(page)).toHaveValue("가");

    await continueButton(page).click();
    await expect(leaveDialog(page)).toBeHidden();
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await expectUrl(page, NEW);
  });

  test("② 재고 Link 모달 중 뒤로 → 모달 그대로 → 나가기는 재고", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();

    await page.goBack();
    await expect(leaveDialog(page)).toHaveCount(1);
    await expectUrl(page, NEW);
    await expect(nameInput(page)).toHaveValue("가");

    await leaveButton(page).click();
    await page.waitForURL((url) => url.pathname === "/inventory");
  });

  test("③ 뒤로가기 모달 중 앞으로 → 1초 뒤 URL, 모달, 품명 그대로", async ({
    page,
  }) => {
    await page.clock.install({ time: T0 });
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();

    await page.goForward();
    await page.clock.runFor(1000);
    await expectUrl(page, NEW);
    await expect(leaveDialog(page)).toHaveCount(1);
    await expect(nameInput(page)).toHaveValue("가");
  });
});

test.describe("S1-6 (B3) 입력 없음이면 뒤로 한 번에 이전 화면", () => {
  test("① 등록 처음부터: 보초 0, 뒤로 한 번에 목록", async ({ page }) => {
    const dialogs = countDialogs(page);
    await page.goto(LIST);
    const before = await historyLength(page);
    await page.getByRole("link", { name: "상품 등록" }).click();
    await expect(nameInput(page)).toBeVisible();
    expect(await historyLength(page)).toBe(before + 1);

    await page.goBack();
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });

  test("② 수정 서버값 그대로: 보초 0, 뒤로 한 번에 상세", async ({ page }) => {
    const dialogs = countDialogs(page);
    await page.goto(`${LIST}?productId=${A}`);
    const before = await historyLength(page);
    await page.getByRole("link", { name: "상품 관리" }).click();
    await expect(firstPriceInput(page)).toBeVisible();
    expect(await historyLength(page)).toBe(before + 1);

    await page.goBack();
    await expectUrl(page, `${LIST}?productId=${A}`);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });

  test("③ 등록 입력했다 다 지움: 뒤로 한 번에 목록", async ({ page }) => {
    const dialogs = countDialogs(page);
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    await nameInput(page).fill("");

    await page.goBack();
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });

  test("④ 수정 값 바꿨다 되돌림: 뒤로 한 번에 상세", async ({ page }) => {
    const dialogs = countDialogs(page);
    await enterEditFromDetail(page, A);
    const original = await firstPriceInput(page).inputValue();
    await firstPriceInput(page).fill("15000");
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    await firstPriceInput(page).fill(original);

    await page.goBack();
    await expectUrl(page, `${LIST}?productId=${A}`);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(dialogs.count).toBe(0);
  });
});

test.describe("S1-7 (B4) 저장 뒤 남는 보초", () => {
  test("① 등록 저장 → 목록 → 뒤로는 빈 폼, 모달 0 → 뒤로는 목록", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await fillProductPanel(page);
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    await page.waitForURL(/\/products\?productId=\d+/);

    await page.goBack();
    await expectUrl(page, NEW);
    await expect(nameInput(page)).toHaveValue("");
    await expect(leaveDialog(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  /*
   * 기획 원문은 판매가를 바꿔 "저장한 새 값"을 본다. 목 PATCH는 `variantId`로 온 판매가를
   * 반영하지 않아(색, 사이즈로만 찾는다) 다시 열면 옛 값이다 — 목 결함이라 이 시험은 서버가
   * 반영하는 품명으로 보고, 원문은 아래 `test.fail`로 남긴다(02-dev §4, §6).
   */
  test("② 수정(품명) 저장 → 상세 → 뒤로는 새 값 폼, 모달 0 → 뒤로는 들어오기 전 상세", async ({
    page,
  }) => {
    await enterEditFromDetail(page, A);
    await nameInput(page).fill("뒤로 저장 품명");
    await saveButton(page).click();
    await page.waitForURL(/\/products\?productId=1001$/);
    await expect(firstPriceInput(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, `/products/${A}/edit`);
    await expect(nameInput(page)).toHaveValue("뒤로 저장 품명");
    await expect(leaveDialog(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, `${LIST}?productId=${A}`);
    await expect(firstPriceInput(page)).toHaveCount(0);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  /*
   * 준비(저장, 이동, 뒤로, 모달 0)는 일반 단언이다. 예상 실패는 마지막 판매가 한 줄뿐(09-R2) —
   * 준비가 깨지면 `test.fail()`에 닿기 전에 보통 실패로 드러난다. 다음 뒤로가기 목적지는 아래
   * "이동 순서" 시험이 같은 판매가 경로로 본다. 09-N1(목 PATCH)을 고치면 `test.fail` 줄을 지운다.
   */
  test("② 원문 — 판매가 저장 뒤 뒤로가기 폼이 새 판매가", async ({ page }) => {
    await enterEditFromDetail(page, A);
    const price = await pinnedPriceInput(page);
    await price.fill("15500");
    await saveButton(page).click();
    await page.waitForURL(/\/products\?productId=1001$/);
    await expect(firstPriceInput(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, `/products/${A}/edit`);
    await expect(price).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);

    test.fail(true, "09-N1 목 PATCH가 variantId 판매가를 반영 안 함");
    await expect(price).toHaveValue("15500", { timeout: 3000 });
  });

  test("② 이동 순서 — 판매가 저장도 URL 순서와 모달 0은 같다", async ({
    page,
  }) => {
    await enterEditFromDetail(page, A);
    const price = await pinnedPriceInput(page);
    await price.fill("15500");
    await saveButton(page).click();
    await page.waitForURL(/\/products\?productId=1001$/);
    await expect(firstPriceInput(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, `/products/${A}/edit`);
    await expect(price).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);

    await page.goBack();
    await expectUrl(page, `${LIST}?productId=${A}`);
    await expect(firstPriceInput(page)).toHaveCount(0);
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});

test("S1-8 (⑥) 입력, 지움, 다시 입력, 다른 칸 입력 → history.length +1, 보초 표시", async ({
  page,
}) => {
  await enterCreateFromList(page);
  const before = await historyLength(page);
  await nameInput(page).fill("가");
  await nameInput(page).fill("");
  await nameInput(page).fill("나");
  await fillProductPanel(page);
  await page.getByText("온도 마켓에 함께 게시").click();
  await page.getByRole("textbox", { name: "블랙 M 판매가" }).fill("12000");

  expect(await historyLength(page)).toBe(before + 1);
  expect((await historyFields(page)).mark).toBe(true);
});

test.describe("S1-9 (⑨) 앞 이력 없는 새 탭", () => {
  test("① window.open 새 창의 첫 항목 /products/new → 입력 → 뒤로 → 모달 → 나가기 → 2초 안에 목록", async ({
    page,
  }) => {
    const tab = await openPopup(page, NEW);
    await expect(nameInput(tab)).toBeVisible();
    expect(await historyLength(tab)).toBe(1);
    await nameInput(tab).fill("새 탭");
    await expect.poll(() => historyFields(tab)).toMatchObject({ mark: true });

    await tab.goBack();
    await expect(leaveDialog(tab)).toBeVisible();
    await leaveButton(tab).click();
    await expect.poll(() => here(tab), { timeout: 2000 }).toBe(LIST);
  });

  /*
   * 기획 원문(① 세션을 심은 `context.newPage()`)은 첫 `about:blank` 항목이 남아 `go(-2)`가
   * 빈 페이지로 간다. "앞 이력 없음"을 못 만드는 조건이라 위 시험은 `window.open`으로 바꿨고,
   * 원문은 지금 못 맞는다는 기록으로 남긴다(02-dev §4).
   */
  test("① 원문 — context.newPage() 첫 항목에서 나가기 → 2초 안에 목록", async ({
    page,
    context,
  }) => {
    const session = await readSession(page);
    const tab = await context.newPage();
    await seedSession(tab, session);
    await tab.goto(NEW);
    await expect(nameInput(tab)).toBeVisible();
    await nameInput(tab).fill("새 탭");
    await expect.poll(() => historyFields(tab)).toMatchObject({ mark: true });

    await tab.goBack();
    await expect(leaveDialog(tab)).toBeVisible();
    await leaveButton(tab).click();

    // 예상 실패는 도착지 한 줄(09-R2). newPage의 about:blank 항목으로 간다
    test.fail(true, "context.newPage()는 첫 about:blank 항목이 남는다");
    await expect.poll(() => here(tab), { timeout: 2000 }).toBe(LIST);
  });

  /*
   * 기획 원문은 `page.goto("/products/new")`로 같은 URL 항목을 하나 더 만든다. HTML 표준은 지금
   * URL과 같은 곳으로의 이동을 replace로 바꿔 항목이 안 생긴다(`history.length` 1 그대로, 실행
   * 확인). 그래서 pathname이 같고 query만 다른 앞 항목으로 본다 — pathname 비교 구현이면 여기서
   * 틀린다. 원문은 아래 `test.fail`(02-dev §4).
   */
  test("② 같은 pathname 앞 항목이 있으면 그 항목(빈 폼)에 머물고 1초 뒤에도 대체 이동 0", async ({
    page,
  }) => {
    /*
     * 시계는 도착한 뒤에 깐다. 처음부터 깔면 다른 문서로 돌아가는 traverse 뒤 새 문서가 안
     * 그려졌다(첫 실행 빈 화면). `go(-2)` 대체 타이머는 떠난 문서 것이라 도착 뒤 시계와 무관하다.
     */
    const tab = await openPopup(page, `${NEW}?first=1`);
    await expect(nameInput(tab)).toBeVisible();
    await tab.goto(NEW);
    await expect(nameInput(tab)).toBeVisible();
    expect(await historyLength(tab)).toBe(2);
    await nameInput(tab).fill("두 번째");
    await expect.poll(() => historyFields(tab)).toMatchObject({ mark: true });

    await tab.goBack();
    await expect(leaveDialog(tab)).toBeVisible();
    await leaveButton(tab).click();
    await expectUrl(tab, `${NEW}?first=1`);
    await expect(nameInput(tab)).toHaveValue("");
    await tab.clock.install({ time: T0 });
    await tab.clock.runFor(1000);
    await expectUrl(tab, `${NEW}?first=1`);
    await expect(nameInput(tab)).toHaveValue("");
  });

  test("② 원문 — 같은 URL을 두 번 연 이력", async ({ page }) => {
    const tab = await openPopup(page, NEW);
    await expect(nameInput(tab)).toBeVisible();
    await tab.goto(NEW);
    await expect(nameInput(tab)).toBeVisible();
    // 예상 실패는 이력 길이 한 줄(09-R2). 같은 URL 이동은 replace라 1이다. 아래는 원문 그대로
    test.fail(true, "HTML 표준이 같은 URL 이동을 replace로 바꾼다");
    expect(await historyLength(tab)).toBe(2);
    await nameInput(tab).fill("두 번째");
    await expect.poll(() => historyFields(tab)).toMatchObject({ mark: true });

    await tab.goBack();
    await expect(leaveDialog(tab)).toBeVisible();
    await leaveButton(tab).click();
    await expect(nameInput(tab)).toHaveValue("");
    await expectUrl(tab, NEW);
    await tab.clock.install({ time: T0 });
    await tab.clock.runFor(1000);
    await expectUrl(tab, NEW);
    await expect(nameInput(tab)).toHaveValue("");
  });
});

test("S1-10 (④) 나가기 뒤 앞으로 → 빈 폼, 모달 0 → 뒤로 → 목록", async ({
  page,
}) => {
  await enterCreateFromList(page);
  await nameInput(page).fill("뒤로 상품");
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await expectUrl(page, LIST);

  await page.goForward();
  await expectUrl(page, NEW);
  await expect(nameInput(page)).toHaveValue("");
  await expect(leaveDialog(page)).toHaveCount(0);

  await page.goBack();
  await expectUrl(page, LIST);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("S1-13 A 수정 → 뒤로 나가기 → 목록에서 B → B 서버값 → B 변경 → 뒤로 모달 → 나가기", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await firstPriceInput(page).fill("15000");
  const aValue = await firstPriceInput(page).inputValue();
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await expectUrl(page, `${LIST}?productId=${A}`);

  await page.getByText("루즈핏 니트 가디건").first().click();
  await expectUrl(page, `${LIST}?productId=${B}`);
  await page.getByRole("link", { name: "상품 관리" }).click();
  await page.waitForURL((url) => url.pathname === `/products/${B}/edit`);
  // B 서버값은 시드(목 1002 판매가 23000)와 따로 맞춘다 — 화면 값끼리 비교하면 빈칸도 통과(09-M5)
  await expect(firstPriceInput(page)).toHaveValue(B_SEED_PRICE);
  expect(B_SEED_PRICE).not.toBe(aValue);
  await expect(nameInput(page)).toHaveValue(/루즈핏 니트 가디건/);

  await firstPriceInput(page).fill("24000");
  await page.goBack();
  await expect(leaveDialog(page)).toHaveCount(1);
  await expectUrl(page, `/products/${B}/edit`);
  await leaveButton(page).click();
  await expectUrl(page, `${LIST}?productId=${B}`);
});

test("S1-14 (⑪) 보초 위 새로고침 → 빈 폼, 보초 중복 0 → 뒤로 2번 안에 목록, 모달 0", async ({
  page,
}) => {
  let unloadDialogs = 0;
  page.on("dialog", (dialog) => {
    unloadDialogs += 1;
    void dialog.accept();
  });
  await enterCreateFromList(page);
  await nameInput(page).fill("새로고침 전");
  await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
  const before = await historyLength(page);

  await page.reload();
  await expect(nameInput(page)).toHaveValue("");
  expect((await historyFields(page)).mark).toBe(true);
  expect(await historyLength(page)).toBe(before);

  /*
   * 보초 아래 항목은 새로고침 전 문서의 것이라 같은 URL 빈 폼을 한 번 거칠지는 브라우저 몫이다.
   * 뒤로 한 번마다 "목록이거나 빈 폼"이 그려질 때까지 기다린 뒤 다음을 정한다.
   */
  const listOrForm = page
    .getByRole("link", { name: "상품 등록" })
    .or(nameInput(page));
  let backs = 0;
  while (backs < 2 && here(page) !== LIST) {
    backs += 1;
    await page.goBack();
    await expect(listOrForm.first()).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
  }
  await expectUrl(page, LIST);
  expect(unloadDialogs).toBe(1);
  test.info().annotations.push({
    type: "S1-14 goBack 횟수",
    description: String(backs),
  });
});
