import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  chatRows,
  composer,
  draftKeys,
  enterChats,
  ME,
  openRoomReady,
  OTHER,
  signIn,
  signOut,
} from "./helpers";

/**
 * 리뷰 R8(도매) — 다른 탭에서 세션이 바뀐 뒤 돌아온 탭.
 *
 * 세션 표시는 탭마다(`sessionStorage`)지만 서버 쿠키는 브라우저에 하나다. 탭 2에서 로그아웃하고 B로 들어오면 탭 1은
 * 여전히 A라고 믿고 A 캐시(목록, 대화, 쓰던 글)를 그린다. 고친 뒤: 탭 2의 세션 변경이 탭 1에 전달되고(BroadcastChannel),
 * 탭 1은 로그아웃과 같은 정리(채팅 캐시, 세대, 헤더 알림 캐시, 쓰던 글)를 한 뒤 로그인 화면으로 간다.
 *
 * 같은 브라우저 문맥(context)의 두 페이지 = 같은 브라우저의 두 탭. 목(MSW)은 탭마다 따로라 서버 세션은 흉내 내지 않는다 —
 * 여기서 보는 것은 "탭 1이 앞 계정 화면을 계속 보여 주는가"뿐이다.
 */

const ROOM_1 = 1;

async function openSecondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  return tab;
}

/** 탭 1: A로 방 1을 열고 쓰던 글 하나 */
async function tabOneWithRoom(page: Page): Promise<void> {
  await enterChats(page, { email: ME });
  await openRoomReady(page, ROOM_1);
  await expect(bubbles(page).first()).toBeVisible();
  await composer(page).fill("A가 쓰던 글");
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
}

async function expectTabOneCleared(page: Page): Promise<void> {
  await page.waitForURL(/\/login/);
  await expect(chatRows(page)).toHaveCount(0);
  await expect(bubbles(page)).toHaveCount(0);
  await expect(page.getByText("A가 쓰던 글")).toHaveCount(0);
  expect(await draftKeys(page), "A의 쓰던 글이 탭 1에 남음").toEqual([]);
}

test("R8 탭 1 A 방 열어 둠 → 탭 2 A 로그인, 로그아웃, B 로그인 → 탭 1은 로그인 화면, A 행, 말풍선, 쓰던 글 0", async ({
  page,
}) => {
  await tabOneWithRoom(page);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  /* 같은 계정 로그인은 탭 1을 건드리지 않는다 */
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/chats/);
  await expect(bubbles(page).first()).toBeVisible();

  await signOut(tab);
  await signIn(tab, OTHER);

  await page.bringToFront();
  await expectTabOneCleared(page);
});

test("R8 탭 2에서 로그아웃 없이 B로 로그인만 해도 탭 1(A)은 정리되고 로그인 화면", async ({
  page,
}) => {
  await tabOneWithRoom(page);

  const tab = await openSecondTab(page);
  await signIn(tab, OTHER);

  await page.bringToFront();
  await expectTabOneCleared(page);
});
