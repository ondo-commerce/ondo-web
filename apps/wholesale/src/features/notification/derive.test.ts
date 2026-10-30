import { describe, expect, it } from "vitest";
import {
  bellBadge,
  chatBadge,
  failedCounts,
  flattenPages,
  hasNewer,
  headerBackoffMs,
  headerPollDelayMs,
  markPagesRead,
  newerCount,
  relativeTime,
  toNotificationRow,
  unreadOf,
  withUnread,
} from "./derive";
import type { HeaderCounts, Notification, NotificationPage } from "./types";

const ok = (
  notifications: number,
  chatsNeedingReply = 0,
  latestNotificationId: number | null | undefined = null,
  started = 1,
): HeaderCounts => ({
  kind: "ok",
  notifications,
  chatsNeedingReply,
  latestNotificationId,
  started,
});

/** 첫 장. `countsIssued` = 이 장을 보낼 때까지 나간 count 순번 */
const fetched = (ids: number[], countsIssued: number) => ({
  ...page(ids),
  countsIssued,
});

/** 서울 2026-10-29(목) 15:00 */
const NOW = Date.parse("2026-10-29T15:00:00+09:00");

function notification(over: Partial<Notification> = {}): Notification {
  return {
    id: 1026,
    type: "NEW_ORDER",
    title: "봄봄상회 새 주문",
    body: "빈티지 플라워 셔츠 레드 / M, 1장",
    target: { kind: "ORDER", id: 7006 },
    createdAt: "2026-10-29T15:00:00+09:00",
    readAt: null,
    ...over,
  };
}

function page(
  ids: number[],
  nextCursor: string | null = null,
): NotificationPage {
  return {
    data: ids.map((id) => notification({ id })),
    meta: { nextCursor },
  };
}

describe("S11-2 배지와 접근 이름", () => {
  it("3 → 알약 3, 이름 '알림, 안 읽음 3개'", () => {
    expect(bellBadge(ok(3))).toEqual({
      label: "알림, 안 읽음 3개",
      badge: "3",
    });
  });

  it("0 → 알약 없음, 이름 '알림'", () => {
    expect(bellBadge(ok(0))).toEqual({ label: "알림", badge: null });
  });

  it("99는 그대로, 100부터 알약만 '99+'이고 이름은 실제 수", () => {
    expect(bellBadge(ok(99)).badge).toBe("99");
    expect(bellBadge(ok(100))).toEqual({
      label: "알림, 안 읽음 100개",
      badge: "99+",
    });
  });

  it("채팅 링크는 답 필요 방 수, 단위 '건'", () => {
    expect(chatBadge(ok(3, 2))).toEqual({
      label: "채팅, 답 필요 2건",
      badge: "2",
    });
    expect(chatBadge(ok(3, 0))).toEqual({ label: "채팅", badge: null });
    expect(chatBadge(ok(0, 104)).badge).toBe("99+");
  });

  it("count를 모르면(처음, 실패, 401) 둘 다 숫자 없는 아이콘만(디자인 결정 36)", () => {
    for (const counts of [
      undefined,
      { kind: "failed", failures: 2 } as const,
      { kind: "unauthorized" } as const,
    ]) {
      expect(bellBadge(counts)).toEqual({ label: "알림", badge: null });
      expect(chatBadge(counts)).toEqual({ label: "채팅", badge: null });
    }
  });
});

describe("S11-14 헤더 backoff", () => {
  it("연속 실패 1, 2, 3, 4 → 60, 120, 300, 300초. 0이면 30초", () => {
    expect([0, 1, 2, 3, 4].map(headerBackoffMs)).toEqual([
      30_000, 60_000, 120_000, 300_000, 300_000,
    ]);
  });

  it("실패를 셀 때 직전이 성공이면 1부터, 실패면 +1", () => {
    expect(failedCounts(undefined)).toEqual({ kind: "failed", failures: 1 });
    expect(failedCounts(ok(3))).toEqual({ kind: "failed", failures: 1 });
    expect(failedCounts({ kind: "failed", failures: 2 })).toEqual({
      kind: "failed",
      failures: 3,
    });
  });

  it("다음 간격: 성공 30초, 실패 backoff, 401은 멈춤(S11-13)", () => {
    expect(headerPollDelayMs(ok(3))).toBe(30_000);
    expect(headerPollDelayMs({ kind: "failed", failures: 1 })).toBe(60_000);
    expect(headerPollDelayMs({ kind: "unauthorized" })).toBe(false);
  });
});

describe("S11-12 read 응답을 배지에 먼저", () => {
  it("성공 상태면 notifications만 바꾸고 채팅 수는 그대로", () => {
    expect(withUnread(ok(4, 2), 3)).toEqual(ok(3, 2));
  });

  it("count를 모르는 상태(실패, 401)는 지어내지 않고 그대로", () => {
    const failed: HeaderCounts = { kind: "failed", failures: 1 };
    expect(withUnread(failed, 3)).toBe(failed);
    expect(withUnread(undefined, 3)).toBeUndefined();
    expect(unreadOf(failed)).toBeNull();
  });
});

describe("loop-06b hasNewer: 새 알림 줄은 수가 아니라 latestNotificationId로", () => {
  const first = fetched([1025, 1024], 1);
  it("count id가 첫 행과 다르면 true, 같으면 false", () => {
    expect(hasNewer(ok(4, 0, 1026, 2), first)).toBe(true);
    expect(hasNewer(ok(4, 0, 1025, 2), first)).toBe(false);
  });
  it("칸 없음(구버전 서버) → 끔, null(알림 0) → false", () => {
    expect(hasNewer(ok(4, 0, undefined, 2), first)).toBe(false);
    expect(hasNewer(ok(0, 0, null, 2), first)).toBe(false);
  });
  it("빈 첫 장 + 숫자 id → true", () => {
    expect(hasNewer(ok(1, 0, 1026, 2), fetched([], 1))).toBe(true);
  });
  it("첫 장 요청 전에 떠난 count는 늦게 와도 비교에서 뺀다", () => {
    expect(hasNewer(ok(4, 0, 1020, 1), first)).toBe(false);
    expect(hasNewer(ok(4, 0, 1020, 0), first)).toBe(false);
  });
  it("count를 모르거나 첫 장이 아직 없으면 false", () => {
    expect(hasNewer(undefined, first)).toBe(false);
    expect(hasNewer({ kind: "failed", failures: 1 }, first)).toBe(false);
    expect(hasNewer({ kind: "unauthorized" }, first)).toBe(false);
    expect(hasNewer(ok(4, 0, 1026, 2), undefined)).toBe(false);
  });
});

describe("S11-10 새 알림 N개 보기 — N", () => {
  const first = fetched([1025, 1024], 1);
  it("id가 바뀌었으면 연 때보다 늘어난 수", () => {
    expect(newerCount(3, ok(8, 0, 1030, 2), first)).toBe(5);
    expect(newerCount(3, ok(4, 0, 1026, 2), first)).toBe(1);
  });
  it("05b-2 F3: 연 뒤 다른 기기가 1개 읽고 새 1개 → 수 같아도 1", () => {
    expect(newerCount(3, ok(3, 0, 1026, 2), first)).toBe(1);
  });
  it("id가 그대로면 수가 늘어도 0(새 알림이 아니다)", () => {
    expect(newerCount(3, ok(4, 0, 1025, 2), first)).toBe(0);
  });
  it("연 때 수를 모르면 id만 보고 1", () => {
    expect(newerCount(null, ok(4, 0, 1026, 2), first)).toBe(1);
  });
});

describe("상대 시각(서울)", () => {
  it("1분 안 '방금', 1시간 안 'N분 전', 같은 날 'N시간 전'", () => {
    expect(relativeTime("2026-10-29T14:59:30+09:00", NOW)).toBe("방금");
    expect(relativeTime("2026-10-29T14:57:00+09:00", NOW)).toBe("3분 전");
    expect(relativeTime("2026-10-29T12:10:00+09:00", NOW)).toBe("2시간 전");
  });

  it("어제부터 'M/D HH:mm'. 경계는 서울 자정(UTC로는 15시)", () => {
    expect(relativeTime("2026-10-28T14:20:00+09:00", NOW)).toBe("10/28 14:20");
    expect(relativeTime("2026-10-29T00:00:00+09:00", NOW)).toBe("15시간 전");
    expect(relativeTime("2026-10-28T23:59:00+09:00", NOW)).toBe("10/28 23:59");
  });

  it("시계 오차로 미래면 '방금'", () => {
    expect(relativeTime("2026-10-29T15:02:00+09:00", NOW)).toBe("방금");
  });
});

describe("S11-16 행 변환", () => {
  it("NEW_ORDER → 그 주문으로 가는 링크, 본문, 안 읽음", () => {
    expect(toNotificationRow(notification(), NOW)).toEqual({
      id: 1026,
      title: "봄봄상회 새 주문",
      body: "빈티지 플라워 셔츠 레드 / M, 1장",
      time: "방금",
      unread: true,
      href: "/orders?order=7006",
    });
  });

  it("ORDER_CANCELLED도 그 주문으로 간다", () => {
    const row = toNotificationRow(
      notification({
        type: "ORDER_CANCELLED",
        target: { kind: "ORDER", id: 7003 },
        readAt: "2026-10-29T15:00:00+09:00",
      }),
      NOW,
    );
    expect(row.href).toBe("/orders?order=7003");
    expect(row.unread).toBe(false);
  });

  it("모르는 type → title만(body 버림), 이동 없음", () => {
    const row = toNotificationRow(
      notification({
        // 계약이 "값이 늘 수 있다"고 적은 경우를 흉내 낸다
        type: "PAYMENT_RECEIVED" as unknown as Notification["type"],
        body: "보이면 안 되는 본문",
      }),
      NOW,
    );
    expect(row.body).toBeNull();
    expect(row.href).toBeNull();
  });

  it("모르는 target kind도 이동 없음", () => {
    const row = toNotificationRow(
      notification({
        target: { kind: "SHIPMENT" as unknown as "ORDER", id: 1 },
      }),
      NOW,
    );
    expect(row.href).toBeNull();
  });
});

describe("S11-11 이어 받은 장 합치기", () => {
  it("서버 순서 그대로, 같은 id는 앞 것만(중복 0)", () => {
    const rows = flattenPages([page([5, 4, 3], "c"), page([3, 2, 1])]);
    expect(rows.map((n) => n.id)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("S11-8 받은 장 읽음 표시", () => {
  const data = {
    pages: [
      {
        data: [
          notification({ id: 2 }),
          notification({ id: 1, readAt: "2026-10-28T10:00:00+09:00" }),
        ],
        meta: { nextCursor: null },
      },
    ],
    pageParams: [null],
  };

  it("ids만 읽음. 이미 읽은 행의 readAt은 그대로", () => {
    const next = markPagesRead(data, new Set([2]), "T");
    expect(next.pages[0]?.data.map((n) => n.readAt)).toEqual([
      "T",
      "2026-10-28T10:00:00+09:00",
    ]);
  });

  it("null이면 전부(모두 읽음)", () => {
    const next = markPagesRead({ ...data, pages: [page([3, 2])] }, null, "T");
    expect(next.pages[0]?.data.every((n) => n.readAt === "T")).toBe(true);
  });
});
