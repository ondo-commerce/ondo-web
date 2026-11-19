import { expect, test } from "@playwright/test";
import {
  alignTop,
  assertStubServers,
  count,
  incoming,
  log,
  logMetrics,
  openHistoryRoom,
  READ_POST,
} from "./retail-history-helpers";

/**
 * loop-08d QA — Codex 리뷰 R3을 브라우저로 본다(03-review.md). `pnpm e2e:stub`.
 *
 * R3: 위를 읽다 새 메시지 → log 포커스에서 End로 바닥 → 버튼 0, 읽음 1. 포커스는 **log에 남는다**(D48 accept:
 *     키보드로 직접 바닥에 내려온 사장은 log에서 계속 읽는다. 입력창으로 옮기는 건 `새 메시지 N개` 버튼일 때만, 도매와 같다).
 * R1(떠난 방의 늦은 이전 장 401) 재현은 #351 `retail-chat-history-race.spec.ts` "R1"로 옮겼다 — #351 기능이고 거기서 고쳤다.
 */

assertStubServers();

test.use({ viewport: { width: 1280, height: 800 } });

test("R3 위를 읽다 새 메시지 → log에 포커스 → End로 바닥 → 버튼 0, 읽음 1, 포커스는 log 유지(D48)", async ({
  page,
}) => {
  await openHistoryRoom(page);
  await page.waitForTimeout(1500);
  await alignTop(page, 100);
  await incoming(page, 1, "위를 읽는 중 온 답");
  await expect(log(page).locator('[data-sequence="121"]')).toBeAttached({
    timeout: 8000,
  });
  const jump = page.locator('button[data-ac~="08d:S4-2"]');
  await expect(jump).toBeVisible();
  const readsBefore = await count(page, READ_POST);

  await log(page).focus();
  await page.keyboard.press("End");
  await expect
    .poll(async () => (await logMetrics(page)).fromBottom)
    .toBeLessThanOrEqual(1);
  await expect(jump).toHaveCount(0);
  await expect.poll(() => count(page, READ_POST)).toBe(readsBefore + 1);
  await expect(log(page)).toBeFocused();
});
