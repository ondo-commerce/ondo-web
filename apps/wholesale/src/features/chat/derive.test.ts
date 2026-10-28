import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  applyReadMark,
  bubbleKindOf,
  formatClock,
  formatDateDivider,
  formatListTime,
  formatUnread,
  liveAnnouncement,
  mergeMessages,
  mergeReadMark,
  parseRoomParam,
  pollDelayMs,
  toFactsView,
  toRoomRows,
  toThreadItems,
} from "./derive";
import type {
  ChatAutoReply,
  ChatMessage,
  ChatRoomPage,
  ChatRoomSummary,
} from "./types";

/** 서울 2026-10-28(수) 10:30 */
const NOW = Date.parse("2026-10-28T10:30:00+09:00");

function message(
  sequence: number,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 1000 + sequence,
    roomId: 1,
    sequence,
    clientMessageId: null,
    sender: "RETAILER",
    kind: "TEXT",
    body: `메시지 ${sequence}`,
    sentAt: "2026-10-28T10:00:00+09:00",
    inquiry: null,
    autoReply: null,
    ...patch,
  };
}

function room(
  roomId: number,
  patch: Partial<ChatRoomSummary> = {},
): ChatRoomSummary {
  return {
    roomId,
    counterpart: { id: roomId, name: `상회${roomId}` },
    lastMessage: null,
    lastActivityAt: "2026-10-28T09:00:00+09:00",
    unreadCount: 0,
    myLastReadSequence: 0,
    needsReply: false,
    openHandoff: false,
    ...patch,
  };
}

function page(rooms: ChatRoomSummary[]): ChatRoomPage {
  return { data: rooms, meta: { nextCursor: null } };
}

describe("S2-2 목록 시각과 안 읽은 수", () => {
  it("S2-2 시각: 오늘 HH:mm, 올해 M/D, 그 전 YY.M.D (서울 달력)", () => {
    expect(formatListTime("2026-10-28T09:05:00+09:00", NOW)).toBe("09:05");
    // UTC로는 10/27 15:10이지만 서울은 10/28 00:10 — 오늘이다
    expect(formatListTime("2026-10-27T15:10:00Z", NOW)).toBe("00:10");
    expect(formatListTime("2026-10-27T23:59:00+09:00", NOW)).toBe("10/27");
    expect(formatListTime("2026-01-03T12:00:00+09:00", NOW)).toBe("1/3");
    expect(formatListTime("2025-12-30T12:00:00+09:00", NOW)).toBe("25.12.30");
    expect(formatListTime("2009-03-04T12:00:00+09:00", NOW)).toBe("09.3.4");
  });

  it("S2-2 안 읽은 수: 0이면 없음, 99까지 그대로, 100 이상 99+", () => {
    expect(formatUnread(0)).toBeNull();
    expect(formatUnread(1)).toBe("1");
    expect(formatUnread(99)).toBe("99");
    expect(formatUnread(100)).toBe("99+");
    expect(formatUnread(128)).toBe("99+");
  });

  it("S2-3 이어 받은 페이지를 합칠 때 roomId가 겹치면 앞 페이지 것만", () => {
    const rows = toRoomRows(
      [
        page([
          room(5, { lastActivityAt: "2026-10-28T10:20:00+09:00" }),
          room(4),
        ]),
        page([room(5), room(3)]),
      ],
      {},
      NOW,
    );
    expect(rows.map((r) => r.roomId)).toEqual([5, 4, 3]);
    expect(rows[0]?.time).toBe("10:20");
  });
});

describe("S3-7 읽음은 내려가지 않는다", () => {
  it("S3-7 읽음 응답이 목록보다 새로우면(위치가 더 크면) 그 미확인 수를 쓴다", () => {
    const late = room(1, { myLastReadSequence: 6, unreadCount: 1 });
    const mark = { roomId: 1, lastReadSequence: 7, unreadCount: 0 };
    expect(applyReadMark(late, mark)).toMatchObject({
      myLastReadSequence: 7,
      unreadCount: 0,
    });
    const rows = toRoomRows([page([late])], { 1: mark }, NOW);
    expect(rows[0]?.unreadLabel).toBeNull();
  });

  it("S3-7 목록이 같거나 더 새로우면 목록 값 — 그 사이 온 메시지가 반영돼 있다", () => {
    const mark = { roomId: 1, lastReadSequence: 7, unreadCount: 0 };
    expect(
      applyReadMark(room(1, { myLastReadSequence: 7, unreadCount: 2 }), mark)
        .unreadCount,
    ).toBe(2);
    expect(applyReadMark(room(1), undefined)).toEqual(room(1));
  });

  it("S3-7 늦게 온 읽음 응답(작은 위치)은 쌓인 값을 내리지 못한다", () => {
    const first = mergeReadMark(
      {},
      { roomId: 1, lastReadSequence: 9, unreadCount: 0 },
    );
    const late = mergeReadMark(first, {
      roomId: 1,
      lastReadSequence: 7,
      unreadCount: 2,
    });
    expect(late).toBe(first);
    expect(
      mergeReadMark(first, {
        roomId: 1,
        lastReadSequence: 9,
        unreadCount: 0,
      })[1]?.lastReadSequence,
    ).toBe(9);
  });
});

describe("S3-1 날짜 구분선과 말풍선 모양", () => {
  it("S3-1 서울 날짜가 바뀌는 자리마다 구분선, 요일 포함", () => {
    const items = toThreadItems([
      message(1, { sentAt: "2026-10-27T09:00:00+09:00" }),
      message(2, { sentAt: "2026-10-27T23:59:00+09:00" }),
      // UTC 15:00 = 서울 다음 날 00:00
      message(3, { sentAt: "2026-10-27T15:00:00Z" }),
      message(4, { sentAt: "2026-10-28T09:00:00+09:00" }),
    ]);
    expect(
      items.map((i) => (i.type === "divider" ? i.label : i.message.sequence)),
    ).toEqual(["10월 27일 (화)", 1, 2, "10월 28일 (수)", 3, 4]);
    expect(toThreadItems([])).toEqual([]);
  });

  it("S3-1 kind 분기: 소매 왼쪽, 내 TEXT 오른쪽, 자동 답변, 되묻기, 사람 넘김", () => {
    expect(bubbleKindOf({ sender: "RETAILER", kind: "TEXT" })).toBe("them");
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "TEXT" })).toBe("me");
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "AUTO_REPLY" })).toBe(
      "auto",
    );
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "CLARIFY" })).toBe(
      "clarify",
    );
    expect(bubbleKindOf({ sender: "SYSTEM", kind: "HANDOFF" })).toBe("system");
  });

  it("S3-1 모르는 kind는 TEXT처럼 body만 — sender로 좌우", () => {
    // 서버가 값을 늘리면 FE 배포 전에 먼저 온다(가이드 §9). 생성 타입에 없는 값을 일부러 넣는다
    const unknown = "ORDER_LINK" as unknown as ChatMessage["kind"];
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: unknown })).toBe("me");
    expect(bubbleKindOf({ sender: "RETAILER", kind: unknown })).toBe("them");
    expect(bubbleKindOf({ sender: "SYSTEM", kind: unknown })).toBe("system");
  });

  it("S3-1 날짜 구분선과 말풍선 시각 형식", () => {
    expect(formatDateDivider("2026-10-27T16:20:00+09:00")).toBe(
      "10월 27일 (화)",
    );
    expect(formatClock("2026-10-28T01:38:00Z")).toBe("10:38");
  });

  it("S3-1 자동 답변 근거: 정확 수량, 주문 한도, 소매처가 본 구간, 조회 시각", () => {
    const autoReply: ChatAutoReply = {
      intent: "STOCK",
      replyToSequence: 5,
      generatedBy: "RULE",
      checkedAt: "2026-10-28T09:22:00+09:00",
      subject: {
        listingId: 2001,
        variantId: 3002,
        backorderId: null,
        label: null,
      },
      facts: {
        stock: { availableQty: 1200, band: "FIFTY_PLUS", orderLimit: 500 },
        backorder: null,
        receivable: null,
      },
    };
    expect(toFactsView(autoReply)).toEqual({
      lines: ["판매가능 1,200장, 주문 한도 500장"],
      seen: '소매처에게는 "50장 이상"으로 보였어요. 09:22 조회',
    });
    expect(
      toFactsView({
        ...autoReply,
        facts: { stock: null, backorder: null, receivable: null },
      }),
    ).toBeNull();
    expect(toFactsView(null)).toBeNull();
    expect(
      toFactsView({
        ...autoReply,
        facts: {
          stock: null,
          backorder: null,
          receivable: {
            outstandingAmount: 786_000,
            prepaidAmount: 0,
            overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
          },
        },
      })?.lines,
    ).toEqual(["미결제 786,000원, 선수금 0원", "연체 없음"]);
  });
});

describe("S3-3 S3-4 polling 결과 합치기", () => {
  it("S3-4 sequence로 합친다 — 겹친 것은 한 번, 결과는 오름차순", () => {
    const merged = mergeMessages(
      [message(1), message(2), message(3)],
      [message(3, { body: "다시 받은 3" }), message(5), message(4)],
    );
    expect(merged.map((m) => m.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(merged[2]?.body).toBe("다시 받은 3");
  });

  it("S3-4 cursor는 받은 것 중 가장 큰 sequence, 빈 응답이면 그대로", () => {
    expect(advanceCursor(120, [message(121), message(170)])).toBe(170);
    expect(advanceCursor(120, [])).toBe(120);
  });
});

describe("S3-8 낭독 알림", () => {
  const messages = [
    message(7),
    message(8, { body: "아 그리고 차콜 L도 10장요" }),
    message(9, { sender: "WHOLESALER", body: "네" }),
  ];

  it("S3-8 연 뒤 온 소매 메시지 중 마지막 것을 '이름: 본문'으로", () => {
    expect(liveAnnouncement(messages, 7, "봄봄상회")).toBe(
      "봄봄상회: 아 그리고 차콜 L도 10장요",
    );
  });

  it("S3-8 첫 로딩(기준점 = 마지막)이면 빈 글자, 내 말만 왔으면 빈 글자", () => {
    expect(liveAnnouncement(messages, 9, "봄봄상회")).toBe("");
    expect(liveAnnouncement(messages, 8, "봄봄상회")).toBe("");
  });
});

describe("S3-6 polling 간격", () => {
  it("S3-6 성공이면 3초, 흔들림 없음", () => {
    expect(pollDelayMs(0, 0)).toBe(3000);
    expect(pollDelayMs(0, 0.999)).toBe(3000);
  });

  it("S3-6 연속 실패 1, 2, 3번 → 3, 6, 12초 ±20%", () => {
    for (const [failures, base] of [
      [1, 3000],
      [2, 6000],
      [3, 12000],
    ] as const) {
      expect(pollDelayMs(failures, 0)).toBe(base * 0.8);
      expect(pollDelayMs(failures, 0.5)).toBe(base);
      expect(pollDelayMs(failures, 0.999_999)).toBeCloseTo(base * 1.2, -1);
    }
  });

  it("S3-6 60초에서 멈춘다", () => {
    expect(pollDelayMs(10, 0.5)).toBe(60_000);
  });
});

describe("S2-5 ?room= 값", () => {
  it("S2-5 양의 정수만 방 번호, 없으면 null, 나머지는 invalid", () => {
    expect(parseRoomParam(null)).toBeNull();
    expect(parseRoomParam("")).toBeNull();
    expect(parseRoomParam("99999")).toBe(99999);
    expect(parseRoomParam("0")).toBe("invalid");
    expect(parseRoomParam("-1")).toBe("invalid");
    expect(parseRoomParam("abc")).toBe("invalid");
    expect(parseRoomParam("1.5")).toBe("invalid");
  });
});
