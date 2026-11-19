import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  chatRows,
  composer,
  count,
  draftKeys,
  enterChats,
  knob,
  ME,
  MESSAGES_GET,
  openRoomReady,
  OTHER,
  pendingBubbles,
  requests,
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

const LOST_ALERT = "로그인이 끊겼어요";

test("M2 탭 1 A 방 401로 잠김(쓰던 글 있음) → 탭 2 A 재로그인 → 탭 1은 로그아웃 없이 잠김 풀림, 쓰던 글 그대로, polling 다시", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  await knob(page, "fail", { op: "messages", status: 401 });
  await expect(
    page.getByRole("alert").filter({ hasText: LOST_ALERT }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(composer(page)).toHaveAttribute("readonly", "");
  const lockedAt = await count(page, MESSAGES_GET);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);

  await page.bringToFront();
  await expect(composer(page)).not.toHaveAttribute("readonly", "", {
    timeout: 5_000,
  });
  await expect(page).toHaveURL(/\/chats/);
  await expect(composer(page)).toHaveValue("A가 쓰던 글");
  await expect(
    page.getByRole("alert").filter({ hasText: LOST_ALERT }),
  ).toHaveCount(0);
  await expect
    .poll(() => count(page, MESSAGES_GET), { timeout: 10_000 })
    .toBeGreaterThan(lockedAt);
});

test("M2 재로그인 전에 떠난 A 방 요청의 늦은 401(지연 3초) → 탭 2 A 재로그인 뒤 도착해도 탭 1은 안 잠긴다", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  await knob(page, "fail", { op: "messages", status: 401 });
  await knob(page, "delay", { op: "messages", ms: 3_000 });
  /* 지연에 물린 messages 요청이 하나 날아가는 중 */
  await expect
    .poll(
      async () =>
        (await requests(page, MESSAGES_GET)).some((r) => r.status === null),
      { timeout: 8_000 },
    )
    .toBe(true);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);

  await page.bringToFront();
  await expect
    .poll(
      async () =>
        (await requests(page, MESSAGES_GET)).some((r) => r.status === 401),
      { timeout: 8_000 },
    )
    .toBe(true);
  await page.waitForTimeout(1_000);
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  await expect(composer(page)).toHaveValue("A가 쓰던 글");
  await expect(
    page.getByRole("alert").filter({ hasText: LOST_ALERT }),
  ).toHaveCount(0);
});

test("M6 보내기 응답 지연 중 탭 2 같은 A 재로그인 → POST 500 도착 → 탭 1 보류 말풍선이 실패로 끝나 다시 보내기, 지우기 보임", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  await knob(page, "fail", { op: "send", status: 500 });
  await knob(page, "delay", { op: "send", ms: 3_000 });
  await composer(page).fill("늦게 실패할 글");
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveCount(1);
  await expect(pendingBubbles(page)).toContainText("보내는 중");

  const tab = await openSecondTab(page);
  await signIn(tab, ME);

  await page.bringToFront();
  await expect(pendingBubbles(page)).toContainText("못 보냈어요", {
    timeout: 8_000,
  });
  await expect(
    pendingBubbles(page).getByRole("button", { name: /다시 보내기/ }),
  ).toBeVisible();
  await expect(
    pendingBubbles(page).getByRole("button", { name: /지우기/ }),
  ).toBeVisible();
});

test("M6 보내기 응답 지연 중 같은 A 재로그인 → POST 성공 도착 → 보류 말풍선 0, 서버 말풍선 1", async ({
  page,
}) => {
  await tabOneWithRoom(page);
  await knob(page, "delay", { op: "send", ms: 3_000 });
  await composer(page).fill("늦게 성공할 글");
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveCount(1);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);

  await page.bringToFront();
  await expect(pendingBubbles(page)).toHaveCount(0, { timeout: 8_000 });
  await expect(bubbles(page).filter({ hasText: "늦게 성공할 글" })).toHaveCount(
    1,
  );
});

/** 목이 돌려준 계획 실패(`GET /__mock/chat/log`, loop-08d S1). 브라우저가 취소한 요청도 목은 끝까지 돌고 적는다 */
async function plannedFailures(
  page: Page,
): Promise<{ op: string; status: number; delayMs: number }[]> {
  return page.evaluate(async () => {
    const r = await fetch("/__mock/chat/log");
    return ((await r.json()) as { data: never[] }).data;
  });
}

/*
 * M7, loop-08d S2-4(M10). 옛 요청을 **늦은 401**로 끝낸다 — 지연만 걸면 옛 요청이 200으로 끝나 화면이 그려져,
 * `refreshChatSession`의 취소 줄을 지워도 통과했다(08c 메타 M10). 첫 조회는 캐시에 값이 없어 TanStack
 * `invalidateQueries`의 `cancelRefetch`가 날아가던 요청을 취소하지 않고 그 promise를 그대로 쓴다 — 취소 줄이 없으면
 * 옛 401(버려짐)로 끝나고 다시 조회가 없다.
 * 관찰은 둘로 나눠 따로 단언한다: ① 방송 뒤 시작한 새 GET 200과 화면 회복 ② 목 기록의 지연된 401 1건.
 * 옛 요청이 브라우저에서 401로 보였는지 취소로 보였는지는 묻지 않는다
 */
test("M7 S2-4 방 첫 messages GET 지연 401 중 같은 A 재로그인 → 새 GET 200으로 말풍선, 쓰기 가능, 끊김 0 / 목 기록 지연 401 1건", async ({
  page,
}) => {
  await enterChats(page, { email: ME });
  await knob(page, "fail", { op: "messages", status: 401, times: 1 });
  await knob(page, "delay", { op: "messages", ms: 3_000, times: 1 });
  await page.locator(`a[data-room-id="${ROOM_1}"]`).click();
  await expect(bubbles(page)).toHaveCount(0);
  await expect
    .poll(async () => (await requests(page, MESSAGES_GET)).length)
    .toBe(1);

  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await page.bringToFront();

  /* ① 첫 요청(지연된 옛 요청) 뒤에 시작한 GET 중 200이 있고, 화면이 돌아왔다 */
  await expect
    .poll(
      async () =>
        (await requests(page, MESSAGES_GET))
          .slice(1)
          .some((r) => r.status === 200),
      { timeout: 8_000 },
    )
    .toBe(true);
  await expect(bubbles(page).first()).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  await expect(
    page.getByRole("alert").filter({ hasText: LOST_ALERT }),
  ).toHaveCount(0);

  /* ② 옛 요청은 목에서 지연된 401로 끝났다 */
  await expect
    .poll(
      async () =>
        (await plannedFailures(page)).filter(
          (f) => f.op === "messages" && f.status === 401 && f.delayMs > 0,
        ).length,
      { timeout: 8_000 },
    )
    .toBe(1);
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
