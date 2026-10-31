import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  chatLink,
  chatRows,
  composer,
  draftKeys,
  enterChats,
  gotoChats,
  keyOf,
  knob,
  ME,
  openRoomById,
  openRoomReady,
  OTHER,
  roomPanel,
  signIn,
  signOut,
  storedDraft,
} from "./helpers";

/** 승인 대기 계정(fixtures). 이 세션이면 ERP가 아니라 `/approval`(ERP 레이아웃 밖)을 본다 */
const PENDING = "pending@ondo.test";
const SESSION_KEY = "ondo.wholesale.session";

/**
 * loop-08b 메타 리뷰 M1. QueryClient는 앱 수명 내내 하나라 로그아웃하고 다른 계정으로 들어와도 남는다.
 * A가 연 목록과 대화가 B 화면에 캐시로 먼저 그려지면 안 된다.
 *
 * 목은 계정과 무관하게 같은 방을 준다(`chat.ts` CHAT_ME_WHOLESALER_ID). 그래서 "A의 것"은 서버 응답이 아니라
 * **캐시에서 바로 그려진 것**으로 가른다 — B 로그인 뒤 목록, 방 머리, 메시지 응답을 늦춰 두고, 늦은 동안 행과
 * 말풍선이 0이면 캐시를 안 쓴 것이다. 늦춘 응답이 오면 B 것으로 그려진다.
 *
 * M2, M4는 쓰던 글 쪽이다. 로그아웃 정리 등록부가 ERP 레이아웃에만 있던 것(M2), 지우기 실패가 새로고침을
 * 넘어가던 것(M4). 열거(`key()`) 실패(M3)는 `draftStore.test.ts`가 본다.
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

/** 방 1에 글을 쓰고 저장소에 들어갈 때까지 */
async function leaveDraft(page: Page, text: string): Promise<void> {
  await openRoomReady(page, ROOM_1);
  await composer(page).fill(text);
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBe(text);
}

/** 다시 ME로 들어가 방 1 입력창이 빈칸인지 */
async function expectBlankAfterSignIn(page: Page): Promise<void> {
  await signIn(page, ME);
  await gotoChats(page);
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue("");
}

test("M2 ERP 밖 로그아웃 — 방 1 글 → 승인 대기 세션 /approval → 로그인 화면으로 → 키 0, 다시 ME → 빈칸", async ({
  page,
}) => {
  await enterChats(page, { email: ME });
  await leaveDraft(page, "승인 화면 길로 남은 글");

  /* 목 로그인은 누구든 APPROVED라 승인 대기 세션은 저장소에 직접 적는다(side-02 `seedSession`과 같은 모양).
     공용 단말에서 다음 사람이 승인 대기 계정으로 들어온 상황이다 */
  await page.evaluate(
    ([key, email]) =>
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          email,
          overrides: { [email]: { status: "PENDING" } },
        }),
      ),
    [SESSION_KEY, PENDING] as const,
  );
  await page.goto("/approval");
  await page.getByRole("link", { name: "로그인 화면으로" }).click();
  await page.waitForURL(/\/login/);

  expect(await draftKeys(page)).toEqual([]);
  await expectBlankAfterSignIn(page);
});

test("M4 removeItem이 던지는 로그아웃 → 새로고침 → 다시 ME → 방 1 빈칸(저장소엔 옛 글이 남아 있어도)", async ({
  page,
}) => {
  await enterChats(page, { email: ME });
  await leaveDraft(page, "지우기가 실패한 글");
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => {
      throw new DOMException("막힌 저장소", "SecurityError");
    };
  });
  await signOut(page);
  await page.reload();
  /* 새 문서 — 메모리 "지움" 표시는 없고 저장소엔 옛 글이 그대로다 */
  expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBe("지우기가 실패한 글");
  await expectBlankAfterSignIn(page);
});
