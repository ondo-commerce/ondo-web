import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  chatMock,
  chatNav,
  composer,
  inquiryButton,
  log,
  roomRow,
  start,
} from "../loop-08-chat-polish/retail-helpers";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";

/**
 * loop-08c review-fix 2차(#342). `pnpm e2e:stub`.
 *
 * R7 — A가 누른 `문의하기`(방 만들기 POST)의 응답이 로그아웃, B 로그인 뒤에 도착한다. 이전 세대 응답은 401이든 성공이든
 * B 화면을 건드리지 않는다(`/login` 이동 0, A 방으로 이동 0, B의 쓰던 글 그대로). 방 만들기는 목에 지연 손잡이가 없어서
 * 브라우저 `fetch`를 감싸 그 POST를 문(gate)에 세운다 — 요청은 A 세대에서 떠나고, 문을 열면 그때 목에 닿는다.
 */

assertStubServers();

const B_ROOM = 2;
const B_BODY = "제 미수 얼마예요?";

/** `page.goto` 전에. `POST /chat/rooms`를 `window.__createGate`가 열릴 때까지 세운다 */
async function installCreateGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __createArmed: boolean;
      __createHeld: number;
      __createOpen: () => void;
      __createGate: Promise<void>;
    };
    w.__createArmed = false;
    w.__createHeld = 0;
    w.__createGate = new Promise<void>((resolve) => {
      w.__createOpen = resolve;
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
        w.__createArmed &&
        method === "POST" &&
        /\/api\/retail\/chat\/rooms$/.test(url)
      ) {
        w.__createHeld += 1;
        await w.__createGate;
      }
      return original(input, init);
    };
  });
}

async function armCreateGate(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __createArmed: boolean }).__createArmed = true;
  });
}

async function openCreateGate(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __createOpen: () => void }).__createOpen(),
  );
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
  await expect(chatNav(page)).toBeVisible();
}

/** A가 도매처 홈에서 `문의하기` → 방 만들기가 문에 선다 → 로그아웃 → B 로그인 → B 방 2에 쓰던 글 */
async function holdCreateThenSwitch(page: Page): Promise<void> {
  await installCreateGate(page);
  await routeAuth(page);
  await start(page, "/wholesalers/101");
  await armCreateGate(page);
  await inquiryButton(page).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __createHeld: number }).__createHeld,
      ),
    )
    .toBe(1);
  await logout(page);
  await chatMock(page, "me", { retailerId: RETAILERS.miso.retailerId });
  await loginAs(page, "miso");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, B_ROOM).click();
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);
  await expect(log(page).getByText(B_BODY)).toBeVisible();
  await composer(page).fill("B가 쓰던 글");
}

async function expectBUntouched(page: Page): Promise<void> {
  /* 늦은 응답이 처리될 시간 */
  await page.waitForTimeout(1_500);
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);
  await expect(composer(page)).toHaveValue("B가 쓰던 글");
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
}

test("R7 A 방 만들기 응답이 B 로그인 뒤 401로 도착 → /login 이동 0, B 방과 쓰던 글 그대로", async ({
  page,
}) => {
  await holdCreateThenSwitch(page);
  await chatMock(page, "fail", { op: "create", status: 401 });
  await openCreateGate(page);
  await expectBUntouched(page);
});

test("R7 A 방 만들기 응답이 B 로그인 뒤 성공으로 도착 → A 방으로 이동 0, B 방과 쓰던 글 그대로", async ({
  page,
}) => {
  await holdCreateThenSwitch(page);
  await openCreateGate(page);
  await expectBUntouched(page);
});

test("R7 대조: 같은 세대의 방 만들기 401은 그대로 /login", async ({ page }) => {
  await routeAuth(page);
  await start(page, "/wholesalers/101");
  await chatMock(page, "fail", { op: "create", status: 401 });
  await inquiryButton(page).click();
  await expect(page).toHaveURL(/\/login$/);
});
