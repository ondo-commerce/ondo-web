import { expect, test, type Page } from "@playwright/test";
import { cancelButton, leaveDialog, login } from "../loop-01-upload/helpers";

/**
 * loop-02-form-remount (#253) — 상품 등록 폼이 진입 직후 입력을 지키는지.
 *
 * loop-01 F9("링크 진입 직후 입력이 지워진다")는 제품 결함이 아니었다. `getByLabel("품명")`이
 * 부분 일치라 폼이 뜨기 전에 목록의 `품번·품명 검색` 칸을 잡아 거기에 글자를 넣고, 나중에 뜬
 * 빈 품명 칸을 읽었다. 그래서 여기서는 전부 **정확 일치**로 칸을 잡고, 재마운트가 없다는 건
 * 값이 아니라 DOM 노드 동일성으로 따로 확인한다(S1-3).
 */

/** 폼의 품명 칸. 목록 검색창(`품번·품명 검색`)과 섞이지 않게 정확 일치 */
function nameInput(page: Page) {
  return page.getByLabel("품명", { exact: true });
}

/** 목록 우측 위 `상품 등록` 링크. Next `Link`라 클라이언트 이동이다 */
function createLink(page: Page) {
  return page.getByRole("link", { name: "상품 등록" });
}

const GUARD_TEXT = "로그인 상태를 확인하고 있어요";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("링크 진입 직후 품명 입력이 남는다", () => {
  test("S1-1 목록 → 상품 등록 링크(클라이언트 이동)로 들어와 바로 입력", async ({
    page,
  }) => {
    await page.goto("/products");
    await createLink(page).click();
    const name = nameInput(page);
    await expect(name).toBeVisible();
    await name.fill("즉시 입력");
    await page.waitForTimeout(2_000);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    await expect(name).toHaveValue("즉시 입력");
  });

  test("S1-2 /products/new 전체 로드로 들어와 바로 입력", async ({ page }) => {
    await page.goto("/products/new");
    const name = nameInput(page);
    await expect(name).toBeVisible();
    await name.fill("즉시 입력");
    await page.waitForTimeout(2_000);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    await expect(name).toHaveValue("즉시 입력");
  });

  test("S1-1b 링크 진입 후 폼이 보이고 1.5초 뒤 입력해도 2.5초 시점까지 남는다", async ({
    page,
  }) => {
    // S1-1 은 입력 직후 2초만 본다. 진입 2초 남짓에 폼이 초기화되는 회귀는 늦게 친 값에서만 드러난다
    await page.goto("/products");
    await createLink(page).click();
    const name = nameInput(page);
    await expect(name).toBeVisible();
    await page.waitForTimeout(1_500);
    await name.fill("늦게 입력");
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe("/products/new");
    await expect(name).toHaveValue("늦게 입력");
  });
});

interface RemountWatch {
  guardAdded: number;
  /** 감시 중 한 번이라도 DOM 에 있었던 품명 input 의 **서로 다른** 노드 수. 재마운트가 없으면 1 */
  inputAdded: number;
  /** 빠진 품명 input 수. `first`와 무관하게 센다 */
  inputRemoved: number;
  /** 기록 순서상 가장 먼저 DOM 에 있었던 품명 input */
  first: Element | null;
}

/**
 * 품명 input 재마운트 감시. MutationRecord 를 **순서대로** 보며 두 방향으로 센다.
 *
 * 1. addedNodes: 하위를 `querySelectorAll`로 본다. React 는 폼을 통째로 붙여서 input 자신은
 *    addedNodes 에 안 나온다. 단 이 조회는 **콜백 시점**의 하위라, 첫 콜백 전에 A 가 B 로
 *    교체됐으면 여기서는 B 만 보인다.
 * 2. removedNodes: 빠진 노드 자신과 하위의 품명 input 을 전부 센다(빠진 노드의 하위는 그대로
 *    남아 있어 콜백 시점에 봐도 정확하다). 한 번도 못 본 input 이 빠졌다면 그건 위 1에서 놓친,
 *    더 먼저 붙어 있던 노드다 — `first`를 그쪽으로 옮겨 `same`도 false 가 되게 한다.
 *
 * 그래서 첫 콜백 전 교체(#253 QA F3 M3)와 같은 태스크 "A 추가 → 제거 → B 추가"(리뷰 F1, M4)가
 * `inputAdded`, `inputRemoved`, `same` 세 값 모두에서 따로 잡힌다.
 */
async function installRemountWatch(page: Page): Promise<void> {
  await page.evaluate((guardText) => {
    const rec: RemountWatch = {
      guardAdded: 0,
      inputAdded: 0,
      inputRemoved: 0,
      first: null,
    };
    (window as unknown as { __remount: RemountWatch }).__remount = rec;
    const seen = new WeakSet<Element>();
    const inputsIn = (n: Node): Element[] => {
      if (!(n instanceof Element)) return [];
      if (n.id === "product-name") return [n];
      return Array.from(n.querySelectorAll("#product-name"));
    };
    /** 처음 보는 노드면 센다. 돌려주는 값은 "처음 봤는가" */
    const note = (input: Element): boolean => {
      if (seen.has(input)) return false;
      seen.add(input);
      rec.inputAdded += 1;
      return true;
    };
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) {
          for (const input of inputsIn(n)) {
            rec.inputRemoved += 1;
            if (note(input)) rec.first = input;
          }
        }
        for (const n of r.addedNodes) {
          if (n.textContent?.includes(guardText)) rec.guardAdded += 1;
          for (const input of inputsIn(n)) {
            if (note(input)) rec.first ??= input;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }, GUARD_TEXT);
}

async function readRemountWatch(page: Page) {
  return page.evaluate(() => {
    const rec = (window as unknown as { __remount: RemountWatch }).__remount;
    return {
      guardAdded: rec.guardAdded,
      inputAdded: rec.inputAdded,
      inputRemoved: rec.inputRemoved,
      same:
        rec.first !== null &&
        rec.first === document.getElementById("product-name"),
    };
  });
}

const NO_REMOUNT = {
  guardAdded: 0,
  inputAdded: 1,
  inputRemoved: 0,
  same: true,
};

test("S1-3 링크 진입 2초 동안 가드 자리표시가 안 끼고 품명 칸이 같은 노드로 남는다", async ({
  page,
}) => {
  await page.goto("/products");
  await expect(createLink(page)).toBeVisible();

  // 클릭 **전에** 단다. 클라이언트 이동이라 window 가 유지돼 기록이 이어진다
  await installRemountWatch(page);
  await createLink(page).click();
  await expect(nameInput(page)).toBeVisible();
  await page.waitForTimeout(2_000);

  expect(await readRemountWatch(page)).toEqual(NO_REMOUNT);
});

test("S1-4 세션을 지우고 /products/new 를 전체 로드하면 /login 으로 가고 폼은 안 보인다", async ({
  page,
}) => {
  await page.evaluate(() =>
    sessionStorage.removeItem("ondo.wholesale.session"),
  );
  await page.goto("/products/new");
  await page.waitForURL(/\/login/);
  await expect(nameInput(page)).toHaveCount(0);
});

test("S1-6 링크 진입 → 품명 입력 → 취소 → 계속 작성하면 값이 그대로", async ({
  page,
}) => {
  await page.goto("/products");
  await createLink(page).click();
  const name = nameInput(page);
  await expect(name).toBeVisible();
  await name.fill("계속 작성 확인");

  await cancelButton(page).click();
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "계속 작성" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(name).toHaveValue("계속 작성 확인");
});
