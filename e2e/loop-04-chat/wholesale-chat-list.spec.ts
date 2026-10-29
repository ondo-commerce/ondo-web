import { expect, test, type Page } from "@playwright/test";
import {
  composer,
  count,
  incoming,
  installClock,
  login,
  mock,
  openChats,
  roomList,
  ROOMS_GET,
  row,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #264 S2 — 도매 채팅 목록. 와이어프레임 `17_wholesale-chat` `#state-entry` `#state-list-default`
 * `#state-list-more` `#state-empty` `#state-error` `#state-not-found` `#state-keyboard`.
 */

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
});

function rowIds(page: Page): Promise<number[]> {
  return roomList(page)
    .locator("a[data-room-id]")
    .evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.roomId)),
    );
}

/** 목록 안에서 Tab으로 들어간다. 헤더 채팅 → 알림 → 계정 다음이 목록 행이다 */
async function tabIntoList(page: Page): Promise<void> {
  await page.getByRole("link", { name: "채팅", exact: true }).focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const inList = await page.evaluate(
      () => document.activeElement?.hasAttribute("data-room-id") ?? false,
    );
    if (inList) return;
  }
  throw new Error("Tab으로 목록 행에 닿지 못했다");
}

function focusedRoomId(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const id = (document.activeElement as HTMLElement | null)?.dataset.roomId;
    return id === undefined ? null : Number(id);
  });
}

test("S2-1 헤더 채팅 버튼 → /chats, 주 메뉴 7개 그대로", async ({ page }) => {
  await page.goto("/orders");
  const chat = page.getByRole("link", { name: "채팅", exact: true });
  await expect(chat).not.toHaveAttribute("aria-current", "page");
  await chat.click();
  await page.waitForURL(/\/chats$/);
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await expect(chat).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link"),
  ).toHaveCount(7);
  // 방을 자동으로 열지 않는다(디자인 결정 4)
  await expect(page.getByText("왼쪽 목록에서 대화를 고르세요")).toBeVisible();
});

test.describe("S2-2 행: 이름, 미리보기, 시각, 안 읽은 수, 답 필요", () => {
  test("오늘 HH:mm, 올해 M/D, 안 읽은 수와 답 필요", async ({ page }) => {
    await openChats(page);
    const bom = row(page, "봄봄상회");
    await expect(bom).toContainText("09:30");
    await expect(bom).toContainText("감사합니다. 내일 주문할게요");
    await expect(bom).toContainText("답 필요");
    await expect(bom.locator("[data-unread]")).toHaveText(
      "1안 읽은 메시지 1개",
    );
    await expect(row(page, "마루의류")).toContainText("10/27");
    // 0이면 배지가 없다
    await expect(row(page, "라온상점").locator("[data-unread]")).toHaveCount(0);
    await expect(row(page, "라온상점")).not.toContainText("답 필요");
  });

  test("100 이상은 99+", async ({ page }) => {
    await openChats(page);
    await incoming(page, 3, "대량 문의", 100);
    await page.clock.fastForward(15_000); // 목록 polling 1회
    const garam = row(page, "가람상회").locator("[data-unread]");
    await expect(garam).toContainText("99+");
    await expect(garam).toContainText("안 읽은 메시지 110개");
  });
});

test("S2-2 그 전 해는 YY.M.D", async ({ page }) => {
  await page.clock.setSystemTime(new Date("2027-01-02T10:00:00+09:00"));
  await openChats(page);
  await expect(row(page, "봄봄상회")).toContainText("26.10.28");
});

test("S2-3 끝까지 내리면 31, 32번째 방이 붙고 roomId 중복 0", async ({
  page,
}) => {
  await openChats(page);
  expect(await rowIds(page)).toHaveLength(30);
  await roomList(page)
    .locator("a[data-room-id]")
    .last()
    .scrollIntoViewIfNeeded();
  await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(32);
  const ids = await rowIds(page);
  expect(new Set(ids).size).toBe(32);
  expect(ids).not.toContain(33); // 다른 도매처 방
});

test.describe("S2-4 빈 상태와 목록 실패", () => {
  test("방 0개 → 빈 상태 문구, 오른쪽은 빈 패널", async ({ page }) => {
    await openChats(page);
    await mock(page, "reset", { rooms: 0 });
    await page.clock.fastForward(15_000);
    await expect(page.getByText("아직 받은 문의가 없어요")).toBeVisible();
    await expect(
      page.getByText("소매처가 상품 화면에서 문의하면 여기에 쌓여요"),
    ).toBeVisible();
    await expect(page.getByText("왼쪽 목록에서 대화를 고르세요")).toHaveCount(
      0,
    );
  });

  test("목록 500 → 목록 패널 안 오류, 다시 시도는 재요청 1회", async ({
    page,
  }) => {
    await page.goto("/orders");
    await mock(page, "fail", { op: "rooms", times: 1 });
    await page.getByRole("link", { name: "채팅", exact: true }).click();
    const panel = page.getByRole("region", { name: "대화 목록" });
    await expect(panel.getByRole("alert")).toContainText(
      "서버에서 문제가 생겼어요",
    );
    await waitCount(page, ROOMS_GET, 1);
    await panel.getByRole("button", { name: "다시 시도" }).click();
    await expect(row(page, "봄봄상회")).toBeVisible();
    expect(await count(page, ROOMS_GET)).toBe(2);
  });
});

test.describe("S2-5 행 열기, aria-current, 없는 방", () => {
  test("클릭 → ?room, 오른쪽 그 방, 선택 행 aria-current, 행 안 버튼 없음", async ({
    page,
  }) => {
    await openChats(page);
    const bom = row(page, "봄봄상회");
    await bom.click();
    await page.waitForURL(/\/chats\?room=1$/);
    await expect(
      page.getByRole("heading", { name: "봄봄상회", exact: true }),
    ).toBeVisible();
    await expect(bom).toHaveAttribute("aria-current", "true");
    await expect(row(page, "대기상회")).not.toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(
      roomList(page).locator("a[data-room-id] :is(a, button, input, textarea)"),
    ).toHaveCount(0);
  });

  test("Tab 뒤 Enter → 첫 행 방이 열린다", async ({ page }) => {
    await openChats(page);
    await tabIntoList(page);
    const first = (await rowIds(page))[0];
    expect(await focusedRoomId(page)).toBe(first);
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`room=${first}$`));
  });

  test("?room=99999 → 대화를 찾을 수 없어요, 목록 정상", async ({ page }) => {
    await openChats(page, 99999);
    await expect(page.getByText("대화를 찾을 수 없어요")).toBeVisible();
    await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(30);
    // 다른 도매처 방도 같다(존재를 숨긴다)
    await page.goto("/chats?room=33");
    await expect(page.getByText("대화를 찾을 수 없어요")).toBeVisible();
  });
});

test.describe("S2-6 목록 ↑↓, Enter 로 열면 입력창 포커스", () => {
  test("↑↓ 이동, 첫 행 위에서 멈춤, Enter 로 열면 입력창", async ({ page }) => {
    await openChats(page);
    await tabIntoList(page);
    const ids = await rowIds(page);
    await page.keyboard.press("ArrowUp");
    expect(await focusedRoomId(page)).toBe(ids[0]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect(await focusedRoomId(page)).toBe(ids[2]);
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`room=${ids[2]}$`));
    await expect(composer(page)).toBeFocused();
    // 목록은 탭 정지 하나 — 선택 행만 tabindex 0
    await expect(roomList(page).locator('a[tabindex="0"]')).toHaveCount(1);
  });

  test("끝 행 아래에선 멈춘다", async ({ page }) => {
    await openChats(page);
    await mock(page, "reset", { rooms: 3 });
    await page.clock.fastForward(15_000);
    await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(3);
    await tabIntoList(page);
    const ids = await rowIds(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    expect(await focusedRoomId(page)).toBe(ids[2]);
  });
});
