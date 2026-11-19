import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  chatNav,
  composer,
  log,
  READ_POST,
  requests,
  ROOMS_GET,
  roomList,
  roomRow,
  start,
} from "../loop-08-chat-polish/retail-helpers";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";

/**
 * loop-08c QA — S7(#342) 소매 로그아웃 경계에서 개발 e2e가 안 본 두 갈래. `pnpm e2e:stub`으로 돈다.
 *
 * 1. 목록(`useRoomListQuery`)은 `guardSession`을 안 거친다(02-dev-s7 남긴 부채). A 목록 요청의 늦은 401이
 *    B 로그인 뒤에 도착하면 공용 401 처리(`/login` 전체 이동)나 목록 끊김 표시가 B를 잡는지.
 * 2. 읽음 POST(mutation)의 늦은 401. 쿼리 취소(`cancelQueries`)가 닿지 않는 길이라 세대 검사만 막는다.
 *
 * `QA_SHOT_DIR`이 있으면 B 화면 스크린샷을 남긴다(QA 증빙용, 없으면 안 찍는다).
 */

assertStubServers();

const B_ROOM = 2;
const B_BODY = "제 미수 얼마예요?";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.QA_SHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await chatMock(page, "me", { retailerId: RETAILERS[key].retailerId });
  await page.getByLabel("이메일", { exact: true }).fill(RETAILERS[key].email);
  await page.getByLabel("비밀번호", { exact: true }).fill("ondo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(chatNav(page)).toBeVisible();
}

async function waitInFlight(
  page: Page,
  filter: { path: RegExp; method?: string },
): Promise<void> {
  await expect
    .poll(
      async () => (await requests(page, filter)).some((r) => r.status === null),
      { timeout: 8_000 },
    )
    .toBe(true);
}

test("QA S7 목록 늦은 401(지연 3초) → 로그아웃 → B 로그인 → 4초 뒤에도 홈, /chats는 B 행만, 끊김 표시 0", async ({
  page,
}) => {
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(roomRow(page, 1)).toBeVisible();

  await chatMock(page, "fail", { op: "rooms", status: 401 });
  await chatMock(page, "delay", { op: "rooms", ms: 3_000 });
  /* 방에 갔다 목록으로 돌아오면 목록이 다시 묻는다(refetchOnMount always) — 그 요청이 지연에 물린다 */
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await waitInFlight(page, ROOMS_GET);

  await logout(page);
  await loginAs(page, "miso");
  await expect
    .poll(
      async () =>
        (await requests(page, ROOMS_GET)).some((r) => r.status === 401),
      { timeout: 8_000 },
    )
    .toBe(true);
  await page.waitForTimeout(1_000);
  /* 늦은 401이 공용 처리로 갔으면 /login으로 전체 이동했다 */
  await expect(page).toHaveURL(/\/$/);

  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(roomRow(page, B_ROOM)).toBeVisible();
  await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(1);
  await shot(page, "s7-b-chats-after-late-list-401");
  await roomRow(page, B_ROOM).click();
  await expect(log(page).getByText(B_BODY, { exact: true })).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
});

test("QA S7 읽음 POST 늦은 401(지연 3초) → 로그아웃 → B 로그인, B 방: 입력창 쓰기 가능, B 말풍선만", async ({
  page,
}) => {
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(bubbles(page).first()).toBeVisible();

  await chatMock(page, "fail", { op: "read", status: 401 });
  await chatMock(page, "delay", { op: "read", ms: 3_000 });
  const readsBefore = (await requests(page, READ_POST)).length;
  /* 도매가 답하면 열린 방이 읽음을 보낸다 — 그 POST가 지연에 물린다 */
  await chatMock(page, "rooms/1/incoming", { body: "QA 늦은 읽음 유발" });
  await expect
    .poll(async () => (await requests(page, READ_POST)).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(readsBefore);
  await waitInFlight(page, READ_POST);

  await logout(page);
  await loginAs(page, "miso");
  await chatNav(page).click();
  await roomRow(page, B_ROOM).click();
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);
  await expect
    .poll(
      async () =>
        (await requests(page, READ_POST)).some((r) => r.status === 401),
      { timeout: 8_000 },
    )
    .toBe(true);
  await page.waitForTimeout(1_000);
  await expect(composer(page)).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  await expect(log(page).getByText(B_BODY, { exact: true })).toBeVisible();
  await expect(
    bubbles(page).filter({ hasText: "QA 늦은 읽음 유발" }),
  ).toHaveCount(0);
  await shot(page, "s7-b-room-after-late-read-401");
});
