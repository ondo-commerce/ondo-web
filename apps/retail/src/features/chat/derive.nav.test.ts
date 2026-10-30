import { describe, expect, it } from "vitest";
import {
  chatBadgeLabel,
  chatRoomHref,
  confirmedReadOf,
  formatListTime,
  nextReadTarget,
  returnLinkOf,
  toRoomRows,
} from "./derive";
import type { ChatRoomSummary, HeaderCounts, ReadState } from "./types";

/*
 * loop-06 S2 — 헤더 채팅 링크, `/chats` 목록, 방 읽음. count 주기와 울타리 테스트는 06b에 규칙과 함께
 * `shared/headerCounts.test.ts`로 옮겼다.
 */

const T0 = Date.parse("2026-10-29T14:20:00+09:00");

/** 성공한 count. 알림 칸은 채팅 링크가 안 읽는다 */
const ok = (chats: number): HeaderCounts => ({
  kind: "ok",
  chats,
  notifications: 0,
  latestNotificationId: null,
  started: 1,
});

describe("S2-2 chatBadgeLabel — 배지와 접근 이름", () => {
  it("3 → 이름 '채팅, 안 읽은 메시지 3개', 배지 3", () => {
    expect(chatBadgeLabel(ok(3))).toEqual({
      label: "채팅, 안 읽은 메시지 3개",
      badge: "3",
    });
  });

  it("0 → 배지 없음, 이름 '채팅'", () => {
    expect(chatBadgeLabel(ok(0))).toEqual({
      label: "채팅",
      badge: null,
    });
  });

  it("99는 그대로, 100 → 배지 99+, 이름은 실제 수", () => {
    expect(chatBadgeLabel(ok(99)).badge).toBe("99");
    expect(chatBadgeLabel(ok(100))).toEqual({
      label: "채팅, 안 읽은 메시지 100개",
      badge: "99+",
    });
  });

  it("모르면(처음, 실패, 401/403 멈춤) 배지 없는 아이콘", () => {
    for (const counts of [
      undefined,
      { kind: "failed", failures: 2 } as const,
      { kind: "stopped" } as const,
    ])
      expect(chatBadgeLabel(counts)).toEqual({ label: "채팅", badge: null });
  });
});

describe("S2-5 S2-6 (가) nextReadTarget, confirmedReadOf — 방 읽음", () => {
  const base: ReadState = {
    drawn: 10,
    confirmed: 7,
    inFlight: 0,
    visible: true,
    sessionLost: false,
  };

  it("그린 위치가 확인된 위치보다 크면 그 위치를 보낸다", () => {
    expect(nextReadTarget(base)).toBe(10);
  });

  it("이미 확인됐거나 같은 위치가 날아가는 중이면 보내지 않는다(다시 그려져도 POST 1회)", () => {
    expect(nextReadTarget({ ...base, confirmed: 10 })).toBeNull();
    expect(nextReadTarget({ ...base, inFlight: 10 })).toBeNull();
  });

  it("10이 날아가는 중에 12가 그려지면 12를 바로 보낸다", () => {
    expect(nextReadTarget({ ...base, drawn: 12, inFlight: 10 })).toBe(12);
  });

  it("탭 숨김, 세션 끊김이면 보내지 않는다", () => {
    expect(nextReadTarget({ ...base, visible: false })).toBeNull();
    expect(nextReadTarget({ ...base, sessionLost: true })).toBeNull();
  });

  it("실패 뒤(inFlight 풀림) 같은 값을 다시 보낸다", () => {
    expect(nextReadTarget({ ...base, inFlight: 0 })).toBe(10);
  });

  it("늦게 온 10 응답은 아는 위치 12를 내리지 않는다", () => {
    expect(confirmedReadOf(12, { lastReadSequence: 10 })).toBe(12);
    expect(confirmedReadOf(7, { lastReadSequence: 12 })).toBe(12);
  });
});

describe("S2-4 목록 행과 돌아가기", () => {
  function summary(
    roomId: number,
    patch: Partial<ChatRoomSummary> = {},
  ): ChatRoomSummary {
    return {
      roomId,
      counterpart: { id: 100 + roomId, name: `도매처 ${roomId}` },
      lastMessage: {
        sequence: 3,
        sender: "WHOLESALER",
        kind: "TEXT",
        preview: "네 내일 오전에 주문 넣어 주시면 바로 챙길게요",
        sentAt: "2026-10-29T14:18:00+09:00",
      },
      lastActivityAt: "2026-10-29T14:18:00+09:00",
      unreadCount: 1,
      myLastReadSequence: 2,
      needsReply: false,
      openHandoff: false,
      ...patch,
    };
  }

  it("returnLinkOf — /chats 는 채팅 목록, 쿼리가 붙거나 비슷한 주소는 버린다", () => {
    expect(returnLinkOf("/chats", 101)).toEqual({
      href: "/chats",
      kind: "chats",
    });
    const home = { href: "/wholesalers/101", kind: "wholesaler" };
    expect(returnLinkOf("/chats?x=1", 101)).toEqual(home);
    expect(returnLinkOf("/chats/1", 101)).toEqual(home);
    expect(returnLinkOf("/chatsx", 101)).toEqual(home);
  });

  it("chatRoomHref — 목록에서 연 방은 ?from=/chats", () => {
    expect(chatRoomHref(1, "/chats")).toBe("/chats/1?from=/chats");
  });

  it("formatListTime — 오늘 HH:mm, 어제, 올해 M/D, 그 전 YY.M.D (서울 달력)", () => {
    expect(formatListTime("2026-10-29T14:18:00+09:00", T0)).toBe("14:18");
    expect(formatListTime("2026-10-29T00:00:00+09:00", T0)).toBe("00:00");
    expect(formatListTime("2026-10-28T23:59:00+09:00", T0)).toBe("어제");
    expect(formatListTime("2026-10-27T23:59:00+09:00", T0)).toBe("10/27");
    expect(formatListTime("2025-12-30T10:00:00+09:00", T0)).toBe("25.12.30");
    // UTC로는 같은 날(10/28)이지만 서울로는 10/29 00:30 — 오늘
    expect(formatListTime("2026-10-28T15:30:00Z", T0)).toBe("00:30");
  });

  it("toRoomRows — 도매처, 한 줄, 시각, 안 읽은 수, 주소. 0이면 알약 없음, 100이면 99+", () => {
    const rows = toRoomRows(
      [
        summary(1),
        summary(33, {
          unreadCount: 0,
          lastMessage: null,
          lastActivityAt: "2026-10-28T09:00:00+09:00",
        }),
        summary(34, { unreadCount: 100 }),
      ],
      T0,
    );
    expect(rows).toEqual([
      {
        roomId: 1,
        href: "/chats/1?from=/chats",
        name: "도매처 1",
        preview: "네 내일 오전에 주문 넣어 주시면 바로 챙길게요",
        time: "14:18",
        unreadLabel: "1",
        unreadCount: 1,
      },
      {
        roomId: 33,
        href: "/chats/33?from=/chats",
        name: "도매처 33",
        preview: "",
        time: "어제",
        unreadLabel: null,
        unreadCount: 0,
      },
      expect.objectContaining({ roomId: 34, unreadLabel: "99+" }),
    ]);
  });

  it("toRoomRows — 같은 방이 두 번 오면 앞 것만", () => {
    const rows = toRoomRows([summary(1), summary(1, { unreadCount: 9 })], T0);
    expect(rows.map((r) => [r.roomId, r.unreadCount])).toEqual([[1, 1]]);
  });
});
