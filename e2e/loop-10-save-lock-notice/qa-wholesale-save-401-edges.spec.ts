import { expect, test, type Page } from "@playwright/test";
import {
  formLine,
  HOOK,
  installGetFault,
  listenSessionBroadcast,
  nameInput,
  reloginInSecondTab,
  reloginLink,
  restoredStatus,
  SESSION_LOST,
  SESSION_LOST_PARTIAL,
  waitSessionBroadcast,
} from "./helpers";
import { pinnedPriceInput, T0 } from "../loop-09-form-back-guard/helpers";
import {
  countDialogs,
  watchRequests,
} from "../loop-03-upload-lifecycle/helpers";
import {
  addSlot,
  chooseFiles,
  fieldError,
  fillPostPanel,
  fillProductPanel,
  jpg,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  statusRadio,
} from "../loop-01-upload/helpers";

/**
 * loop-10 QA — #404 저장 401 잠금을 개발 spec과 다른 장면으로 본다(brief-qa 할 것 2-6, 2-7, 5).
 * - 403, 400, 삭제 401이 기존 그대로인가(브리프 규칙 6 범위 밖 확장 금지 검사)
 * - 1280x800 폭에서 잠금 세 갈래 스크린샷과 접근성 트리(alert, status). 낭독은 이걸로 대신한다
 * - S2-6 ④ AC 수정(D66, 판매가 → 품명)의 전제("시즌 종료를 고르면 가격표가 잠긴다")가 저장과 무관한
 *   기존 동작인가. 칸이 실제로 있고 disabled인지를 본다
 *
 * 목은 저장에 403을, 삭제에 401을 주는 손잡이가 없다. 그래서 페이지 `fetch`를 감싸 한 번만 그 봉투를
 * 돌려준다(loop-10 `installGetFault`와 같은 꼴, 첫 `goto` 전에 설치).
 */

/** 스크린샷은 시험 산출물 폴더로. 레포 안 경로에 쓰지 않는다 */
function shot(name: string): string {
  return test.info().outputPath(name);
}

const NOT_APPROVED_TEXT = "승인된 계정만 사용할 수 있습니다.";

interface StatusFault {
  source: string | null;
  method: string | null;
  status: number;
  code: string;
  message: string;
  hits: number;
}

async function installStatusFault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fault: StatusFault = {
      source: null,
      method: null,
      status: 0,
      code: "",
      message: "",
      hits: 0,
    };
    (window as unknown as { __statusFault: StatusFault }).__statusFault = fault;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (
        fault.source !== null &&
        method === fault.method &&
        new RegExp(fault.source).test(url)
      ) {
        // 한 번만. 두 번째부터는 목이 답한다
        fault.source = null;
        fault.hits += 1;
        return new Response(
          JSON.stringify({
            code: fault.code,
            message: fault.message,
            errors: [],
            traceId: "e2e-qa",
          }),
          {
            status: fault.status,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return original(input, init);
    };
  });
}

async function armStatusFault(
  page: Page,
  path: RegExp,
  method: string,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  await page.evaluate(
    ([source, m, s, c, msg]) => {
      Object.assign(
        (window as unknown as { __statusFault: StatusFault }).__statusFault,
        { source, method: m, status: s, code: c, message: msg },
      );
    },
    [path.source, method, status, code, message] as const,
  );
}

function statusFaultHits(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __statusFault: StatusFault }).__statusFault.hits,
  );
}

test.describe("기존 그대로(403, 400, 삭제 401)", () => {
  test.beforeEach(async ({ page }) => {
    await installStatusFault(page);
    await watchRequests(page);
    await login(page);
  });

  test("수정 PATCH 403 NOT_APPROVED → _form 서버 문구, 잠금 0, 저장 켜짐, URL 그대로", async ({
    page,
  }) => {
    const dialogs = countDialogs(page);
    await openEdit(page, 1002);
    await page.clock.install({ time: T0 });
    await nameInput(page).fill(`${await nameInput(page).inputValue()} 403`);
    await armStatusFault(
      page,
      /\/products\/1002$/,
      "PATCH",
      403,
      "NOT_APPROVED",
      NOT_APPROVED_TEXT,
    );
    await saveButton(page).click();
    await expect(formLine(page)).toHaveText(NOT_APPROVED_TEXT);
    expect(await statusFaultHits(page)).toBe(1);
    // 저장 401 표식(10:)도 업로드 잠금 표식도 없다
    expect(await formLine(page).getAttribute("data-ac")).toBeNull();
    await expect(reloginLink(page)).toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    await expect(addSlot(page)).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe("/products/1002/edit");
    expect(dialogs.count).toBe(0);
  });

  test("수정 PATCH 400 [fail400once] → 칸 오류, 잠금 0, 저장 켜짐", async ({
    page,
  }) => {
    await openEdit(page, 1002);
    await page.clock.install({ time: T0 });
    const title = page.getByLabel("게시글 이름", { exact: true });
    await title.fill(`${await title.inputValue()} [fail400once]`);
    await saveButton(page).click();
    await expect(fieldError(page, "listing.title")).toBeVisible();
    await expect(formLine(page)).toHaveCount(0);
    await expect(reloginLink(page)).toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe("/products/1002/edit");
  });

  test("상품 삭제 401 → 기존 그대로 전역 이동 /login", async ({ page }) => {
    await openEdit(page, 1002);
    await page.clock.install({ time: T0 });
    await armStatusFault(
      page,
      /\/products\/1002$/,
      "DELETE",
      401,
      "UNAUTHENTICATED",
      "로그인이 필요합니다.",
    );
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("button", { name: "삭제하기", exact: true }).click();
    await page.waitForURL(/\/login/);
    expect(await page.evaluate(() => location.pathname)).toBe("/login");
  });
});

test.describe("1280x800 잠금 화면과 접근성 트리", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await installGetFault(page);
    await watchRequests(page);
    await login(page);
  });

  test("등록 저장 401 잠금 → alert 트리, 링크 → 풀림 status 트리", async ({
    page,
  }) => {
    await openCreateWithPost(page);
    await fillProductPanel(page);
    await fillPostPanel(page);
    await chooseFiles(page, [jpg("a.jpg")]);
    await expect(registered(page)).toHaveCount(1);
    await nameInput(page).fill(`니트 ${HOOK}`);
    // 시계는 도착 뒤에 깐다(loop-09 02-dev-255 §4 2)
    await page.clock.install({ time: T0 });
    await saveButton(page).click();
    await expect(formLine(page)).toHaveText(SESSION_LOST);
    await expect(formLine(page)).toMatchAriaSnapshot(
      `- alert: "${SESSION_LOST}"`,
    );
    // 저장 버튼이 잠금 문구를 설명으로 가리킨다(DD10)
    const describedBy = await saveButton(page).getAttribute("aria-describedby");
    const lineId = await formLine(page).getAttribute("id");
    expect(describedBy?.split(" ")).toContain(lineId);
    await expect(saveButton(page)).toBeDisabled();
    await expect(addSlot(page)).toBeDisabled();
    await page.screenshot({ path: shot("create-lock-1280.png") });

    await listenSessionBroadcast(page);
    await reloginInSecondTab(page);
    await waitSessionBroadcast(page);
    await expect(restoredStatus(page)).toMatchAriaSnapshot(
      `- status: "다시 로그인했어요. 이어서 저장할 수 있어요."`,
    );
    await expect(saveButton(page)).toBeEnabled();
    await page.screenshot({ path: shot("create-restored-1280.png") });
  });

  // 수정 PATCH 401 세 입구 잠금은 개발 spec `S2-5`와 같은 장면이라 두지 않는다(09 배운 것 8)

  test("반쯤 저장 잠금 문구가 1280 폭 하단 바에서 잘리지 않는다", async ({
    page,
  }) => {
    await openEdit(page, 1001);
    await page.clock.install({ time: T0 });
    const title = page.getByLabel("게시글 이름", { exact: true });
    await title.fill(`${await title.inputValue()} ${HOOK}`);
    await statusRadio(page, "시즌 종료").click();
    await saveButton(page).click();
    await expect(formLine(page)).toHaveText(SESSION_LOST_PARTIAL);
    await expect(formLine(page)).toMatchAriaSnapshot(
      `- alert: "${SESSION_LOST_PARTIAL}"`,
    );
    // 글자가 상자 밖으로 넘치지 않고(가로 잘림 0) 링크와 저장 버튼이 화면 안에 있다
    const overflow = await formLine(page).evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(reloginLink(page)).toBeInViewport();
    await expect(saveButton(page)).toBeInViewport();
    await page.screenshot({ path: shot("edit-partial-lock-1280.png") });
  });
});

test.describe("S2-6 ④ AC 수정(D66)의 전제", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("시즌 종료를 고르기만 해도(저장 전) 판매가 칸이 disabled — 칸은 실제로 있다", async ({
    page,
  }) => {
    await openEdit(page, 1001);
    const price = await pinnedPriceInput(page);
    await expect(price).toHaveCount(1);
    await expect(price).toBeEnabled();
    await page.clock.install({ time: T0 });
    await statusRadio(page, "시즌 종료").click();
    await expect(price).toBeDisabled();
    // 칸 자신의 `disabled`가 아니라 감싼 `fieldset disabled`가 잠근다(PostFormPanel.tsx:160, 이번 diff 밖)
    const caught = await price.evaluate((el) => ({
      tag: el.tagName,
      label: el.getAttribute("aria-label"),
      matchesDisabled: el.matches(":disabled"),
      fieldsetDisabled: el.closest("fieldset")?.disabled ?? false,
    }));
    expect(caught.tag).toBe("INPUT");
    expect(caught.label).toMatch(/ 판매가$/);
    expect(caught.matchesDisabled).toBe(true);
    expect(caught.fieldsetDisabled).toBe(true);
  });
});
