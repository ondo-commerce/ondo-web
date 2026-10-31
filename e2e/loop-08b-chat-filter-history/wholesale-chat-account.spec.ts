import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  chatLink,
  chatRows,
  enterChats,
  knob,
  ME,
  openRoomById,
  openRoomReady,
  OTHER,
  roomPanel,
  signIn,
  signOut,
} from "./helpers";

/**
 * loop-08b 메타 리뷰 M1. QueryClient는 앱 수명 내내 하나라 로그아웃하고 다른 계정으로 들어와도 남는다.
 * A가 연 목록과 대화가 B 화면에 캐시로 먼저 그려지면 안 된다.
 *
 * 목은 계정과 무관하게 같은 방을 준다(`chat.ts` CHAT_ME_WHOLESALER_ID). 그래서 "A의 것"은 서버 응답이 아니라
 * **캐시에서 바로 그려진 것**으로 가른다 — B 로그인 뒤 목록, 방 머리, 메시지 응답을 늦춰 두고, 늦은 동안 행과
 * 말풍선이 0이면 캐시를 안 쓴 것이다. 늦춘 응답이 오면 B 것으로 그려진다.
 */

const ROOM_1 = 1;

function skeleton(page: Page) {
  return page.getByRole("status", { name: "불러오는 중" });
}

test("M1 A 방 1 열기 → 로그아웃 → B 로그인 → 채팅: 응답 전 A 목록 0, A 본문 0, 응답 뒤 B 것으로", async ({
  page,
}) => {
  await enterChats(page, { email: ME });
  await openRoomReady(page, ROOM_1);
  await expect(bubbles(page).first()).toBeVisible();

  await signOut(page);
  await knob(page, "delay", { op: "rooms", ms: 2000, times: 1 });
  await signIn(page, OTHER);

  await test.step("목록 — 응답 전엔 스켈레톤, A의 행 0", async () => {
    await chatLink(page).click();
    await page.waitForURL(/\/chats/);
    await expect(skeleton(page).first()).toBeVisible();
    await expect(chatRows(page)).toHaveCount(0);
    await expect(chatRows(page).first()).toBeVisible({ timeout: 10_000 });
  });

  await test.step("방 1 — 응답 전엔 스켈레톤, A의 말풍선 0", async () => {
    await knob(page, "delay", { op: "room", ms: 2000, times: 1 });
    await knob(page, "delay", { op: "messages", ms: 2000, times: 1 });
    await openRoomById(page, ROOM_1);
    await expect(roomPanel(page).getByRole("status")).toBeVisible();
    await expect(bubbles(page)).toHaveCount(0);
    await expect(bubbles(page).first()).toBeVisible({ timeout: 10_000 });
  });
});
