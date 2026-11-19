import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  collectConsoleErrors,
  countDialogs,
  FAILURE_TEXT,
  requests,
  uploadAbortStats,
  waitUploadsStarted,
  watchRequests,
} from "./helpers";
import {
  addSlot,
  cancelButton,
  chooseFiles,
  jpg,
  leaveDialog,
  login,
  openCreateWithPost,
  openEdit,
  registered,
  saveButton,
  slotsIn,
} from "../loop-01-upload/helpers";

/**
 * loop-03-upload-lifecycle QA. 개발 spec 이 안 본 것만 둔다. 다음 회차가 그대로 돌린다.
 * 1) 사장 시나리오 (a)~(d) — 스크린샷과 잡은 요소 증거(규칙 8)를 `runs/<slug>/qa/` 에 남긴다
 * 2) 반복 패턴 3·4 — 401 뒤 왕복(함께 게시 해제→재체크), 업로드 중 잠금 이유 문구
 * 3) 키보드 Enter 로 연 Link 도 가드되는가, 수정 화면에서 "업로드만" 진행 중이어도 가드되는가
 * 4) 디자인 audit — 401 문구 색이 `--color-destructive-strong` 토큰과 같은가
 * 텍스트 locator 는 `exact: true` 가 기본이다(#253).
 */
const RUN_DIR = ".claude/harness/runs/loop-03-upload-lifecycle/qa";
const QA_SHOT = (name: string) => `${RUN_DIR}/${name}.png`;
const SESSION_LOST =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";

/** 잡은 요소를 파일로 남긴다 — 결함 재현 때 locator 가 무엇을 잡았는지가 증거다 */
function saveEvidence(name: string, data: unknown) {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(`${RUN_DIR}/${name}.json`, JSON.stringify(data, null, 2));
}

function describeEl(locator: Locator) {
  return locator.evaluate((el) => ({
    tag: el.tagName,
    id: el.id || null,
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
    text: (el.textContent ?? "").trim().slice(0, 80),
    url: location.pathname,
  }));
}

function nameInput(page: Page) {
  return page.getByLabel("품명", { exact: true });
}

function menuLink(page: Page, label: string) {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: label, exact: true });
}

function sessionAlert(page: Page) {
  return page.locator('p[role="alert"][data-ac="S4-3 S4-7"]');
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await login(page);
});

test("사장 (a) — 사진 2장 올리다 재고 메뉴 → 나가기: 재고 화면에 오류 문구·콘솔 error 없음", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-qa1.jpg"), jpg("slow5s-qa2.jpg")]);
  await waitUploadsStarted(page, 2);
  await expect(slotsIn(page, "uploading")).toHaveCount(2);

  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await page.screenshot({ path: QA_SHOT("a-upload-menu-modal") });
  await leaveDialog(page)
    .getByRole("button", { name: "나가기", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/inventory");

  await expect
    .poll(() => uploadAbortStats(page))
    .toEqual({ aborted: 2, rejected: 2 });
  await page.waitForTimeout(5_500);
  // 재고 화면에 뜬 alert 는 전부 증거로 남긴다. 업로드 실패 문구가 섞이면 안 된다
  const alerts = await page
    .locator('[role="alert"]')
    .evaluateAll((list) =>
      list
        // Next 의 route announcer(shadow DOM, "재고 관리 · 온도 ERP")는 화면 문구가 아니다
        .filter((e) => e.getRootNode() === document)
        .map((e) => (e.textContent ?? "").trim()),
    );
  saveEvidence("a-inventory-alerts", { alerts, consoleErrors });
  await page.screenshot({ path: QA_SHOT("a-inventory-after-5s") });
  expect(alerts.filter((t) => t.length > 0)).toEqual([]);
  await expect(page.getByText(FAILURE_TEXT)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("사장 (b) — 1장 등록 뒤 401: 등록 1장 남고 저장·+ 잠김, 이유를 aria-describedby 로 가리킴, 품명 그대로", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await openCreateWithPost(page);
  await nameInput(page).fill("QA 세션 끊김");
  await chooseFiles(page, [jpg("a.jpg")]);
  await expect(registered(page)).toHaveCount(1);
  await chooseFiles(page, [jpg("slow5s-qa.jpg")]);
  await expect(slotsIn(page, "uploading")).toHaveCount(1);
  await chooseFiles(page, [jpg("auth401.jpg")]);

  await expect(sessionAlert(page)).toHaveText(SESSION_LOST);
  await expect(registered(page)).toHaveCount(1);
  await expect(slotsIn(page, "uploading")).toHaveCount(0);
  await expect(saveButton(page)).toBeDisabled();
  await expect(addSlot(page)).toBeDisabled();
  await expect(nameInput(page)).toHaveValue("QA 세션 끊김");

  // 저장 버튼의 aria-describedby 가 가리키는 요소가 정말 그 문구인가 (규칙 8)
  const described = await saveButton(page).evaluate((btn) =>
    (btn.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => {
        const el = document.getElementById(id);
        return {
          id,
          tag: el?.tagName ?? null,
          text: (el?.textContent ?? "").trim(),
        };
      }),
  );
  saveEvidence("b-session-lost", {
    save: await describeEl(saveButton(page)),
    alert: await describeEl(sessionAlert(page)),
    describedBy: described,
    nameValue: await nameInput(page).inputValue(),
    url: new URL(page.url()).pathname,
  });
  expect(described.map((d) => d.text)).toContain(SESSION_LOST);
  await page.screenshot({ path: QA_SHOT("b-401-locked") });

  // 패턴 3 왕복: 함께 게시를 껐다 켜도 등록 칸·잠금·문구가 그대로인가
  await page.getByText("온도 마켓에 함께 게시", { exact: true }).click();
  await page.getByText("온도 마켓에 함께 게시", { exact: true }).click();
  await expect(registered(page)).toHaveCount(1);
  await expect(addSlot(page)).toBeDisabled();
  await expect(sessionAlert(page)).toHaveText(SESSION_LOST);
  await expect(saveButton(page)).toBeDisabled();
  expect(new URL(page.url()).pathname).toBe("/products/new");
  expect(dialogs.count).toBe(0);
});

test("사장 (c) — 수정 화면 값 바꾸고 로고 → 모달 → 계속 작성: 포커스는 취소, 값 그대로", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await nameInput(page).fill("QA 바뀐 품명");
  await page.getByRole("link", { name: "온도 ERP", exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  const openFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    text: (document.activeElement?.textContent ?? "").trim(),
  }));
  await page.screenshot({ path: QA_SHOT("c-edit-logo-modal") });
  await leaveDialog(page)
    .getByRole("button", { name: "계속 작성", exact: true })
    .click();
  await expect(leaveDialog(page)).toBeHidden();
  // radix 는 닫힘 애니메이션 뒤에 포커스를 돌려준다 — 숨김 직후엔 body 다. 돌아온 뒤에 잰다
  await expect(cancelButton(page)).toBeFocused();
  const closeFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    text: (document.activeElement?.textContent ?? "").trim().slice(0, 40),
    dataAc: document.activeElement?.getAttribute("data-ac") ?? null,
  }));
  saveEvidence("c-focus", { openFocus, closeFocus });
  expect(openFocus.text).toBe("계속 작성");
  await expect(nameInput(page)).toHaveValue("QA 바뀐 품명");
  expect(new URL(page.url()).pathname).toBe("/products/1001/edit");
});

test("사장 (d) — 등록 화면 입력 없이 메뉴 → 모달 없이 이동", async ({
  page,
}) => {
  const dialogs = countDialogs(page);
  await page.goto("/products/new");
  await expect(nameInput(page)).toBeVisible();
  await menuLink(page, "재고").click();
  await page.waitForURL((url) => url.pathname === "/inventory");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(dialogs.count).toBe(0);
});

test("패턴 4 — 업로드 중 저장 잠금에 이유 문구가 붙고 버튼이 가리킨다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("slow5s-note.jpg")]);
  await waitUploadsStarted(page, 1);
  await expect(saveButton(page)).toBeDisabled();
  const described = await saveButton(page).evaluate((btn) =>
    (btn.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => (document.getElementById(id)?.textContent ?? "").trim()),
  );
  saveEvidence("p4-uploading-note", { describedBy: described });
  expect(described.join(" ").length).toBeGreaterThan(0);
  await page.screenshot({ path: QA_SHOT("p4-uploading-lock") });
});

test("키보드 — 메뉴 Link 에 포커스하고 Enter 여도 모달이 뜬다", async ({
  page,
}) => {
  await page.goto("/products/new");
  await nameInput(page).fill("가");
  await menuLink(page, "재고").focus();
  await page.keyboard.press("Enter");
  await expect(leaveDialog(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(nameInput(page)).toHaveValue("가");
});

test("수정 화면 — 입력 없이 업로드만 진행 중이어도 Link 는 모달, 나가기면 abort", async ({
  page,
}) => {
  await openEdit(page, 1001);
  await chooseFiles(page, [jpg("slow5s-edit.jpg")]);
  await waitUploadsStarted(page, 1);
  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole("button", { name: "나가기", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/inventory");
  await expect
    .poll(() => uploadAbortStats(page))
    .toEqual({ aborted: 1, rejected: 1 });
  expect(
    await requests(page, { path: /\/products\/1001$/, method: "PATCH" }),
  ).toHaveLength(0);
});

test("디자인 — 401 문구 색은 destructive-strong 토큰, 모달 문구는 LeaveConfirmDialog 그대로", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await chooseFiles(page, [jpg("auth401.jpg")]);
  await expect(sessionAlert(page)).toBeVisible();
  const measured = await sessionAlert(page).evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-destructive-strong)";
    document.body.appendChild(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      token,
      fontSize: cs.fontSize,
      className: el.className,
    };
  });
  saveEvidence("design-401-text", measured);
  expect(measured.color).toBe(measured.token);
  await page.screenshot({ path: QA_SHOT("design-401-bar") });

  await nameInput(page).fill("가");
  await menuLink(page, "재고").click();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(
    leaveDialog(page).getByText(
      "저장하지 않은 입력과 올리는 중인 사진은 남지 않아요.",
      { exact: true },
    ),
  ).toBeVisible();
});
