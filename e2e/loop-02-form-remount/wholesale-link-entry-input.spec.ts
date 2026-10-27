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
  /** 붙은 품명 input 수. 재마운트가 없으면 1 */
  inputAdded: number;
  inputRemoved: number;
  first: Element | null;
}

/**
 * 품명 input 재마운트 감시. 기록을 **순서대로** 보며 addedNodes 하위에서 처음 붙은 input 을
 * 잡고, 그 뒤의 제거와 새 input 추가를 센다. 콜백 끝에 `getElementById`로 잡으면 한 태스크
 * 안의 "A 추가 → A 제거 → B 추가"가 B 를 처음 것으로 착각해 거짓 통과한다(#253 리뷰 F1).
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
    const inputsIn = (n: Node): Element[] => {
      if (!(n instanceof Element)) return [];
      if (n.id === "product-name") return [n];
      return Array.from(n.querySelectorAll("#product-name"));
    };
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) {
          if (rec.first && (n === rec.first || n.contains(rec.first)))
            rec.inputRemoved += 1;
        }
        for (const n of r.addedNodes) {
          if (n.textContent?.includes(guardText)) rec.guardAdded += 1;
          for (const input of inputsIn(n)) {
            rec.inputAdded += 1;
            rec.first ??= input;
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
