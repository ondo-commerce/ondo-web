import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  captureSends,
  collectPageErrors,
  composer,
  draftKeys,
  enterChats,
  gotoChats,
  keyOf,
  knob,
  log,
  ME,
  openRoomReady,
  OTHER,
  pendingBubbles,
  signIn,
  signOut,
  storedDraft,
} from "./helpers";

/**
 * loop-08b #327 S3 방별 입력 기억과 보류 말풍선(01-plan §4-1, §6 S3, 와이어프레임 17 `#state-draft-keep`).
 *
 * 기본 시드 방 1(봄봄상회), 방 2(대기상회)를 쓴다. 로그인 계정은 `approved@ondo.test`, 다른 계정은 `first@ondo.test`
 * (목은 계정과 무관하게 같은 방을 준다, `chat.ts` CHAT_ME_WHOLESALER_ID).
 *
 * "디바운스 300ms 전에 떠남"은 시계를 멈춰 만든다(`holdTimers`). 멈춘 동안 300ms 저장 타이머는 돌지 않으니,
 * 그때 글이 남아 있으면 떠나는 순간의 즉시 저장 덕이다. 고정 대기는 쓰지 않는다.
 */

const ROOM_1 = 1;
const ROOM_2 = 2;
const TEXT_1 = "레드 M 내일 들어와요";

/**
 * 페이지 시계를 멈춘다(50ms 앞으로 옮기고 멈춤 — 읽는 사이 흐른 시간보다 넉넉하게). 300ms 저장 타이머보다
 * 짧아 그 타이머는 안 돈다. 풀 때는 `page.clock.resume()`
 */
async function holdTimers(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
}

async function typeInRoom(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await expect(composer(page)).toHaveValue(text);
}

/** `sessionStorage.setItem`이 던지게(용량 초과 흉내). 이미 뜬 문서에 건다 */
async function breakSetItem(page: Page): Promise<void> {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("막힌 저장소", "QuotaExceededError");
    };
  });
}

async function breakRemoveItem(page: Page): Promise<void> {
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => {
      throw new DOMException("막힌 저장소", "SecurityError");
    };
  });
}

test.beforeEach(async ({ page }) => {
  await enterChats(page);
});

test("S3-2 방 1 글 → 방 2 빈칸 → 방 1 같은 글", async ({ page }) => {
  await openRoomReady(page, ROOM_1);
  await typeInRoom(page, TEXT_1);
  await openRoomReady(page, ROOM_2);
  await expect(composer(page)).toHaveValue("");
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue(TEXT_1);
});

test("S3-3 방 1 입력 직후(저장 타이머 전) 방 2 → 방 2 빈칸, B 글 → 방 1은 방 1 글만, 키가 각자 글", async ({
  page,
}) => {
  await openRoomReady(page, ROOM_1);
  await holdTimers(page);
  await typeInRoom(page, TEXT_1);
  await page.locator(`a[data-room-id="${ROOM_2}"]`).click();
  await expect(page).toHaveURL(/[?&]room=2(&|$)/);
  /* 아직 시계가 멈춰 있다 — 300ms 타이머는 안 돌았다. 그래도 방 1 키가 있으면 언마운트 즉시 저장이다 */
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);
  await page.clock.resume();
  await expect(composer(page)).toHaveValue("");
  await typeInRoom(page, "B 글");
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue(TEXT_1);
  expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);
  expect(await storedDraft(page, keyOf(ME, ROOM_2))).toBe("B 글");
});

test("S3-4 이탈 저장 — 새로고침, 업무 화면 왕복, 보낸 뒤 새로고침", async ({
  page,
}) => {
  await test.step("저장 타이머 전 새로고침 → 같은 글", async () => {
    await openRoomReady(page, ROOM_1);
    await holdTimers(page);
    await typeInRoom(page, TEXT_1);
    await page.reload();
    await page.clock.resume();
    await expect(composer(page)).toHaveValue(TEXT_1);
  });

  await test.step("저장 타이머 전 상단 메뉴 주문 → 채팅 → 방 1 → 같은 글", async () => {
    await typeInRoom(page, `${TEXT_1} 2`);
    await holdTimers(page);
    await page.getByRole("link", { name: "주문", exact: true }).click();
    await page.waitForURL(/\/orders/);
    expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBe(`${TEXT_1} 2`);
    await page.clock.resume();
    await gotoChats(page);
    await openRoomReady(page, ROOM_1);
    await expect(composer(page)).toHaveValue(`${TEXT_1} 2`);
  });

  await test.step("Enter로 보냄 → 바로 새로고침 → 빈칸, 키 없음", async () => {
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue("");
    await page.reload();
    await expect(composer(page)).toHaveValue("");
    expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBeNull();
  });
});

test("S3-5 글을 다 지우면 300ms 뒤 키 없음", async ({ page }) => {
  await openRoomReady(page, ROOM_1);
  await typeInRoom(page, TEXT_1);
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);
  await composer(page).fill("");
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBeNull();
  expect(await draftKeys(page)).toEqual([]);
});

test("S3-6 로그아웃 → 다른 계정 → 방 1 빈칸 → 로그아웃 → 처음 계정 → 빈칸, 키 0", async ({
  page,
}) => {
  await openRoomReady(page, ROOM_1);
  await typeInRoom(page, TEXT_1);
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);

  await signOut(page);
  expect(await draftKeys(page)).toEqual([]);
  await signIn(page, OTHER);
  await gotoChats(page);
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue("");

  await signOut(page);
  await signIn(page, ME);
  await gotoChats(page);
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue("");
  expect(await draftKeys(page)).toEqual([]);
});

test("S3-7 messages 401로 세션 끊김 → 글과 키 그대로(읽기 전용)", async ({
  page,
}) => {
  await openRoomReady(page, ROOM_1);
  await typeInRoom(page, TEXT_1);
  await expect.poll(() => storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);
  await knob(page, "fail", { op: "messages", status: 401 });
  await expect(
    page.getByRole("alert").filter({ hasText: "로그인이 끊겼어요" }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(composer(page)).toHaveValue(TEXT_1);
  await expect(composer(page)).toHaveAttribute("readonly", "");
  expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBe(TEXT_1);
});

test("S3-8 setItem이 던져도 방 1 글 → 방 2 → 방 1 글 그대로, pageerror 0", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await breakSetItem(page);
  await openRoomReady(page, ROOM_1);
  await typeInRoom(page, TEXT_1);
  await openRoomReady(page, ROOM_2);
  await expect(composer(page)).toHaveValue("");
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue(TEXT_1);
  expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBeNull();
  expect(errors).toEqual([]);
});

test("S3-9 방 1 키에 남은 글 → 열면 첫 화면부터 남은 글, 방 1 키로 빈 값 setItem 0", async ({
  page,
}) => {
  await page.evaluate(
    (key) => {
      window.sessionStorage.setItem(key, "남은 글");
      const calls: { key: string; value: string }[] = [];
      (window as unknown as { __setCalls: typeof calls }).__setCalls = calls;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        calls.push({ key: k, value: v });
        original.call(this, k, v);
      };
    },
    keyOf(ME, ROOM_1),
  );
  await openRoomReady(page, ROOM_1);
  await expect(composer(page)).toHaveValue("남은 글");
  /* 방이 다 그려진 뒤(말풍선까지) 기록을 본다 */
  await expect(bubbles(page).first()).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __setCalls: { key: string; value: string }[] })
        .__setCalls,
  );
  expect(calls.filter((c) => c.key === keyOf(ME, ROOM_1))).toEqual([]);
  expect(await storedDraft(page, keyOf(ME, ROOM_1))).toBe("남은 글");
});

test("S3-10 S3-11 실패 말풍선은 방 왕복 뒤에도 1개, 다시 보내기는 처음 clientMessageId", async ({
  page,
}) => {
  const sends = captureSends(page);
  const body = "30장이면 장당 500원 빼 드릴게요";
  await openRoomReady(page, ROOM_1);
  await knob(page, "fail", { op: "send", status: 500 });
  await typeInRoom(page, body);
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveCount(1);
  await expect(pendingBubbles(page).first()).toHaveAttribute(
    "data-pending",
    "failed",
  );

  await openRoomReady(page, ROOM_2);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await openRoomReady(page, ROOM_1);
  await expect(pendingBubbles(page)).toHaveCount(1);
  await expect(pendingBubbles(page).first()).toHaveAttribute(
    "data-pending",
    "failed",
  );
  await expect(pendingBubbles(page).first()).toContainText(body);
  await expect(composer(page)).toHaveValue("");

  await test.step("S3-11 다시 보내기 → POST 1회, 같은 키, 말풍선 1개", async () => {
    expect(sends).toHaveLength(1);
    await pendingBubbles(page)
      .first()
      .getByRole("button", { name: "다시 보내기" })
      .click();
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(bubbles(page).filter({ hasText: body })).toHaveCount(1);
    expect(sends).toHaveLength(2);
    expect(sends[0]?.key).toBeTruthy();
    expect(sends[1]?.key).toBe(sends[0]?.key);
    expect(sends.map((s) => s.roomId)).toEqual([ROOM_1, ROOM_1]);
  });
});

test("S3-12 보내는 중에 방 2로 → 방 2엔 0, 방 1로 돌아오면 보내는 중이거나 보낸 것, 끝나면 1개, 보류 0", async ({
  page,
}) => {
  const body = "보내는 중에 옮긴 글";
  await openRoomReady(page, ROOM_1);
  await knob(page, "delay", { op: "send", ms: 3000 });
  await typeInRoom(page, body);
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveCount(1);

  await openRoomReady(page, ROOM_2);
  await expect(bubbles(page).first()).toBeVisible();
  await expect(log(page).getByText(body)).toHaveCount(0);
  await expect(pendingBubbles(page)).toHaveCount(0);

  await openRoomReady(page, ROOM_1);
  /* 응답 전이면 "보내는 중" 보류 말풍선, 그 사이 polling이 먼저 가져왔으면 서버 말풍선. 어느 쪽이든 1개 */
  await expect(log(page).getByText(body, { exact: true })).toHaveCount(1);
  await expect(pendingBubbles(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(bubbles(page).filter({ hasText: body })).toHaveCount(1);

  await openRoomReady(page, ROOM_2);
  await expect(bubbles(page).first()).toBeVisible();
  await expect(log(page).getByText(body)).toHaveCount(0);
});

test("S3-13 ① 옛 글 + 쓰기 실패 → 새 글 유지 ② 메모리 대체와 실패 말풍선 → 로그아웃 → 재로그인 → 빈칸, 보류 0", async ({
  page,
}) => {
  const errors = collectPageErrors(page);

  await test.step("① 저장소 옛 글보다 메모리 새 글이 먼저", async () => {
    await page.evaluate(
      (key) => window.sessionStorage.setItem(key, "옛 글"),
      keyOf(ME, ROOM_1),
    );
    await breakSetItem(page);
    await openRoomReady(page, ROOM_1);
    await expect(composer(page)).toHaveValue("옛 글");
    await typeInRoom(page, "새 글");
    await openRoomReady(page, ROOM_2);
    await openRoomReady(page, ROOM_1);
    await expect(composer(page)).toHaveValue("새 글");
  });

  await test.step("② 실패 말풍선 하나를 두고 로그아웃 → 같은 계정 → 빈칸, 보류 0", async () => {
    await openRoomReady(page, ROOM_2);
    await knob(page, "fail", { op: "send", status: 500 });
    await typeInRoom(page, "실패할 글");
    await composer(page).press("Enter");
    await expect(pendingBubbles(page)).toHaveCount(1);
    await openRoomReady(page, ROOM_1);
    await expect(composer(page)).toHaveValue("새 글");

    await breakRemoveItem(page);
    await signOut(page);
    await signIn(page, ME);
    await gotoChats(page);
    await openRoomReady(page, ROOM_1);
    await expect(composer(page)).toHaveValue("");
    await openRoomReady(page, ROOM_2);
    await expect(bubbles(page).first()).toBeVisible();
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
