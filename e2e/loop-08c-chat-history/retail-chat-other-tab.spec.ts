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
  requests,
  roomRow,
  SEND_POST,
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

/** 보류 말풍선(보내는 중, 못 보냄). 05a `retail-chat-send.spec.ts`와 같은 셀렉터 */
function pendingBubbles(page: Page) {
  return log(page).locator("[data-pending]");
}

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

/**
 * `page.goto` 전에. 보내기 POST를 `__sendOpen()`이 불릴 때까지 세운다(소매 목엔 보내기 지연 손잡이가 없다).
 * 요청은 세션 세대를 잡은 뒤 이 문에 선다 — 문을 열면 그때 목에 닿는다
 */
async function installSendGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __sendArmed: boolean;
      __sendHeld: number;
      __sendOpen: () => void;
      __sendGate: Promise<void>;
    };
    w.__sendArmed = false;
    w.__sendHeld = 0;
    w.__sendGate = new Promise<void>((resolve) => {
      w.__sendOpen = resolve;
    });
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (
        w.__sendArmed &&
        method === "POST" &&
        /\/api\/retail\/chat\/rooms\/\d+\/messages$/.test(url)
      ) {
        w.__sendHeld += 1;
        await w.__sendGate;
      }
      return original(input, init);
    };
  });
}

/** 탭 1에서 보내기를 문에 세운 채 탭 2가 같은 A로 로그인 */
async function holdSendThenRelogin(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sendArmed: boolean }).__sendArmed = true;
  });
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveAttribute("data-pending", "sending");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __sendHeld: number }).__sendHeld,
      ),
    )
    .toBe(1);
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, "bombom");
  await page.bringToFront();
  /* 갱신이 돈 뒤(세대가 오른 뒤) 문을 연다 */
  await page.waitForTimeout(500);
  await page.evaluate(() =>
    (window as unknown as { __sendOpen: () => void }).__sendOpen(),
  );
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

test("M6 보내기가 선 채 같은 A 재로그인 → POST 201 도착 → 실패 말풍선 0, 보류 0, 서버 말풍선 1", async ({
  page,
}) => {
  await installSendGate(page);
  /* 실패 말풍선이 한 프레임이라도 붙었나 — polling이 서버 말풍선을 가져와 금방 가릴 수 있어 끝 상태만으론 못 본다 */
  await page.addInitScript(() => {
    const w = window as unknown as { __everFailed: boolean };
    w.__everFailed = false;
    const observe = () =>
      new MutationObserver(() => {
        if (document.querySelector('[data-pending="failed"]'))
          w.__everFailed = true;
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-pending"],
      });
    if (document.documentElement) observe();
    else document.addEventListener("DOMContentLoaded", observe);
  });
  await tabOneWithRoom(page);
  await holdSendThenRelogin(page, "갱신 넘긴 성공 글");
  await expect
    .poll(async () => (await requests(page, SEND_POST)).at(-1)?.status)
    .toBe(201);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => (window as unknown as { __everFailed: boolean }).__everFailed,
    ),
    "성공한 보내기에 실패 말풍선",
  ).toBe(false);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await expect(
    bubbles(page).filter({ hasText: "갱신 넘긴 성공 글" }),
  ).toHaveCount(1);
});

test("M6 보내기가 선 채 같은 A 재로그인 → POST 500 도착 → 실패 말풍선, 다시 보내기, 지우기", async ({
  page,
}) => {
  await installSendGate(page);
  await tabOneWithRoom(page);
  await chatMock(page, "fail", { op: "send", status: 500 });
  await holdSendThenRelogin(page, "갱신 넘긴 실패 글");
  await expect(pendingBubbles(page)).toHaveAttribute("data-pending", "failed", {
    timeout: 5_000,
  });
  await expect(
    pendingBubbles(page).getByRole("button", { name: "다시 보내기" }),
  ).toBeVisible();
  await expect(
    pendingBubbles(page).getByRole("button", { name: "지우기" }),
  ).toBeVisible();
});

test("M7 방 첫 messages GET 지연 중 같은 A 재로그인 → 그 방이 다시 조회해 말풍선이 그려진다", async ({
  page,
}) => {
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await chatMock(page, "delay", { op: "messages", ms: 3_000, times: 1 });
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(bubbles(page)).toHaveCount(0);

  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, "bombom");

  await page.bringToFront();
  await expect(log(page).getByText(A_BODY)).toBeVisible({ timeout: 8_000 });
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
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
