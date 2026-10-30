import { describe, expect, it } from "vitest";
import {
  failedCounts,
  headerBackoffMs,
  headerPollDelayMs,
  isStaleCount,
  withUnreadNotifications,
  type HeaderCounts,
} from "./headerCounts";

/*
 * 헤더 count 규칙. 06a(loop-06 S2-3, S2-6 나)에서 `features/chat/derive.nav.test.ts`에 있던 케이스를 규칙과 함께
 * 옮겼다(06b #305). 도매 `features/notification/derive.test.ts`의 `headerBackoffMs` 경계값과 같은 케이스다.
 */

const ok = (chats: number, notifications = 0): HeaderCounts => ({
  kind: "ok",
  chats,
  notifications,
  latestNotificationId: null,
  started: 1,
});

describe("06a S2-3 headerBackoffMs, headerPollDelayMs — 주기와 멈춤", () => {
  it("실패 0 → 30초, 1 → 60초, 2 → 120초, 3 이상 → 300초", () => {
    expect(headerBackoffMs(0)).toBe(30_000);
    expect(headerBackoffMs(1)).toBe(60_000);
    expect(headerBackoffMs(2)).toBe(120_000);
    expect(headerBackoffMs(3)).toBe(300_000);
    expect(headerBackoffMs(10)).toBe(300_000);
  });

  it("성공과 처음은 30초, 실패는 연속 수만큼, 401/403 멈춤은 false", () => {
    expect(headerPollDelayMs(undefined)).toBe(30_000);
    expect(headerPollDelayMs(ok(1))).toBe(30_000);
    expect(headerPollDelayMs({ kind: "failed", failures: 2 })).toBe(120_000);
    expect(headerPollDelayMs({ kind: "stopped" })).toBe(false);
  });

  it("failedCounts — 성공 뒤 첫 실패는 1, 실패가 이어지면 +1", () => {
    expect(failedCounts(undefined)).toEqual({ kind: "failed", failures: 1 });
    expect(failedCounts(ok(4))).toEqual({ kind: "failed", failures: 1 });
    expect(failedCounts({ kind: "failed", failures: 2 })).toEqual({
      kind: "failed",
      failures: 3,
    });
  });
});

describe("06a S2-6 (나) isStaleCount — 읽음 전에 떠난 count", () => {
  it("울타리 안쪽(같은 순번 포함)에서 시작한 응답은 버리고 밖은 받는다", () => {
    // 1번 count 시작 → 읽음 성공(울타리 = 1) → 2번 count 시작
    expect(isStaleCount(1, 1)).toBe(true);
    expect(isStaleCount(0, 1)).toBe(true);
    expect(isStaleCount(2, 1)).toBe(false);
  });

  it("읽음이 한 번도 없으면(울타리 0) 전부 받는다", () => {
    expect(isStaleCount(1, 0)).toBe(false);
  });
});

describe("06b S2-5 withUnreadNotifications — 읽음 응답을 종 배지에 먼저", () => {
  it("성공 값이면 알림 수만 바꾸고 채팅 수와 순번은 그대로", () => {
    expect(withUnreadNotifications(ok(3, 2), 1)).toEqual(ok(3, 1));
  });

  it("모르는 상태(처음, 실패, 멈춤)는 그대로 — 숫자를 지어내지 않는다", () => {
    expect(withUnreadNotifications(undefined, 1)).toBeUndefined();
    expect(withUnreadNotifications({ kind: "stopped" }, 1)).toEqual({
      kind: "stopped",
    });
    expect(withUnreadNotifications({ kind: "failed", failures: 1 }, 0)).toEqual(
      { kind: "failed", failures: 1 },
    );
  });
});
