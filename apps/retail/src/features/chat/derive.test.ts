import { ApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  autoReplySeen,
  bodyLength,
  bubbleKindOf,
  chatRoomHref,
  checkComposer,
  entryFailureOf,
  failureText,
  formatClock,
  formatDateDivider,
  insertSent,
  liveAnnouncement,
  mergeMessages,
  messageAc,
  parseRoomId,
  pollDelayMs,
  returnLinkOf,
  sendFailureOf,
  senderLabel,
  systemLineText,
  toThreadItems,
  upsertPending,
  visiblePending,
} from "./derive";
import type { ChatMessage, ChatThread, PendingMessage } from "./types";

/*
 * 도매 `features/chat/derive.test.ts`와 짝이다. 같은 이름의 함수는 같은 케이스를 쓰고, 역할이 뒤집힌
 * 함수(`bubbleKindOf` `senderLabel` `messageAc`)는 소매 역할 케이스를 넣었다(01-plan §4-5 3).
 */

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

const AUTO_REPLY: NonNullable<ChatMessage["autoReply"]> = {
  intent: "STOCK",
  replyToSequence: 5,
  generatedBy: "RULE",
  checkedAt: "2026-10-28T01:22:00Z",
  subject: {
    listingId: 2001,
    variantId: 3002,
    backorderId: null,
    label: "빈티지 플라워 셔츠 레드 / M",
  },
  facts: {
    stock: { band: "UNDER_50", orderLimit: 500, orderable: true },
    backorder: null,
    receivable: null,
  },
};

function apiError(code: string, status: number) {
  return new ApiError({ status, code, message: code, traceId: null });
}

describe("S5-5 날짜 구분선과 말풍선 좌우 — 소매 시점", () => {
  it("S5-5 서울 날짜가 바뀌는 자리마다 구분선, 요일 포함", () => {
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

  it("S5-5 RETAILER(나)는 오른쪽, WHOLESALER TEXT는 왼쪽 — 도매 화면과 반대", () => {
    expect(bubbleKindOf({ sender: "RETAILER", kind: "TEXT" })).toBe("me");
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "TEXT" })).toBe("them");
    expect(bubbleKindOf({ sender: "SYSTEM", kind: "HANDOFF" })).toBe("system");
  });

  it("S5-5 숨긴 발신자: 나는 '나', 도매는 상호, 자동 답은 '상호 자동 답변', 시스템은 '안내'", () => {
    expect(senderLabel({ sender: "RETAILER", kind: "TEXT" }, "무드온")).toBe(
      "나",
    );
    expect(senderLabel({ sender: "WHOLESALER", kind: "TEXT" }, "무드온")).toBe(
      "무드온",
    );
    expect(
      senderLabel({ sender: "WHOLESALER", kind: "AUTO_REPLY" }, "무드온"),
    ).toBe("무드온 자동 답변");
    expect(
      senderLabel({ sender: "WHOLESALER", kind: "CLARIFY" }, "무드온"),
    ).toBe("무드온 자동 답변");
    expect(senderLabel({ sender: "SYSTEM", kind: "HANDOFF" }, "무드온")).toBe(
      "안내",
    );
  });

  it("S5-5 sequence로 합친다 — 겹친 것은 한 번, 결과는 오름차순. cursor는 받은 것 중 최대", () => {
    const merged = mergeMessages(
      [message(1), message(2), message(3)],
      [message(3, { body: "다시 받은 3" }), message(5), message(4)],
    );
    expect(merged.map((m) => m.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(merged[2]?.body).toBe("다시 받은 3");
    expect(advanceCursor(120, [message(121), message(170)])).toBe(170);
    expect(advanceCursor(120, [])).toBe(120);
  });

  it("S5-5 날짜 구분선과 말풍선 시각 형식", () => {
    expect(formatDateDivider("2026-10-27T16:20:00+09:00")).toBe(
      "10월 27일 (화)",
    );
    expect(formatClock("2026-10-28T01:38:00Z")).toBe("10:38");
  });
});

describe("S5-6 자동 답변, 사람 넘김, 모르는 kind", () => {
  it("S5-6 AUTO_REPLY와 CLARIFY는 상대 쪽(왼쪽) 자동 답변 하나 — 되묻기를 따로 가르지 않는다", () => {
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "AUTO_REPLY" })).toBe(
      "auto",
    );
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: "CLARIFY" })).toBe(
      "auto",
    );
  });

  it("S5-6 조회 시각은 checkedAt을 서울 HH:mm으로 + ' 조회'. 근거가 없으면 없음", () => {
    expect(autoReplySeen({ autoReply: AUTO_REPLY })).toBe("10:22 조회");
    expect(autoReplySeen({ autoReply: null })).toBeNull();
  });

  it("S5-6 HANDOFF는 서버 body(도매에게 하는 말) 대신 '사장님께 전달했어요'", () => {
    expect(
      systemLineText({
        kind: "HANDOFF",
        body: "자동 답변이 답하지 못했어요. 직접 답해 주세요",
      }),
    ).toBe("사장님께 전달했어요");
  });

  it("S5-6 모르는 kind는 TEXT처럼 body만 — sender로 좌우", () => {
    // 서버가 값을 늘리면 FE 배포 전에 먼저 온다(가이드 §9). 생성 타입에 없는 값을 일부러 넣는다
    const unknown = "ORDER_LINK" as unknown as ChatMessage["kind"];
    expect(bubbleKindOf({ sender: "WHOLESALER", kind: unknown })).toBe("them");
    expect(bubbleKindOf({ sender: "RETAILER", kind: unknown })).toBe("me");
    expect(bubbleKindOf({ sender: "SYSTEM", kind: unknown })).toBe("system");
    expect(systemLineText({ kind: unknown, body: "안내 문구" })).toBe(
      "안내 문구",
    );
  });

  it("S5-6 data-ac: 기본 S5-5, 자동 답과 사람 넘김 S5-6, 연 뒤 받은 도매 글 S6-7 S6-11, 보류를 대신한 것 S6-4", () => {
    const none = new Set<string>();
    expect(messageAc(message(3), 7, none)).toBe("S5-5");
    expect(
      messageAc(
        message(4, { sender: "WHOLESALER", kind: "AUTO_REPLY" }),
        7,
        none,
      ),
    ).toBe("S5-6");
    expect(
      messageAc(message(5, { sender: "SYSTEM", kind: "HANDOFF" }), 7, none),
    ).toBe("S5-6");
    expect(messageAc(message(8, { sender: "WHOLESALER" }), 7, none)).toBe(
      "S5-5 S6-7 S6-11",
    );
    // 내 글은 연 뒤에 붙어도 "받은 것"이 아니다
    expect(messageAc(message(9), 7, none)).toBe("S5-5");
    const key = "00000000-0000-4000-8000-000000000009";
    expect(
      messageAc(message(9, { clientMessageId: key }), 7, new Set([key])),
    ).toBe("S5-5 S6-4");
  });
});

describe("S5-1 S5-13 입구 주소와 돌아가기", () => {
  it("S5-1 S5-2 방 주소에 보던 경로를 싣는다 — 상품, 도매처 홈만. 인코딩 없이", () => {
    expect(chatRoomHref(1, "/products/11")).toBe("/chats/1?from=/products/11");
    expect(chatRoomHref(1, "/wholesalers/101")).toBe(
      "/chats/1?from=/wholesalers/101",
    );
    expect(chatRoomHref(34, "/search")).toBe("/chats/34");
    expect(chatRoomHref(34, null)).toBe("/chats/34");
  });

  it("S5-13 from이 상품이면 '상품으로 돌아가기', 도매처 홈이면 그 주소", () => {
    expect(returnLinkOf("/products/11", 101)).toEqual({
      href: "/products/11",
      kind: "product",
    });
    expect(returnLinkOf("/wholesalers/102", 101)).toEqual({
      href: "/wholesalers/102",
      kind: "wholesaler",
    });
  });

  it("S5-13 없거나 외부 주소(https://, //)면 버리고 상대 도매처 홈", () => {
    const home = { href: "/wholesalers/101", kind: "wholesaler" };
    expect(returnLinkOf(null, 101)).toEqual(home);
    expect(returnLinkOf("https://x.test", 101)).toEqual(home);
    expect(returnLinkOf("//x.test", 101)).toEqual(home);
    expect(returnLinkOf("/products/11/../../x", 101)).toEqual(home);
    expect(returnLinkOf("/products/abc", 101)).toEqual(home);
  });

  it("S5-4 입구 실패: 404는 '대화할 수 없어요', 403은 승인 대기로, 401은 공용 처리, 나머지는 다시 누르기", () => {
    expect(entryFailureOf(apiError("RESOURCE_NOT_FOUND", 404))).toEqual({
      message: "이 도매처와는 대화할 수 없어요",
    });
    expect(entryFailureOf(apiError("ACCOUNT_NOT_APPROVED", 403))).toBe(
      "approval",
    );
    expect(entryFailureOf(apiError("UNAUTHORIZED", 401))).toBe("session");
    expect(entryFailureOf(apiError("INTERNAL_ERROR", 500))).toEqual({
      message: "대화방을 열지 못했어요. 다시 눌러 주세요",
    });
    expect(entryFailureOf(new TypeError("fetch failed"))).toEqual({
      message: "대화방을 열지 못했어요. 다시 눌러 주세요",
    });
  });

  it("S5-8 방 번호는 양의 정수만 — 아니면 서버에 묻지 않고 404 화면", () => {
    expect(parseRoomId("1")).toBe(1);
    expect(parseRoomId("34")).toBe(34);
    expect(parseRoomId("abc")).toBeNull();
    expect(parseRoomId("0")).toBeNull();
    expect(parseRoomId("-1")).toBeNull();
    expect(parseRoomId("1.5")).toBeNull();
    expect(parseRoomId("99999999999999999999")).toBeNull();
  });
});

describe("S6-3 글자 수", () => {
  it("S6-3 앞뒤 공백을 빼고 코드 포인트로 센다 — 이모지 하나가 1자", () => {
    expect(bodyLength("  👍가 ")).toBe(2);
    expect("👍".length).toBe(2); // JS length 와 다르다
    expect(bodyLength("   \n ")).toBe(0);
  });

  it("S6-3 공백만이면 잠김, 문구 없음", () => {
    expect(checkComposer("   ")).toMatchObject({
      blank: true,
      over: false,
      overMessage: null,
      counter: null,
    });
  });

  it("S6-3 이모지 포함 정확히 1000자는 보낼 수 있고 900자부터 카운터", () => {
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

  it("S6-3 1001자는 자르지 않고 안내, 잠김", () => {
    const over = "👍".repeat(10) + "가".repeat(991);
    expect(checkComposer(over)).toMatchObject({
      length: 1001,
      over: true,
      counter: null,
      overMessage: "1,000자까지 보낼 수 있어요 (1,001/1,000)",
    });
  });
});

describe("S6-4 S6-5 S6-6 보내기 실패와 보류 말풍선", () => {
  const pending: PendingMessage[] = [
    {
      clientMessageId: "k-1",
      body: "레드 M 30장 오늘 출고 되나요?",
      status: "failed",
      failure: "server",
    },
    { clientMessageId: "k-2", body: "또", status: "sending", failure: null },
  ];

  it("S6-5 401(소매 UNAUTHORIZED) → session, S6-6 서버까지 못 감 → offline, 그 밖 → server", () => {
    expect(sendFailureOf(apiError("UNAUTHORIZED", 401))).toBe("session");
    // 도매 어휘(UNAUTHENTICATED)는 소매 401이 아니다
    expect(sendFailureOf(apiError("UNAUTHENTICATED", 401))).toBe("server");
    expect(sendFailureOf(apiError(TRANSPORT_ERROR_CODE.NETWORK, 0))).toBe(
      "offline",
    );
    expect(sendFailureOf(apiError("INTERNAL_ERROR", 500))).toBe("server");
    expect(sendFailureOf(apiError("IDEMPOTENCY_KEY_REUSED", 409))).toBe(
      "server",
    );
    expect(sendFailureOf(new Error("렌더 버그"))).toBe("server");
  });

  it("S6-6 문구: 오프라인만 '연결이 끊겨', 나머지는 '못 보냈어요'", () => {
    expect(failureText("offline")).toBe("연결이 끊겨 못 보냈어요");
    expect(failureText("server")).toBe("못 보냈어요");
    expect(failureText("session")).toBe("못 보냈어요");
  });

  it("S6-4 polling이 같은 clientMessageId를 가져오면 보류 말풍선을 뺀다 — 1개로 합쳐진다", () => {
    const delivered = message(8, {
      clientMessageId: "k-1",
      body: "레드 M 30장 오늘 출고 되나요?",
    });
    expect(
      visiblePending(pending, [message(7), delivered]).map(
        (p) => p.clientMessageId,
      ),
    ).toEqual(["k-2"]);
    expect(visiblePending(pending, [message(7)])).toHaveLength(2);
  });

  it("S6-4 다시 보내기는 제자리에서 상태만 바뀌고, 새 말풍선은 맨 아래", () => {
    const retried = upsertPending(pending, {
      clientMessageId: "k-1",
      body: "레드 M 30장 오늘 출고 되나요?",
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

  it("S6-4 보내기 응답은 메시지에만 넣고 cursor는 올리지 않는다 — 그 앞 도매 메시지를 놓치지 않게", () => {
    const thread: ChatThread = {
      messages: [message(5)],
      cursor: 5,
      failures: 0,
      nextPollMs: 3000,
    };
    const next = insertSent(thread, [message(7, { clientMessageId: "k-1" })]);
    expect(next.cursor).toBe(5);
    expect(next.messages.map((m) => m.sequence)).toEqual([5, 7]);
    // 다음 polling이 6, 7을 가져와도 7은 한 번
    expect(
      mergeMessages(next.messages, [
        message(6, { sender: "WHOLESALER" }),
        message(7),
      ]).map((m) => m.sequence),
    ).toEqual([5, 6, 7]);
  });
});

describe("S6-8 polling 간격", () => {
  it("S6-8 성공이면 3초, 흔들림 없음", () => {
    expect(pollDelayMs(0, 0)).toBe(3000);
    expect(pollDelayMs(0, 0.999)).toBe(3000);
  });

  it("S6-8 연속 실패 1, 2, 3, 4번 → 3, 6, 12, 24초 ±20%", () => {
    for (const [failures, base] of [
      [1, 3000],
      [2, 6000],
      [3, 12000],
      [4, 24000],
    ] as const) {
      expect(pollDelayMs(failures, 0)).toBe(base * 0.8);
      expect(pollDelayMs(failures, 0.5)).toBe(base);
    }
    expect(pollDelayMs(3, 0.999)).toBeCloseTo(12000 * 1.2, -2);
  });

  it("S6-8 상한 경계: random 0과 0.999에서도 최종값이 30초를 넘지 않는다", () => {
    // 4번째 실패: 24초 +20% ≈ 28.8초 — 상한 안
    expect(pollDelayMs(4, 0.999)).toBeLessThanOrEqual(30_000);
    expect(pollDelayMs(4, 0.999)).toBeGreaterThan(28_000);
    // 5번째부터 기준 30초. +20%를 섞어도 30초에서 자르고, −20%는 24초
    for (const failures of [5, 6, 10, 50]) {
      expect(pollDelayMs(failures, 0.999)).toBe(30_000);
      expect(pollDelayMs(failures, 0)).toBe(24_000);
    }
  });
});

describe("S6-11 낭독 알림 — 소매 시점", () => {
  const messages = [
    message(7),
    message(8, { sender: "WHOLESALER", body: "네 내일 오전 10시부터 있어요" }),
    message(9, { body: "감사합니다" }),
  ];

  it("S6-11 연 뒤 온 도매 메시지 중 마지막 것을 '이름: 본문'으로 — 그 뒤 내 말은 건너뛴다", () => {
    expect(liveAnnouncement(messages, 7, "무드온")).toEqual({
      text: "무드온: 네 내일 오전 10시부터 있어요",
      sequence: 8,
    });
  });

  it("S6-11 자동 답도 읽는다 — '무드온 자동 답변: 본문'", () => {
    const auto = [
      ...messages,
      message(10, {
        sender: "WHOLESALER",
        kind: "AUTO_REPLY",
        body: "10장 미만이에요",
      }),
    ];
    expect(liveAnnouncement(auto, 9, "무드온")?.text).toBe(
      "무드온 자동 답변: 10장 미만이에요",
    );
  });

  it("S6-11 첫 로딩(기준점 = 마지막)이면 없음, 내 말이나 시스템 줄만 왔으면 없음", () => {
    expect(liveAnnouncement(messages, 9, "무드온")).toBeNull();
    expect(liveAnnouncement(messages.slice(0, 1), 6, "무드온")).toBeNull();
    expect(
      liveAnnouncement(
        [message(10, { sender: "SYSTEM", kind: "HANDOFF" })],
        9,
        "무드온",
      ),
    ).toBeNull();
  });

  it("S6-11 같은 본문이 연달아 와도 sequence가 달라 새 알림이다", () => {
    const twice = [
      message(10, { sender: "WHOLESALER", body: "네" }),
      message(11, { sender: "WHOLESALER", body: "네" }),
    ];
    const first = liveAnnouncement(twice.slice(0, 1), 9, "무드온");
    const second = liveAnnouncement(twice, 9, "무드온");
    expect(first?.text).toBe(second?.text);
    expect(first?.sequence).not.toBe(second?.sequence);
  });
});
