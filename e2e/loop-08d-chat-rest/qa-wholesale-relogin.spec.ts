import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  composer,
  enterChats,
  knob,
  lostAlert,
  ME,
  openLongRoom,
  openRoomReady,
  openSecondTab,
  pendingBubbles,
  removeSend,
  retrySend,
  signIn,
  historyButton,
} from "./helpers";

/**
 * loop-08d QA — S2(#344) 도매 화면을 1470, 1280에서 본다. 개발 spec이 단언한 상태를 사람 눈으로 확인하는 스크린샷과,
 * 개발 spec이 다루지 않은 칸 하나(지금 세션 401로 실패한 말풍선이 같은 계정 재로그인 뒤 어떻게 보이나)를 기록한다.
 * 스크린샷: .claude/harness/runs/loop-08d-chat-rest/qa/s2-*.png
 */

const SHOTS = ".claude/harness/runs/loop-08d-chat-rest/qa";

async function relogin(page: Page) {
  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await tab.close();
  await page.bringToFront();
}

for (const width of [1470, 1280]) {
  test(`QA S2-1 ${width} 늦은 401 → 재로그인 → 실패 말풍선, 끊김 줄 0`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterChats(page, { email: ME });
    await openRoomReady(page, 1);
    await knob(page, "fail", { op: "send", status: 401 });
    await knob(page, "delay", { op: "send", ms: 3_000 });
    await composer(page).fill("QA 재로그인 넘긴 글");
    await composer(page).press("Enter");
    await relogin(page);
    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "failed",
      { timeout: 8_000 },
    );
    await expect(lostAlert(page)).toHaveCount(0);
    await expect(retrySend(pendingBubbles(page))).toBeVisible();
    /* 실패 말풍선이 log 안에 다 보이는지(입력창에 가리지 않음) */
    const inside = await pendingBubbles(page).evaluate((el) => {
      const b = el.getBoundingClientRect();
      const log = el.closest('[role="log"]')!.getBoundingClientRect();
      return b.bottom <= log.bottom + 1 && b.top >= log.top - 1;
    });
    expect(inside).toBe(true);
    await page.screenshot({ path: `${SHOTS}/s2-1-wholesale-${width}.png` });
  });
}

test("QA S2-5 1280 잠긴 동안 실패 말풍선은 지우기만, 맨 위 자리 잠김", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLongRoom(page);
  await knob(page, "fail", { op: "send", status: 500 });
  await knob(page, "delay", { op: "send", ms: 3_000 });
  await composer(page).fill("QA 잠긴 뒤 실패 글");
  await composer(page).press("Enter");
  await knob(page, "fail", { op: "messages", page: "before", status: 401 });
  await historyButton(page).click();
  await expect(lostAlert(page).first()).toBeVisible({ timeout: 5_000 });
  await expect(pendingBubbles(page)).toHaveAttribute("data-pending", "failed", {
    timeout: 8_000,
  });
  await expect(retrySend(pendingBubbles(page))).toHaveCount(0);
  await expect(removeSend(pendingBubbles(page))).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/s2-5-wholesale-1280.png` });
});

/**
 * F1(D48): 지금 세션 401로 실패한 말풍선은 잠긴 동안 `지우기`만, 같은 계정 재로그인으로 잠금이 풀리면
 * `다시 보내기`가 생긴다. 다시 보내기는 처음 `clientMessageId` 그대로라 서버엔 하나만 생긴다.
 * QA가 처음엔 관찰(다시 보내기 0)로만 남긴 칸이다.
 */
test("F1 401 실패 말풍선 → 같은 계정 재로그인 → 다시 보내기 → 서버 말풍선 1, 보류 0", async ({
  page,
}) => {
  await enterChats(page, { email: ME });
  await openRoomReady(page, 1);
  await knob(page, "fail", { op: "send", status: 401 });
  await composer(page).fill("QA 첫 글");
  await composer(page).press("Enter");
  await expect(lostAlert(page).first()).toBeVisible({ timeout: 5_000 });
  const failed = pendingBubbles(page).filter({ hasText: "QA 첫 글" });
  await expect(retrySend(failed)).toHaveCount(0);
  await relogin(page);
  await expect(composer(page)).not.toHaveAttribute("readonly", "", {
    timeout: 5_000,
  });
  await expect(failed).toHaveCount(1);
  await expect(retrySend(failed)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/s2-2-after-relogin-1470.png` });
  await retrySend(failed).click();
  await expect(failed).toHaveCount(0, { timeout: 5_000 });
  await expect(bubbles(page).filter({ hasText: "QA 첫 글" })).toHaveCount(1);
  await expect(lostAlert(page)).toHaveCount(0);
});
