import { expect, test, type Page } from "@playwright/test";
import {
  armFetchGate,
  continueButton,
  enterCreateFromList,
  enterEditFromDetail,
  firstPriceInput,
  here,
  historyFields,
  historyLength,
  installFetchGate,
  leaveButton,
  menuLink,
  nameInput,
  openFetchGate,
  openPopup,
  popstatePaths,
  recordPopstates,
  resetPopstates,
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
  requests,
  watchRequests,
} from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-09 QA — #255 S1 뒤로가기 가드를 개발 spec과 따로 한 번씩 본다(brief-qa 할 것 2).
 * 개발 spec보다 더 보는 것:
 * - 모달이 열릴 때 보초를 다시 넣어도 `history.length`가 그대로인지(중복 0)
 * - "뒤로 한 번"을 popstate 기록 개수로 본다(입력 없음이면 [이전], 보초가 있으면 [폼, 이전])
 * - S1-9 ②를 **같은 URL** 앞 항목으로 만든다(`history.pushState(state, "", 지금 URL)`). `?first=1`로는
 *   대체 이동 취소를 URL 비교로 잘못 짜도 통과한다(09-R3). 시계를 고정하고 1초 밀어 타이머가 정말 지워졌나 본다
 * - 떠난 뒤 끝난 저장(S1-15 ③)은 networkidle 대신 응답 본문 파싱 기록 + 고정 시계 + `router.push` 기록으로 본다
 */

const LIST = "/products";
const NEW = "/products/new";
const A = 1001;
const EDIT_A = `/products/${A}/edit`;
const DETAIL_A = `${LIST}?productId=${A}`;
const SHOTS = ".claude/harness/runs/loop-09-form-back-guard/qa";

async function expectUrl(page: Page, url: string | RegExp) {
  if (typeof url === "string") await expect.poll(() => here(page)).toBe(url);
  else await expect.poll(() => here(page)).toMatch(url);
}

/** `window.next.router`의 push, replace 호출과 `Response.json()` 끝난 URL을 남긴다 */
async function recordRouterAndParse(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { router: [] as string[], parsed: [] as string[] };
    (window as unknown as { __qa: typeof log }).__qa = log;
    const json = Response.prototype.json;
    Response.prototype.json = function (this: Response) {
      const url = this.url;
      return json.call(this).then((v: unknown) => {
        log.parsed.push(url);
        return v;
      });
    };
  });
}

/** 앱이 뜬 뒤 라우터 인스턴스를 감싼다(`useRouter`가 같은 객체를 준다) */
async function spyRouter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      next: { router: Record<string, (...a: unknown[]) => unknown> };
      __qa: { router: string[] };
    };
    for (const name of ["push", "replace"]) {
      const original = w.next.router[name]!.bind(w.next.router);
      w.next.router[name] = (...args: unknown[]) => {
        w.__qa.router.push(`${name} ${String(args[0])}`);
        return original(...args);
      };
    }
  });
}

function qaLog(page: Page): Promise<{ router: string[]; parsed: string[] }> {
  return page.evaluate(
    () =>
      (window as unknown as { __qa: { router: string[]; parsed: string[] } })
        .__qa,
  );
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installFetchGate(page);
  await recordPopstates(page);
  await recordRouterAndParse(page);
  await login(page);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test(`S1-3 ① 보초 state 세 필드, 모달 중 값 그대로, 포커스 계속 작성, 보초 중복 0, 나가기 한 번에 목록`, async ({
      page,
    }) => {
      const dialogs = countDialogs(page);
      await enterCreateFromList(page);
      await fillProductPanel(page);
      await nameInput(page).fill("뒤로 상품");
      await page.getByText("온도 마켓에 함께 게시").click();
      const price = page.getByRole("textbox", {
        name: "블랙 M 판매가",
        includeHidden: true,
      });
      await price.fill("12000");
      await chooseFiles(page, [jpg("a.jpg")]);
      await expect(registered(page)).toHaveCount(1);
      const src = await registered(page).locator("img").getAttribute("src");
      expect(src).toBeTruthy();

      const state = await page.evaluate(() => {
        const s = window.history.state as Record<string, unknown>;
        return {
          keys: Object.keys(s).sort(),
          mark: s.ondoLeaveGuard,
          na: s.__NA,
          treeType: typeof s.__PRIVATE_NEXTJS_INTERNALS_TREE,
          treeNull: s.__PRIVATE_NEXTJS_INTERNALS_TREE === null,
        };
      });
      expect(state).toEqual({
        keys: ["__NA", "__PRIVATE_NEXTJS_INTERNALS_TREE", "ondoLeaveGuard"],
        mark: true,
        na: true,
        treeType: "object",
        treeNull: false,
      });
      const lengthBefore = await historyLength(page);

      await page.goBack();
      await expect(leaveDialog(page)).toBeVisible();
      await expectUrl(page, NEW);
      await expect(nameInput(page)).toHaveValue("뒤로 상품");
      await expect(
        page.getByRole("checkbox", { name: "블랙 M", includeHidden: true }),
      ).toBeChecked();
      await expect(price).toHaveValue("12000");
      await expect(registered(page).locator("img")).toHaveAttribute(
        "src",
        src ?? "",
      );
      await expect(continueButton(page)).toBeFocused();
      // 모달을 열며 보초를 다시 넣어도 길이는 그대로(보초 1칸을 먹고 1칸을 다시 넣음)
      expect(await historyLength(page)).toBe(lengthBefore);
      expect((await historyFields(page)).mark).toBe(true);
      await page.screenshot({
        path: `${SHOTS}/2026-11-08-s1-3-modal-${viewport.width}.png`,
      });

      await continueButton(page).click();
      await expect(leaveDialog(page)).toBeHidden();
      await page.goBack();
      await expect(leaveDialog(page)).toBeVisible();
      await expect(continueButton(page)).toBeFocused();

      await resetPopstates(page);
      await leaveButton(page).click();
      await expectUrl(page, LIST);
      await expect(nameInput(page)).toHaveCount(0);
      expect(await popstatePaths(page)).toEqual([LIST]);
      expect(dialogs.count).toBe(0);
    });
  });
}

test("S1-4 수정: 판매가 변경 → 뒤로 → 모달, 값 그대로 → 나가기 popstate [/products] 한 번에 상세", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  await firstPriceInput(page).fill("15000");
  await page.goBack();
  await expect(leaveDialog(page)).toHaveCount(1);
  await expectUrl(page, EDIT_A);
  await expect(firstPriceInput(page)).toHaveValue("15000");
  await resetPopstates(page);
  await leaveButton(page).click();
  await expectUrl(page, DETAIL_A);
  expect(await popstatePaths(page)).toEqual([LIST]);
});

test.describe("S1-5 모달 중 뒤로, 앞으로", () => {
  test("① 뒤로 모달 중 뒤로 → 모달 1개, 길이 그대로 → 계속 작성 → 뒤로 → 모달", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    const length = await historyLength(page);
    await page.goBack();
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    await expect(leaveDialog(page)).toHaveCount(1);
    await expectUrl(page, NEW);
    await expect(nameInput(page)).toHaveValue("가");
    expect(await historyLength(page)).toBe(length);
    await continueButton(page).click();
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
  });

  test("② 재고 Link 모달 중 뒤로 → 모달 그대로 → 나가기는 재고", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await menuLink(page, "재고").click();
    await expect(leaveDialog(page)).toBeVisible();
    await page.goBack();
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    await expect(leaveDialog(page)).toHaveCount(1);
    await expectUrl(page, NEW);
    await leaveButton(page).click();
    await expectUrl(page, "/inventory");
  });

  test("③ 뒤로 모달 중 앞으로 → 고정 시계 1초 뒤 URL, 모달 1, 품명", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await nameInput(page).fill("가");
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await page.clock.install({ time: T0 });
    await resetPopstates(page);
    await page.goForward();
    await page.clock.runFor(1000);
    await expectUrl(page, NEW);
    await expect(leaveDialog(page)).toHaveCount(1);
    await expect(nameInput(page)).toHaveValue("가");
    expect(await popstatePaths(page)).toEqual([]);
  });
});

test("S1-7 ① 등록 저장 → 목록 → 뒤로 빈 폼 모달 0 → 뒤로 목록 / S1-10 나가기 뒤 앞으로 빈 폼 → 뒤로 목록", async ({
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

  // S1-10: 다시 등록 → 입력 → 뒤로 → 나가기 → 앞으로 → 빈 폼 → 뒤로 → 목록
  await page.getByRole("link", { name: "상품 등록" }).click();
  await nameInput(page).fill("앞으로 상품");
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

test("S1-13 A 변경 → 뒤로 나가기 → B 수정은 B 서버값 → B 변경 → 뒤로 모달 1 → 나가기 B 상세", async ({
  page,
}) => {
  await enterEditFromDetail(page, A);
  const aServer = await firstPriceInput(page).inputValue();
  const aChanged = aServer === "15500" ? "15600" : "15500";
  await firstPriceInput(page).fill(aChanged);
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveButton(page).click();
  await expectUrl(page, DETAIL_A);

  await page.getByText("루즈핏 니트 가디건").first().click();
  await expectUrl(page, `${LIST}?productId=1002`);
  await page.getByRole("link", { name: "상품 관리" }).click();
  await expect(firstPriceInput(page)).toBeVisible();
  await expect(nameInput(page)).toHaveValue(/루즈핏 니트 가디건/);
  const bServer = await firstPriceInput(page).inputValue();
  expect(bServer).not.toBe(aChanged);
  await firstPriceInput(page).fill("24000");
  await page.goBack();
  await expect(leaveDialog(page)).toHaveCount(1);
  await expectUrl(page, "/products/1002/edit");
  await leaveButton(page).click();
  await expectUrl(page, `${LIST}?productId=1002`);
});

test.describe("S1-6 입력 없음 — 뒤로 정확히 한 번", () => {
  test("① 등록 처음부터: 칸을 눌러 보기만 해도 보초 0, popstate 1번에 목록", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await page.goto(LIST);
    await page.getByRole("link", { name: "상품 등록" }).click();
    await expect(nameInput(page)).toBeVisible();
    const entered = await historyLength(page);
    await nameInput(page).click();
    await page.keyboard.press("Tab");
    expect(await historyLength(page)).toBe(entered);
    expect((await historyFields(page)).mark).toBe(false);

    await resetPopstates(page);
    await page.goBack();
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(await popstatePaths(page)).toEqual([LIST]);
    expect(await historyLength(page)).toBe(entered);
    expect(dialogs.count).toBe(0);
  });

  test("② 수정 서버값 그대로: 보초 0, popstate 1번에 상세", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await enterEditFromDetail(page, A);
    const entered = await historyLength(page);
    await firstPriceInput(page).click();
    await page.keyboard.press("Tab");
    expect(await historyLength(page)).toBe(entered);

    await resetPopstates(page);
    await page.goBack();
    await expectUrl(page, DETAIL_A);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(await popstatePaths(page)).toEqual([LIST]);
    expect(dialogs.count).toBe(0);
  });

  test("③ 등록 입력 뒤 다 지움: 뒤로 한 번 → [폼, 목록] 두 popstate로 목록, 모달 0", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await enterCreateFromList(page);
    const entered = await historyLength(page);
    await nameInput(page).fill("가");
    await expect.poll(() => historyLength(page)).toBe(entered + 1);
    await nameInput(page).fill("");

    await resetPopstates(page);
    await page.goBack();
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(await popstatePaths(page)).toEqual([NEW, LIST]);
    expect(dialogs.count).toBe(0);
  });

  test("④ 수정 값 바꿨다 되돌림: 뒤로 한 번에 상세, 모달 0", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await enterEditFromDetail(page, A);
    const original = await firstPriceInput(page).inputValue();
    await firstPriceInput(page).fill("15000");
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    await firstPriceInput(page).fill(original);

    await resetPopstates(page);
    await page.goBack();
    await expectUrl(page, DETAIL_A);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(await popstatePaths(page)).toEqual([EDIT_A, LIST]);
    expect(dialogs.count).toBe(0);
  });
});

test("S1-8 dirty 왕복(입력, 지움, 다시 입력, 다른 칸, 체크) 뒤 history.length +1 정확히", async ({
  page,
}) => {
  await enterCreateFromList(page);
  const before = await historyLength(page);
  await nameInput(page).fill("가");
  await nameInput(page).fill("");
  await nameInput(page).fill("나");
  await nameInput(page).fill("");
  await nameInput(page).fill("다");
  await fillProductPanel(page);
  await page.getByText("온도 마켓에 함께 게시").click();
  await page.getByRole("textbox", { name: "블랙 M 판매가" }).fill("12000");
  await page.getByLabel("게시글 이름").fill("게시글");

  expect(await historyLength(page)).toBe(before + 1);
  expect((await historyFields(page)).mark).toBe(true);
});

test("S1-9 ② 같은 URL 앞 항목(pushState로 만든 진짜 같은 URL) → 나가기 → 고정 시계 1초 뒤 대체 이동 0", async ({
  page,
}) => {
  const tab = await openPopup(page, NEW);
  await expect(nameInput(tab)).toBeVisible();
  expect(await historyLength(tab)).toBe(1);
  // 팝업은 `page`의 init script를 안 받는다 — 같은 문서 안에서 기록기를 직접 단다
  await tab.evaluate(() => {
    const w = window as unknown as {
      __pops: string[];
      __qa: { router: string[]; parsed: string[] };
    };
    w.__pops = [];
    w.__qa = { router: [], parsed: [] };
    window.addEventListener("popstate", () =>
      w.__pops.push(window.location.pathname),
    );
  });
  // 같은 URL 항목 하나 더. Next state를 그대로 복사해 넣는다(`__NA` 있음 → Next가 복사를 건너뛰고 restore 한 번)
  await tab.evaluate(() =>
    window.history.pushState(window.history.state, "", window.location.href),
  );
  expect(await historyLength(tab)).toBe(2);
  await nameInput(tab).fill("두 번째");
  await expect.poll(() => historyLength(tab)).toBe(3);
  await spyRouter(tab);
  await tab.clock.install({ time: T0 });

  await tab.goBack();
  await expect(leaveDialog(tab)).toBeVisible();
  await resetPopstates(tab);
  await leaveButton(tab).click();
  await expect.poll(() => popstatePaths(tab)).toEqual([NEW]);
  await tab.clock.runFor(1000);
  await expectUrl(tab, NEW);
  expect((await qaLog(tab)).router).toEqual([]);
});

test.describe("S1-14 보초 위 새로고침", () => {
  test("AC 경로: 새 문서 빈 폼, 보초 표시 남음, 길이 그대로 → 뒤로 몇 번에 목록인지 기록, 모달 0, beforeunload 1", async ({
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
    await page.evaluate(() => {
      (window as unknown as { __afterReload: boolean }).__afterReload = true;
    });

    await page.goBack();
    // 목록 도착(같은 문서 continue 또는 문서 이동) 또는 같은 URL 빈 폼(다른 문서)에 내려앉을 때까지
    const listLink = page.getByRole("link", { name: "상품 등록" });
    await expect(listLink.or(nameInput(page)).first()).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
    let backs = 1;
    const landedOnList = await expect
      .poll(() => here(page))
      .toBe(LIST)
      .then(
        () => true,
        () => false,
      );
    if (!landedOnList) {
      backs = 2;
      await page.goBack();
    }
    await expectUrl(page, LIST);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(unloadDialogs).toBe(1);
    const sameDocument = await page.evaluate(
      () =>
        (window as unknown as { __afterReload?: boolean }).__afterReload ===
        true,
    );
    test.info().annotations.push({
      type: "S1-14 실측",
      description: `goBack ${backs}번, 목록이 새로고침한 문서와 같은 문서=${sameDocument}`,
    });
  });

  test("더 봄: 새로고침 뒤 다시 입력 → 보초 추가 0 → 뒤로 → 모달 → 나가기 → 목록", async ({
    page,
  }) => {
    page.on("dialog", (dialog) => void dialog.accept());
    await enterCreateFromList(page);
    await nameInput(page).fill("새로고침 전");
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    const before = await historyLength(page);
    await page.reload();
    await expect(nameInput(page)).toHaveValue("");

    await nameInput(page).fill("새로고침 뒤");
    expect(await historyLength(page)).toBe(before);
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue("새로고침 뒤");
    await leaveButton(page).click();
    await expectUrl(page, LIST);
  });
});

test.describe("S1-15 저장 중", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 });
  });

  test("① 수정 저장 중 뒤로 → 1초 뒤 URL, 모달 0, 판매가, 저장 잠김, 길이 그대로 → 문 열기 → 상세", async ({
    page,
  }) => {
    await enterEditFromDetail(page, A);
    await armFetchGate(
      page,
      new RegExp(`/api/wholesale/products/${A}$`),
      "PATCH",
    );
    await firstPriceInput(page).fill("15000");
    await expect.poll(() => historyFields(page)).toMatchObject({ mark: true });
    const length = await historyLength(page);
    await saveButton(page).click();
    await expect(saveButton(page)).toBeDisabled();

    await resetPopstates(page);
    await page.goBack();
    await expect.poll(() => popstatePaths(page)).toEqual([EDIT_A]);
    await page.clock.runFor(1000);
    await expectUrl(page, EDIT_A);
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(firstPriceInput(page)).toHaveValue("15000");
    await expect(saveButton(page)).toBeDisabled();
    expect(await historyLength(page)).toBe(length);

    await openFetchGate(page);
    await expectUrl(page, DETAIL_A);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("② 등록 저장 중 뒤로 → 1초 뒤 모달 0, URL, 품명 → 문 열기 → 목록 새 상품", async ({
    page,
  }) => {
    await enterCreateFromList(page);
    await armFetchGate(page, /\/api\/wholesale\/products$/, "POST");
    await fillProductPanel(page);
    const create = page.getByRole("button", { name: "상품 등록", exact: true });
    await create.click();
    await expect(create).toBeDisabled();

    await resetPopstates(page);
    await page.goBack();
    await expect.poll(() => popstatePaths(page)).toEqual([NEW]);
    await page.clock.runFor(1000);
    await expectUrl(page, NEW);
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(nameInput(page)).toHaveValue("e2e 업로드 상품");

    await openFetchGate(page);
    await expectUrl(page, /^\/products\?productId=\d+$/);
  });

  test("③ 수정 저장 중 재고로 떠남 → 문 열기 → PATCH 본문 파싱 끝 → 시계 1초 → router.push 0, URL 재고", async ({
    page,
  }) => {
    await enterEditFromDetail(page, A);
    const patch = new RegExp(`/api/wholesale/products/${A}$`);
    await armFetchGate(page, patch, "PATCH");
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
        (await requests(page, { path: patch, method: "PATCH" })).map(
          (r) => r.status,
        ),
      )
      .toEqual([200]);
    await expect
      .poll(async () => (await qaLog(page)).parsed.some((u) => patch.test(u)))
      .toBe(true);
    await page.clock.runFor(1000);
    expect((await qaLog(page)).router).toEqual([]);
    await expectUrl(page, "/inventory");
  });

  /*
   * 09-R1 회귀. 변경 없는 수정 폼도 저장을 누르면 보초가 생겨 저장 중 뒤로가기가 hold된다.
   * 고치기 전엔 보초가 없어 상세로 나갔다(QA 실측 popstate ["/products"]).
   */
  test("R1 회귀 — 변경 없이 수정 저장 중 뒤로 → 수정 화면에 머문다 → 문 열기 → 상세", async ({
    page,
  }) => {
    await enterEditFromDetail(page, A);
    await armFetchGate(
      page,
      new RegExp(`/api/wholesale/products/${A}$`),
      "PATCH",
    );
    await saveButton(page).click();
    await expect(saveButton(page)).toBeDisabled();

    await resetPopstates(page);
    await page.goBack();
    await expect.poll(() => popstatePaths(page)).toHaveLength(1);
    await page.clock.runFor(1000);
    expect(here(page)).toBe(EDIT_A);
    await expect(leaveDialog(page)).toHaveCount(0);

    await openFetchGate(page);
    await expectUrl(page, DETAIL_A);
  });
});
