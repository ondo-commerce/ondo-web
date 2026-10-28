import { ApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  applyReadMark,
  bodyLength,
  bubbleKindOf,
  checkComposer,
  factLineText,
  failureText,
  formatClock,
  formatDateDivider,
  formatListTime,
  formatUnread,
  insertSent,
  liveAnnouncement,
  mergeMessages,
  mergeReadMark,
  parseRoomParam,
  pollDelayMs,
  sendFailureOf,
  toFactsView,
  toRoomRows,
  toThreadItems,
  upsertPending,
  visiblePending,
} from "./derive";
import type {
  ChatAutoReply,
  ChatMessage,
  ChatRoomPage,
  ChatRoomSummary,
  ChatThread,
  PendingMessage,
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
    const view = toFactsView(autoReply);
    expect(view?.lines.map(factLineText)).toEqual([
      "판매가능 1,200장, 주문 한도 500장",
    ]);
    expect(view?.seen).toBe(
      '소매처에게는 "50장 이상"으로 보였어요. 09:22 조회',
    );
    // 수량만 굵게(QA F11)
    expect(view?.lines[0]?.filter((p) => p.strong).map((p) => p.text)).toEqual([
      "1,200장",
      "500장",
    ]);
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
      })?.lines.map(factLineText),
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
    expect(liveAnnouncement(messages, 7, "봄봄상회")).toEqual({
      text: "봄봄상회: 아 그리고 차콜 L도 10장요",
      sequence: 8,
    });
  });

  it("S3-8 첫 로딩(기준점 = 마지막)이면 없음, 내 말만 왔으면 없음", () => {
    expect(liveAnnouncement(messages, 9, "봄봄상회")).toBeNull();
    expect(liveAnnouncement(messages, 8, "봄봄상회")).toBeNull();
  });

  it("S3-8 같은 본문이 연달아 와도 sequence가 달라 새 알림이다(QA F8)", () => {
    const twice = [message(10, { body: "네" }), message(11, { body: "네" })];
    const first = liveAnnouncement(twice.slice(0, 1), 9, "봄봄상회");
    const second = liveAnnouncement(twice, 9, "봄봄상회");
    expect(first?.text).toBe(second?.text);
    expect(first?.sequence).not.toBe(second?.sequence);
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

  it("S3-6 흔들림을 섞은 최종값도 30초를 넘지 않는다(리뷰 F5)", () => {
    // 4번째 실패: 24초 +20% = 28.8초 — 상한 안
    expect(pollDelayMs(4, 0.999_999)).toBeLessThanOrEqual(30_000);
    expect(pollDelayMs(4, 0.999_999)).toBeGreaterThan(28_000);
    // 5번째부터 기준 30초. +20%를 섞어도 30초에서 자르고, −20%는 24초
    for (const failures of [5, 6, 10, 50]) {
      expect(pollDelayMs(failures, 0.999_999)).toBe(30_000);
      expect(pollDelayMs(failures, 0.5)).toBe(30_000);
      expect(pollDelayMs(failures, 0)).toBe(24_000);
    }
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

describe("S4-4 글자 수", () => {
  it("S4-4 앞뒤 공백을 빼고 코드 포인트로 센다 — 이모지 하나가 1자", () => {
    expect(bodyLength("  👍가 ")).toBe(2);
    expect("👍".length).toBe(2); // JS length 와 다르다
    expect(bodyLength("   \n ")).toBe(0);
  });

  it("S4-4 공백만이면 잠김, 문구 없음", () => {
    expect(checkComposer("   ")).toMatchObject({
      blank: true,
      over: false,
      overMessage: null,
      counter: null,
    });
  });

  it("S4-4 이모지 포함 정확히 1000자는 보낼 수 있고 900자부터 카운터", () => {
    const exact = "👍".repeat(10) + "가".repeat(990);
    expect(checkComposer(exact)).toMatchObject({
      length: 1000,
      blank: false,
      over: false,
      counter: "1,000/1,000",
      overMessage: null,
    });
    expect(checkComposer("가".repeat(899)).counter).toBeNull();
    expect(checkComposer("가".repeat(900)).counter).toBe("900/1,000");
  });

  it("S4-4 1001자는 자르지 않고 안내, 잠김", () => {
    const over = "👍".repeat(10) + "가".repeat(991);
    expect(checkComposer(over)).toMatchObject({
      length: 1001,
      over: true,
      counter: null,
      overMessage: "1,000자까지 보낼 수 있어요 (1,001/1,000)",
    });
  });
});

describe("S4-5 S4-7 S4-8 보내기 실패 종류", () => {
  it("S4-7 401 → session, S4-8 서버까지 못 감 → offline, 그 밖 → server", () => {
    const err = (status: number, code: string) =>
      new ApiError({ status, code, message: "x" });
    expect(sendFailureOf(err(401, "UNAUTHENTICATED"))).toBe("session");
    expect(sendFailureOf(err(0, TRANSPORT_ERROR_CODE.NETWORK))).toBe("offline");
    expect(sendFailureOf(err(500, "INTERNAL_ERROR"))).toBe("server");
    expect(sendFailureOf(err(409, "IDEMPOTENCY_KEY_REUSED"))).toBe("server");
    expect(sendFailureOf(new Error("렌더 버그"))).toBe("server");
  });

  it("S4-8 문구: 오프라인만 '연결이 끊겨', 나머지는 '못 보냈어요'", () => {
    expect(failureText("offline")).toBe("연결이 끊겨 못 보냈어요");
    expect(failureText("server")).toBe("못 보냈어요");
    expect(failureText("session")).toBe("못 보냈어요");
  });
});

describe("S4-6 보류 말풍선 합치기", () => {
  const pending: PendingMessage[] = [
    {
      clientMessageId: "k-1",
      body: "30장이면 장당 500원 빼 드릴게요",
      status: "failed",
      failure: "server",
    },
    { clientMessageId: "k-2", body: "또", status: "sending", failure: null },
  ];

  it("S4-6 polling 이 같은 clientMessageId 를 가져오면 보류 말풍선을 뺀다 — 1개로 합쳐진다", () => {
    const delivered = message(8, {
      sender: "WHOLESALER",
      clientMessageId: "k-1",
      body: "30장이면 장당 500원 빼 드릴게요",
    });
    expect(
      visiblePending(pending, [message(7), delivered]).map(
        (p) => p.clientMessageId,
      ),
    ).toEqual(["k-2"]);
    expect(visiblePending(pending, [message(7)])).toHaveLength(2);
  });

  it("S4-5 다시 보내기는 제자리에서 상태만 바뀌고, 새 말풍선은 맨 아래", () => {
    const retried = upsertPending(pending, {
      clientMessageId: "k-1",
      body: "30장이면 장당 500원 빼 드릴게요",
      status: "sending",
      failure: null,
    });
    expect(retried.map((p) => [p.clientMessageId, p.status])).toEqual([
      ["k-1", "sending"],
      ["k-2", "sending"],
    ]);
    const added = upsertPending(pending, {
      clientMessageId: "k-3",
      body: "새",
      status: "sending",
      failure: null,
    });
    expect(added.at(-1)?.clientMessageId).toBe("k-3");
  });

  it("S4-6 보내기 응답은 메시지에만 넣고 cursor 는 올리지 않는다 — 그 앞 소매 메시지를 놓치지 않게", () => {
    const thread: ChatThread = {
      messages: [message(5)],
      cursor: 5,
      failures: 0,
      nextPollMs: 3000,
    };
    const next = insertSent(thread, [
      message(7, { sender: "WHOLESALER", clientMessageId: "k-1" }),
    ]);
    expect(next.cursor).toBe(5);
    expect(next.messages.map((m) => m.sequence)).toEqual([5, 7]);
    // 다음 polling 이 6, 7 을 가져와도 7 은 한 번
    expect(
      mergeMessages(next.messages, [message(6), message(7)]).map(
        (m) => m.sequence,
      ),
    ).toEqual([5, 6, 7]);
  });
});
