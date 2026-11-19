import { expect, test, type Page } from "@playwright/test";
import {
  installLoginFailure,
  LOGIN_FAILED,
  loginFailedBanner,
  loginHeading,
  otherTabNotice,
  sessionEmail,
  WRONG_PASSWORD,
} from "./helpers";
import {
  listenSessionBroadcast,
  nameInput,
  waitSessionBroadcast,
} from "../loop-10-save-lock-notice/helpers";
import {
  ME,
  OTHER,
  signIn,
  signOut,
} from "../loop-08b-chat-filter-history/helpers";
import { T0 } from "../loop-09-form-back-guard/helpers";
import { countDialogs } from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-11 (#410, 기획은 loop-10 `01-plan.md` §4-2, §4-2-1, §6 S1) — 다른 탭 때문에 이 탭이 로그아웃되면
 * 로그인 화면이 그 이유를 한 번 말한다. 이 탭 로그아웃, 처음 연 화면, 새로고침, 방송 순간 이미 `/login`이던
 * 탭에선 말하지 않는다. 목은 탭마다 따로라 탭 2 로그인은 방송만 보낸다(loop-09, loop-10과 같다).
 * 시계는 도착 뒤에 깐다(loop-09 02-dev-255 §4 2).
 */

async function openSecondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  return tab;
}

test("S1-2 S1-5 탭 2 다른 계정 로그인 → 탭 1 로그인 화면 안내 1, 폼 사라짐 → 500ms 뒤에도 1 → 틀린 비밀번호 배너가 안내를 내림 → 새로고침 0", async ({
  page,
}) => {
  await installLoginFailure(page);
  const dialogs = countDialogs(page);
  await page.goto("/login");
  await signIn(page, ME);
  await page.goto("/products/new");
  await nameInput(page).fill("다른 탭 안내 니트");
  await listenSessionBroadcast(page);

  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);
  await page.bringToFront();
  await waitSessionBroadcast(page);

  // S1-2
  await page.waitForURL(/\/login$/);
  await expect(otherTabNotice(page)).toHaveCount(1);
  await expect(otherTabNotice(page)).toHaveAttribute("data-ac", "10:S1-2");
  await expect(nameInput(page)).toHaveCount(0);
  expect(dialogs.count).toBe(0);
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(1);

  // S1-5
  await page.getByLabel("이메일").fill(ME);
  await page.getByLabel("비밀번호").fill(WRONG_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(loginFailedBanner(page)).toHaveCount(1);
  // 부분 일치가 아니라 글자 그대로 — 실패 배너에 다른 문장이 붙어도 잡는다
  await expect(loginFailedBanner(page)).toHaveText(LOGIN_FAILED);
  await expect(otherTabNotice(page)).toHaveCount(0);
  await page.getByLabel("이메일").fill(OTHER);
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/login");

  // S1-2 끝: 새로고침한 로그인 화면엔 0
  await page.reload();
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
  expect(dialogs.count).toBe(0);
});

test("S1-2 끝 안내 1인 채로 바로 새로고침 → 0", async ({ page }) => {
  // 위 test의 끝 새로고침은 실패 배너가 이미 안내를 내린 뒤라, 새로고침이 안내를 없애는지는 여기서 따로 본다
  await page.goto("/login");
  await signIn(page, ME);
  await page.goto("/products/new");
  await nameInput(page).fill("새로고침 안내 니트");
  await listenSessionBroadcast(page);

  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);
  await page.bringToFront();
  await waitSessionBroadcast(page);
  await page.waitForURL(/\/login$/);
  await expect(otherTabNotice(page)).toHaveCount(1);

  await page.reload();
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
});

test("S1-3 탭 2 같은 계정 로그인 뒤 로그아웃 → 탭 1 로그인 화면 안내 1", async ({
  page,
}) => {
  await page.goto("/login");
  await signIn(page, ME);
  await listenSessionBroadcast(page);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await waitSessionBroadcast(page, 1);
  // 같은 계정 재로그인은 닫지 않는다(refresh)
  expect(new URL(page.url()).pathname).toBe("/dashboard");

  await signOut(tab);
  await page.bringToFront();
  await waitSessionBroadcast(page, 2);
  await page.waitForURL(/\/login$/);
  await expect(otherTabNotice(page)).toHaveCount(1);
});

test("S1-4 처음 연 로그인 화면 0 → 로그인 → 이 탭 로그아웃 → 0", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);

  await signIn(page, ME);
  await signOut(page);
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
});

test("S1-7 이미 로그인 화면인 탭: 계정 없음 + 다른 계정 방송 0, 옛 계정 + 같은 계정 방송 0, 옛 계정 + 다른 계정 방송 0, 앱 안 이동으로 다시 마운트해도 0", async ({
  page,
}) => {
  // ① 로컬 계정 없음 + 다른 계정 방송
  await page.goto("/login");
  await expect(loginHeading(page)).toBeVisible();
  await listenSessionBroadcast(page);
  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);
  await page.bringToFront();
  await waitSessionBroadcast(page, 1);
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);

  // ② 옛 계정 ME가 남은 로그인 화면 + 같은 계정 방송
  await signIn(page, ME);
  await page.goto("/login");
  await expect(loginHeading(page)).toBeVisible();
  expect(await sessionEmail(page)).toBe(ME);
  await listenSessionBroadcast(page);
  await tab.goto("/login");
  await signIn(tab, ME);
  await page.bringToFront();
  await waitSessionBroadcast(page, 1);
  await page.clock.runFor(500);
  expect(new URL(page.url()).pathname).toBe("/login");
  await expect(otherTabNotice(page)).toHaveCount(0);
  expect(await sessionEmail(page)).toBe(ME);

  // ③ 옛 계정 ME + 다른 계정 방송 → 세션은 닫히지만 안내 0
  await tab.goto("/login");
  await signIn(tab, OTHER);
  await page.bringToFront();
  await waitSessionBroadcast(page, 2);
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
  expect(await sessionEmail(page)).toBeNull();

  // ③ 뒤: 앱 안 링크로 회원가입에 갔다가 로그인으로 돌아와 LoginView를 다시 마운트해도 0
  // 문서가 새로 열리면 이 표시가 사라진다 — 전체 새로고침 없이 돌아왔는지 본다
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await page.waitForURL(/\/signup$/);
  await expect(page.getByRole("button", { name: "가입하기" })).toBeVisible();
  await expect(loginHeading(page)).toHaveCount(0);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/login$/);
  await expect(loginHeading(page)).toBeVisible();
  await expect(page.getByLabel("비밀번호")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sameDocument?: boolean }).__sameDocument ===
        true,
    ),
  ).toBe(true);
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
});

test("S1-7 이미 로그인 화면인 탭: 계정 없음 + 로그아웃 방송 0, 옛 계정 + 로그아웃 방송 0과 세션 닫힘, 다시 마운트해도 0", async ({
  page,
}) => {
  // ① 로컬 계정 없음 + 탭 2 로그인 뒤 로그아웃 방송
  await page.goto("/login");
  await expect(loginHeading(page)).toBeVisible();
  await listenSessionBroadcast(page);
  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);
  await signOut(tab);
  await page.bringToFront();
  await waitSessionBroadcast(page, 2);
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
  expect(await sessionEmail(page)).toBeNull();

  // ③ 옛 계정 ME가 남은 로그인 화면 + 탭 2 로그아웃 방송 → 세션은 닫히지만 안내 0
  await signIn(page, ME);
  await page.goto("/login");
  await expect(loginHeading(page)).toBeVisible();
  expect(await sessionEmail(page)).toBe(ME);
  await listenSessionBroadcast(page);
  await tab.goto("/login");
  await signIn(tab, ME);
  await signOut(tab);
  await page.bringToFront();
  await waitSessionBroadcast(page, 2);
  await page.clock.runFor(500);
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(await sessionEmail(page)).toBeNull();
  await expect(otherTabNotice(page)).toHaveCount(0);

  // ③ 뒤: 앱 안 링크로 다시 마운트해도 0(보관에 남은 게 없어야 한다)
  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await page.waitForURL(/\/signup$/);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/login$/);
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
});
