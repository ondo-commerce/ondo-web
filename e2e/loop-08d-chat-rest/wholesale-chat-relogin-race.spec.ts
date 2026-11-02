import { expect, test, type Page } from "@playwright/test";
import {
  BEFORE_GET,
  bubbles,
  composer,
  count,
  drawnSequences,
  enterChats,
  expectWritable,
  firstVisible,
  historyButton,
  historyEnd,
  historyFail,
  knob,
  lostAlert,
  ME,
  MESSAGES_GET,
  openLongRoom,
  openRoomReady,
  openSecondTab,
  pendingBubbles,
  plannedFailures,
  removeSend,
  requests,
  retrySend,
  SEND_POST,
  signIn,
  topOf,
  waitBubbles,
} from "./helpers";

/**
 * loop-08d S2(#344) 도매 같은 계정 재로그인 경합. 01-plan §4-1 상태표 "같은 계정 재로그인" 행과
 * "잠긴 뒤 도착한 늦은 결과" 행, §4-2.
 *
 * 탭 2의 같은 계정 로그인 = `refreshChatSession`(세션 세대만 오름). 그 전에 떠난 요청의 늦은 결과가 새 세션을
 * 해치지 않는지 본다: 보내기 401(M8), 이전 장 200, 500, 401(M9).
 */

const ROOM_1 = 1;

async function sameAccountRelogin(page: Page): Promise<void> {
  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await page.bringToFront();
}

/** 방 1을 열고 입력창까지(기본 시드) */
async function openRoomOne(page: Page): Promise<void> {
  await enterChats(page, { email: ME });
  await openRoomReady(page, ROOM_1);
  await expect(bubbles(page).first()).toBeVisible();
}

async function lastSendStatus(page: Page): Promise<number | null | undefined> {
  return (await requests(page, SEND_POST)).at(-1)?.status;
}

/** before 요청 i번째의 응답 상태(아직이면 null) */
async function beforeStatus(page: Page, i: number) {
  return (await requests(page, BEFORE_GET))[i]?.status ?? null;
}

/** 일정 시간 동안 요청 수가 그대로인지 */
async function expectNoMoreMessageGets(page: Page, ms: number) {
  const at = await count(page, MESSAGES_GET);
  await page.waitForTimeout(ms);
  expect(await count(page, MESSAGES_GET), "잠긴 뒤 messages 요청").toBe(at);
}

test.describe("S2-1 M8 [같은 계정, 보내기]", () => {
  test("보내기 지연 401 → 탭 2 같은 계정 로그인 → 끊김 0, 실패 말풍선 → 다시 보내기 201, 말풍선 1, polling 계속", async ({
    page,
  }) => {
    await openRoomOne(page);
    await knob(page, "fail", { op: "send", status: 401 });
    await knob(page, "delay", { op: "send", ms: 3_000 });
    await composer(page).fill("재로그인 넘긴 글");
    await composer(page).press("Enter");
    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "sending",
    );

    await sameAccountRelogin(page);

    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "failed",
      { timeout: 8_000 },
    );
    expect(await lastSendStatus(page)).toBe(401);
    await page.waitForTimeout(500);
    await expect(lostAlert(page)).toHaveCount(0);
    await expectWritable(composer(page));
    await expect(retrySend(pendingBubbles(page))).toBeVisible();
    await expect(removeSend(pendingBubbles(page))).toBeVisible();

    await retrySend(pendingBubbles(page)).click();
    await expect.poll(() => lastSendStatus(page)).toBe(201);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(
      bubbles(page).filter({ hasText: "재로그인 넘긴 글" }),
    ).toHaveCount(1);
    const at = await count(page, MESSAGES_GET);
    await expect
      .poll(() => count(page, MESSAGES_GET), { timeout: 10_000 })
      .toBeGreaterThan(at);
  });
});

test.describe("S2-2 대조 [지금 세션 401, 보내기와 쓰던 글]", () => {
  test("첫 글 지연 401 → 두 번째 초안 → 끊김, 실패 말풍선 지우기만, 초안 읽기 전용, 요청 0 → 같은 계정 재로그인 → 쓰기 가능", async ({
    page,
  }) => {
    await openRoomOne(page);
    await knob(page, "fail", { op: "send", status: 401 });
    await knob(page, "delay", { op: "send", ms: 3_000 });
    await composer(page).fill("첫 글");
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue("");
    await composer(page).fill("두 번째 초안");

    await expect(lostAlert(page).first()).toBeVisible({ timeout: 8_000 });
    const failed = pendingBubbles(page).filter({ hasText: "첫 글" });
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(retrySend(failed)).toHaveCount(0);
    await expect(removeSend(failed)).toBeVisible();
    await expect(composer(page)).toHaveValue("두 번째 초안");
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await expectNoMoreMessageGets(page, 4_000);

    await sameAccountRelogin(page);
    await expect(composer(page)).not.toHaveAttribute("readonly", "", {
      timeout: 5_000,
    });
    await expect(composer(page)).toHaveValue("두 번째 초안");
  });
});

test.describe("S2-3 M9 [같은 계정, 이전 장]", () => {
  /** A = 늦춘 before 71. 출발 → 같은 계정 로그인 → 자리가 `이전 메시지 보기`로 돌아옴 */
  async function startLateOlder(page: Page): Promise<void> {
    await historyButton(page).click();
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    expect(await count(page, BEFORE_GET)).toBe(1);
    await sameAccountRelogin(page);
    await expect(historyButton(page)).toHaveText("이전 메시지 보기", {
      timeout: 5_000,
    });
    await expect(historyButton(page)).not.toHaveAttribute("aria-busy", "true");
  }

  test("① A 200이 B, C 뒤에 도착 → 버튼 0, 대화 처음이에요, 120개 각 1개, 위치 이동 ≤ 4px", async ({
    page,
  }) => {
    await openLongRoom(page);
    /* B, C 두 번 누르는 동안 A가 안 끝나게 6초(기획 3초는 B 하나 기준) */
    await knob(page, "delay", {
      op: "messages",
      page: "before",
      ms: 6_000,
      times: 1,
    });
    await startLateOlder(page);

    await historyButton(page).click();
    await waitBubbles(page, 100);
    await historyButton(page).click();
    await waitBubbles(page, 120);
    await expect(historyEnd(page)).toBeVisible();
    expect(await beforeStatus(page, 0), "A가 C보다 먼저 끝남").toBeNull();

    const anchor = await firstVisible(page);
    const top = await topOf(page, anchor);
    await expect
      .poll(() => beforeStatus(page, 0), { timeout: 10_000 })
      .toBe(200);
    await page.waitForTimeout(2_000);

    await expect(historyButton(page)).toHaveCount(0);
    await expect(historyEnd(page)).toBeVisible();
    const seqs = await drawnSequences(page);
    expect(seqs).toHaveLength(120);
    expect(new Set(seqs).size).toBe(120);
    expect(Math.abs((await topOf(page, anchor)) - top)).toBeLessThanOrEqual(4);
  });

  test("② A 500이 B 진행 중 도착 → 그 자리 불러오는 중 그대로, 실패 줄 0 → B 도착 → 21~70", async ({
    page,
  }) => {
    await openLongRoom(page);
    await knob(page, "fail", { op: "messages", page: "before", status: 500 });
    await knob(page, "delay", { op: "messages", page: "before", ms: 4_000 });
    await startLateOlder(page);

    await knob(page, "delay", { op: "messages", page: "before", ms: 5_000 });
    await historyButton(page).click();
    await expect
      .poll(() => beforeStatus(page, 0), { timeout: 10_000 })
      .toBe(500);
    expect(await beforeStatus(page, 1), "B가 A보다 먼저 끝남").toBeNull();
    await page.waitForTimeout(300);
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");
    await expect(historyFail(page)).toHaveCount(0);

    await waitBubbles(page, 100);
    await expect(historyFail(page)).toHaveCount(0);
    const seqs = await drawnSequences(page);
    expect(seqs[0]).toBe(21);
  });

  test("③ A 401이 B 뒤에 도착 → 끊김 0, 쓰기 가능, 자리 이전 메시지 보기, polling 계속", async ({
    page,
  }) => {
    await openLongRoom(page);
    await knob(page, "fail", { op: "messages", page: "before", status: 401 });
    await knob(page, "delay", { op: "messages", page: "before", ms: 6_000 });
    await startLateOlder(page);

    await historyButton(page).click();
    await waitBubbles(page, 100);
    await expect
      .poll(
        async () =>
          (await plannedFailures(page)).filter(
            (f) => f.page === "before" && f.status === 401,
          ).length,
        { timeout: 10_000 },
      )
      .toBe(1);
    await page.waitForTimeout(1_000);

    await expect(lostAlert(page)).toHaveCount(0);
    await expectWritable(composer(page));
    await expect(historyButton(page)).toHaveText("이전 메시지 보기");
    const at = await count(page, MESSAGES_GET);
    await expect
      .poll(() => count(page, MESSAGES_GET), { timeout: 10_000 })
      .toBeGreaterThan(at);
  });
});

test.describe("S2-5 [잠긴 뒤 늦은 결과]", () => {
  /** 보내기를 늦춰 둔 채 이전 장 401로 잠근다 */
  async function sendThenLockByOlder(page: Page, text: string) {
    await composer(page).fill(text);
    await composer(page).press("Enter");
    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "sending",
    );
    await knob(page, "fail", { op: "messages", page: "before", status: 401 });
    await historyButton(page).click();
    await expect(lostAlert(page).first()).toBeVisible({ timeout: 5_000 });
    await expect(composer(page)).toHaveAttribute("readonly", "");
  }

  test("① 늦은 보내기 201 → 보류 0, 서버 말풍선 1, 끊김 그대로, 읽기 전용", async ({
    page,
  }) => {
    await openLongRoom(page);
    await knob(page, "delay", { op: "send", ms: 4_000 });
    await sendThenLockByOlder(page, "잠긴 뒤 성공 글");

    await expect.poll(() => lastSendStatus(page), { timeout: 8_000 }).toBe(201);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(
      bubbles(page).filter({ hasText: "잠긴 뒤 성공 글" }),
    ).toHaveCount(1);
    await expect(lostAlert(page).first()).toBeVisible();
    await expect(composer(page)).toHaveAttribute("readonly", "");
  });

  test("① 늦은 보내기 500 → 실패 말풍선, 다시 보내기 못 누름, 지우기 됨 → 같은 계정 로그인 → 다시 보내기 201", async ({
    page,
  }) => {
    await openLongRoom(page);
    await knob(page, "fail", { op: "send", status: 500 });
    await knob(page, "delay", { op: "send", ms: 4_000 });
    await sendThenLockByOlder(page, "잠긴 뒤 실패 글");

    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "failed",
      { timeout: 8_000 },
    );
    await expect(retrySend(pendingBubbles(page))).toHaveCount(0);
    await expect(removeSend(pendingBubbles(page))).toBeEnabled();
    expect(await count(page, SEND_POST)).toBe(1);

    await sameAccountRelogin(page);
    await expect(retrySend(pendingBubbles(page))).toBeVisible({
      timeout: 5_000,
    });
    await retrySend(pendingBubbles(page)).click();
    await expect.poll(() => lastSendStatus(page)).toBe(201);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(
      bubbles(page).filter({ hasText: "잠긴 뒤 실패 글" }),
    ).toHaveCount(1);
  });

  test("② 이전 장 지연 중 보내기 401로 끊김 → 이전 장 200 도착 → 붙은 말풍선 보임, 자리 잠김, polling 0", async ({
    page,
  }) => {
    await openLongRoom(page);
    await knob(page, "delay", { op: "messages", page: "before", ms: 4_000 });
    await historyButton(page).click();
    await expect(historyButton(page)).toHaveAttribute("aria-busy", "true");

    await knob(page, "fail", { op: "send", status: 401 });
    await composer(page).fill("이전 장 중 끊긴 글");
    await composer(page).press("Enter");
    await expect(lostAlert(page).first()).toBeVisible({ timeout: 5_000 });

    await expect
      .poll(() => beforeStatus(page, 0), { timeout: 8_000 })
      .toBe(200);
    await waitBubbles(page, 100);
    await expect(
      bubbles(page).and(page.locator('[data-sequence="21"]')),
    ).toHaveCount(1);
    await expect(historyButton(page)).toBeDisabled();
    await expect(historyButton(page)).toHaveAttribute("data-ac", "08c:S2-5");
    await expectNoMoreMessageGets(page, 4_000);
  });
});
