import { describe, expect, it } from "vitest";
import {
  flattenPages,
  hasNewer,
  isCurrentAddress,
  markPagesRead,
  notificationBadgeLabel,
  relativeTime,
  toNotificationRow,
  unreadOf,
} from "./derive";
import type {
  FetchedNotificationPage,
  HeaderCounts,
  Notification,
} from "./types";

/*
 * loop-06b S2 — 소매 헤더 종과 알림 패널(#305). 도매 `features/notification/derive.test.ts`의 상대 시각, 중복 제거
 * 케이스를 같이 쓴다(복제한 규칙이라 한쪽을 고치면 다른 쪽도 고친다).
 */

const T0 = Date.parse("2026-10-29T14:20:00+09:00");

const ok = (
  notifications: number,
  latestNotificationId: number | null | undefined,
  started = 5,
): HeaderCounts => ({
  kind: "ok",
  chats: 1,
  notifications,
  latestNotificationId,
  started,
});

function row(id: number, extra: Partial<Notification> = {}): Notification {
  return {
    id,
    type: "BACKORDER_DATE_CHANGED",
    title: "무드온 미송 입고일 변경",
    body: "린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 11/8(일)",
    target: { kind: "BACKORDERS", wholesalerId: 101 },
    createdAt: "2026-10-28T14:20:00+09:00",
    readAt: null,
    ...extra,
  };
}

function page(
  ids: number[],
  countsIssued = 3,
  nextCursor: string | null = null,
): FetchedNotificationPage {
  return { data: ids.map((id) => row(id)), meta: { nextCursor }, countsIssued };
}

describe("S2-1 notificationBadgeLabel — 종 배지와 접근 이름", () => {
  it("2 → 이름 '알림, 안 읽음 2개', 배지 2", () => {
    expect(notificationBadgeLabel(ok(2, 2022))).toEqual({
      label: "알림, 안 읽음 2개",
      badge: "2",
    });
  });

  it("0 → 배지 없음, 이름 '알림'", () => {
    expect(notificationBadgeLabel(ok(0, null))).toEqual({
      label: "알림",
      badge: null,
    });
  });

  it("99는 그대로, 100 → 배지 99+, 이름은 실제 수", () => {
    expect(notificationBadgeLabel(ok(99, 1)).badge).toBe("99");
    expect(notificationBadgeLabel(ok(100, 1))).toEqual({
      label: "알림, 안 읽음 100개",
      badge: "99+",
    });
  });

  it("모르면(처음, 실패, 401/403 멈춤) 배지 없는 아이콘, 모두 읽음 N도 모름", () => {
    for (const counts of [
      undefined,
      { kind: "failed", failures: 1 } as const,
      { kind: "stopped" } as const,
    ]) {
      expect(notificationBadgeLabel(counts)).toEqual({
        label: "알림",
        badge: null,
      });
      expect(unreadOf(counts)).toBeNull();
    }
    expect(unreadOf(ok(2, 2022))).toBe(2);
  });
});

describe("S2-7 hasNewer — 새 알림 보기 줄(첫 행 id 비교, F3)", () => {
  it("칸 없음(구버전 서버) → false. 기능을 끈다", () => {
    expect(hasNewer(ok(3, undefined), page([2022]))).toBe(false);
  });

  it("null(내 알림 0) → false", () => {
    expect(hasNewer(ok(0, null), page([]))).toBe(false);
  });

  it("빈 첫 장 + 숫자 → true(열 때 0개였는데 새로 왔다)", () => {
    expect(hasNewer(ok(1, 2023), page([]))).toBe(true);
  });

  it("같은 id → false, 다른 id → true", () => {
    expect(hasNewer(ok(2, 2022), page([2022, 2021]))).toBe(false);
    expect(hasNewer(ok(3, 2023), page([2022, 2021]))).toBe(true);
  });

  it("F3: 다른 기기 읽음 1 + 새 1이라 수가 같아도(2 → 2) id가 달라 true", () => {
    expect(hasNewer(ok(2, 2023), page([2022]))).toBe(true);
  });

  it("첫 장 요청 전에 시작한 count는 늦게 와도 비교 제외(같은 순번 포함)", () => {
    expect(hasNewer(ok(3, 2023, 3), page([2022], 3))).toBe(false);
    expect(hasNewer(ok(3, 2023, 2), page([2022], 3))).toBe(false);
    expect(hasNewer(ok(3, 2023, 4), page([2022], 3))).toBe(true);
  });

  it("count를 모르거나 첫 장이 아직 없으면 false", () => {
    expect(hasNewer(undefined, page([2022]))).toBe(false);
    expect(hasNewer({ kind: "stopped" }, page([2022]))).toBe(false);
    expect(hasNewer(ok(3, 2023), undefined)).toBe(false);
  });
});

describe("S2-5 toNotificationRow — 행이 가는 곳과 모양", () => {
  it("BACKORDERS → /backorders?wholesaler=101, 안 읽음, 본문 그대로", () => {
    expect(toNotificationRow(row(2022), T0)).toEqual({
      id: 2022,
      title: "무드온 미송 입고일 변경",
      body: "린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 11/8(일)",
      time: "10/28 14:20",
      unread: true,
      href: "/backorders?wholesaler=101",
    });
  });

  it("ORDER(주문 확정, 출고, 미송 배분) → /orders/7001", () => {
    for (const type of [
      "ORDER_CONFIRMED",
      "SHIPPED",
      "BACKORDER_ALLOCATED",
    ] as const)
      expect(
        toNotificationRow(
          row(1, { type, target: { kind: "ORDER", orderId: 7001 } }),
          T0,
        ).href,
      ).toBe("/orders/7001");
  });

  it("읽은 행은 unread false", () => {
    expect(
      toNotificationRow(row(1, { readAt: "2026-10-28T15:00:00+09:00" }), T0)
        .unread,
    ).toBe(false);
  });

  it("모르는 type(PAYMENT_DUE) → href null, body null(title만 button)", () => {
    const unknown = row(2012, {
      title: "결제 기한이 다가와요",
      body: "숨겨야 할 본문",
    });
    /* 스펙 밖 값을 넣는 시험이라 생성 타입을 건너뛴다 */
    const view = toNotificationRow(
      { ...unknown, type: "PAYMENT_DUE" as Notification["type"] },
      T0,
    );
    expect(view.href).toBeNull();
    expect(view.body).toBeNull();
    expect(view.title).toBe("결제 기한이 다가와요");
  });

  it("아는 type이어도 모르는 kind면 href null", () => {
    const view = toNotificationRow(
      row(1, {
        target: {
          kind: "COUPON",
          couponId: 1,
        } as unknown as Notification["target"],
      }),
      T0,
    );
    expect(view.href).toBeNull();
    expect(view.body).toBeNull();
  });

  it("isCurrentAddress — 주소와 쿼리까지 같을 때만 다시 그리기", () => {
    const href = "/backorders?wholesaler=101";
    expect(
      isCurrentAddress(href, {
        pathname: "/backorders",
        search: "?wholesaler=101",
      }),
    ).toBe(true);
    expect(
      isCurrentAddress(href, { pathname: "/backorders", search: "" }),
    ).toBe(false);
    expect(isCurrentAddress(href, { pathname: "/", search: "" })).toBe(false);
  });
});

describe("S2-4 relativeTime — 상대 시각(서울 자정 경계)", () => {
  it("1분 안 방금, 1시간 안 N분 전, 같은 날 N시간 전", () => {
    expect(relativeTime("2026-10-29T14:19:30+09:00", T0)).toBe("방금");
    expect(relativeTime("2026-10-29T14:17:00+09:00", T0)).toBe("3분 전");
    expect(relativeTime("2026-10-29T09:20:00+09:00", T0)).toBe("5시간 전");
  });

  it("어제부터 M/D HH:mm, 미래(시계 오차)는 방금", () => {
    expect(relativeTime("2026-10-28T23:59:00+09:00", T0)).toBe("10/28 23:59");
    expect(relativeTime("2026-10-29T14:25:00+09:00", T0)).toBe("방금");
  });
});

describe("S2-4 S2-11 flattenPages, markPagesRead — 이어 받은 장과 읽음", () => {
  it("이어 받은 장에 앞 장 id가 있으면 앞 것만(22개 중복 0)", () => {
    const first = page([22, 21, 20]);
    const second = page([20, 19]);
    expect(flattenPages([first, second]).map((n) => n.id)).toEqual([
      22, 21, 20, 19,
    ]);
  });

  it("ids 읽음은 고른 행만 — 늦게 온 둘째 장의 안 읽은 점은 서버 값 그대로", () => {
    const data = { pages: [page([2022, 2021]), page([2001])] };
    const read = markPagesRead(data, new Set([2022]), "2026-10-29T14:21:00Z");
    expect(read.pages.flatMap((p) => p.data.map((n) => n.readAt))).toEqual([
      "2026-10-29T14:21:00Z",
      null,
      null,
    ]);
  });

  it("null이면 전부, 이미 읽은 시각은 그대로", () => {
    const data = {
      pages: [
        {
          ...page([]),
          data: [row(2, { readAt: "2026-10-28T00:00:00Z" }), row(1)],
        },
      ],
    };
    const read = markPagesRead(data, null, "2026-10-29T14:21:00Z");
    expect(read.pages[0]?.data.map((n) => n.readAt)).toEqual([
      "2026-10-28T00:00:00Z",
      "2026-10-29T14:21:00Z",
    ]);
  });
});
