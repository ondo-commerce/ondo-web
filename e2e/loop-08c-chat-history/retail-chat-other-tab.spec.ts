import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  chatNav,
  composer,
  count,
  log,
  MESSAGES_GET,
  roomRow,
  start,
} from "../loop-08-chat-polish/retail-helpers";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";

/**
 * loop-08c 리뷰 R8(소매, #342). `pnpm e2e:stub`.
 *
 * 같은 브라우저의 두 탭. 쿠키는 브라우저 문맥(context)에 하나라 두 탭이 같은 세션을 본다. 탭 2에서 로그아웃하거나 다른
 * 계정으로 들어오면 탭 1(A 방을 열어 둔 탭)은 A 대화를 계속 보여 주지 않고 로그인 화면으로 간다(도매 1차와 같은 방식).
 */

assertStubServers();

const A_BODY = "안녕하세요, 플라워 셔츠 문의드려요";

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await page.getByLabel("이메일").fill(RETAILERS[key].email);
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** 탭 1: A로 방 1. 말풍선까지 */
async function tabOneWithRoom(page: Page): Promise<void> {
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(log(page).getByText(A_BODY)).toBeVisible();
}

async function secondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/");
  await expect(chatNav(tab)).toBeVisible();
  return tab;
}

async function expectTabOneLeft(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login$/);
  await expect(bubbles(page)).toHaveCount(0);
  await expect(page.getByText(A_BODY)).toHaveCount(0);
}

test("R8 탭 1 A 방 1 → 탭 2 로그아웃 → 탭 1은 로그인 화면, A 말풍선 0", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  const tab = await secondTab(page);
  await logout(tab);

  await page.bringToFront();
  await expectTabOneLeft(page);
});

test("R8 탭 1 A 방 1 → 탭 2 로그아웃 뒤 B 로그인 → 탭 1은 로그인 화면, A 말풍선 0", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  const tab = await secondTab(page);
  await logout(tab);
  await loginAs(tab, "miso");

  await page.bringToFront();
  await expectTabOneLeft(page);
});

test("M5 탭 1 A 방 1 → 탭 2에서 로그아웃 없이 B로 바로 로그인 → 탭 1은 로그인 화면, A 말풍선 0", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, "miso");

  await page.bringToFront();
  await expectTabOneLeft(page);
});

test("M1 M5 탭 1 A 방 401로 잠김(쓰던 글 있음) → 탭 2 같은 A로 로그인 → 탭 1은 이동 없이 잠김 풀림, 쓰던 글 그대로, polling 다시", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  await composer(page).fill("A가 쓰던 글");
  await chatMock(page, "fail", { op: "messages", status: 401 });
  await expect(composer(page)).toHaveAttribute("readonly", "", {
    timeout: 8_000,
  });
  const lockedAt = await count(page, MESSAGES_GET);

  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, "bombom");

  await page.bringToFront();
  await expect(composer(page)).not.toHaveAttribute("readonly", "", {
    timeout: 5_000,
  });
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(composer(page)).toHaveValue("A가 쓰던 글");
  await expect(log(page).getByText(A_BODY)).toBeVisible();
  await expect
    .poll(() => count(page, MESSAGES_GET), { timeout: 10_000 })
    .toBeGreaterThan(lockedAt);
});

test("R8 로그아웃한 탭은 다른 탭의 로그인에 끌려가지 않는다", async ({
  page,
}) => {
  await routeAuth(page);
  await start(page, "/");
  await logout(page);
  await page.goto("/signup");
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, "miso");

  await page.bringToFront();
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/signup$/);
});
