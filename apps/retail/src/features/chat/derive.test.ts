import { ApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  askChipBusy,
  askListingId,
  autoReplySeen,
  cardAddedText,
  choiceSendFailed,
  handoffCauses,
  pendingAc,
  cartAddFailureOf,
  checkCardQty,
  choiceInquiry,
  choicesActive,
  selectedChoice,
  stockAskInquiry,
  stockCardLine,
  toClarifyView,
  toStockCardView,
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

  it("S5-6 data-ac: 기본 S5-5, 자동 답과 사람 넘김 S5-6(되묻기 + S8-3, 재고 답 + S8-4), 연 뒤 받은 도매 글 S6-7 S6-11, 보류를 대신한 것 S6-4", () => {
    const none = new Set<string>();
    expect(messageAc(message(3), 7, none)).toBe("S5-5");
    expect(
      messageAc(
        message(4, { sender: "WHOLESALER", kind: "AUTO_REPLY" }),
        7,
        none,
      ),
    ).toBe("S5-6 S8-4");
    expect(
      messageAc(message(4, { sender: "WHOLESALER", kind: "CLARIFY" }), 7, none),
    ).toBe("S5-6 S8-3");
    expect(
      messageAc(message(5, { sender: "SYSTEM", kind: "HANDOFF" }), 7, none),
    ).toBe("S5-6 S8-10");
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

describe("QA F4 상태별 data-ac — S8-8 S8-10 S8-15", () => {
  const none = new Set<string>();
  const ctx = {
    sessionLost: false,
    handoffCauses: new Set<number>(),
    choiceFailed: false,
  };

  it("S8-10 넘김 줄 바로 앞의 내 말만 넘김을 부른 문의다. 사이에 자동 답이 끼면 잇지 않는다", () => {
    const messages = [
      message(1),
      message(2, { sender: "SYSTEM", kind: "HANDOFF" }),
      message(3),
      message(4, { sender: "WHOLESALER", kind: "AUTO_REPLY" }),
      message(5, { sender: "SYSTEM", kind: "HANDOFF" }),
    ];
    // 순서가 섞여 와도 sequence로 본다
    const causes = handoffCauses([...messages].reverse());
    expect([...causes]).toEqual([1]);
    expect(
      messageAc(message(1), 7, none, { ...ctx, handoffCauses: causes }),
    ).toBe("S5-5 S8-10");
    expect(
      messageAc(message(3), 7, none, { ...ctx, handoffCauses: causes }),
    ).toBe("S5-5");
  });

  it("S8-8 끊긴 방의 자동 답 말풍선, S8-15 옵션 칩 보내기가 실패한 방의 되묻기", () => {
    const auto = message(4, { sender: "WHOLESALER", kind: "AUTO_REPLY" });
    const clarify = message(4, { sender: "WHOLESALER", kind: "CLARIFY" });
    expect(messageAc(auto, 7, none, { ...ctx, sessionLost: true })).toBe(
      "S5-6 S8-4 S8-8",
    );
    expect(messageAc(clarify, 7, none, { ...ctx, sessionLost: true })).toBe(
      "S5-6 S8-3",
    );
    expect(messageAc(clarify, 7, none, { ...ctx, choiceFailed: true })).toBe(
      "S5-6 S8-3 S8-15",
    );
  });

  it("S8-15 못 보낸 옵션 칩 말풍선만 + S8-15. 재고 문의 칩(variant 없음)과 자유 문장은 아니다", () => {
    const choice = {
      intent: "STOCK" as const,
      listingId: 2001,
      variantId: 3002,
      backorderId: null,
      label: "레드 / M",
    };
    const ask = { ...choice, variantId: null, label: null };
    expect(pendingAc({ status: "sending", inquiry: choice })).toBe("S6-1");
    expect(pendingAc({ status: "failed", inquiry: choice })).toBe("S6-4 S8-15");
    expect(pendingAc({ status: "failed", inquiry: ask })).toBe("S6-4");
    expect(pendingAc({ status: "failed", inquiry: null })).toBe("S6-4");
    expect(choiceSendFailed([{ status: "failed", inquiry: choice }])).toBe(
      true,
    );
    expect(
      choiceSendFailed([
        { status: "sending", inquiry: choice },
        { status: "failed", inquiry: ask },
      ]),
    ).toBe(false);
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
      inquiry: null,
      status: "failed",
      failure: "server",
    },
    {
      clientMessageId: "k-2",
      body: "또",
      inquiry: null,
      status: "sending",
      failure: null,
    },
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
      inquiry: null,
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
      inquiry: null,
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

/* ------------------------------------------------------------------------
 * loop-05b S8 — 재고 문의 칩, 되묻기 칩, 재고 카드, 장바구니 담기 (+ S7-13 소매 조회 시각)
 * ------------------------------------------------------------------------ */

const CHOICES = [
  { variantId: 3001, label: "레드 / S", orderable: true },
  { variantId: 3002, label: "레드 / M", orderable: true },
  { variantId: 3003, label: "레드 / L", orderable: true },
  { variantId: 3004, label: "네이비 / S", orderable: true },
  { variantId: 3005, label: "네이비 / M", orderable: true },
];

const CLARIFY_AT = "2026-10-28T10:20:00+09:00";

function clarify(
  sequence: number,
  patch: Partial<NonNullable<ChatMessage["autoReply"]>> = {},
): ChatMessage {
  return message(sequence, {
    sender: "WHOLESALER",
    kind: "CLARIFY",
    body: "어떤 색상, 사이즈요?",
    sentAt: CLARIFY_AT,
    autoReply: {
      ...AUTO_REPLY,
      replyToSequence: sequence - 1,
      subject: {
        listingId: 2001,
        variantId: null,
        backorderId: null,
        label: "빈티지 플라워 셔츠",
      },
      facts: { stock: null, backorder: null, receivable: null },
      choices: CHOICES,
      ...patch,
    },
  });
}

function stockReply(
  sequence: number,
  stock: NonNullable<NonNullable<ChatMessage["autoReply"]>["facts"]["stock"]>,
  variantId = 3002,
  label = "빈티지 플라워 셔츠 레드 / M",
): ChatMessage {
  return message(sequence, {
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: "레드 M은 10~49장 있어요. 지금 주문할 수 있어요(한 번에 최대 500장)",
    autoReply: {
      ...AUTO_REPLY,
      subject: { listingId: 2001, variantId, backorderId: null, label },
      facts: { stock, backorder: null, receivable: null },
    },
  });
}

const MIN = 60_000;
const at = (iso: string, minutes: number) => Date.parse(iso) + minutes * MIN;

function pendingOf(patch: Partial<PendingMessage> = {}): PendingMessage {
  return {
    clientMessageId: "k-p",
    body: "레드 / M",
    inquiry: null,
    status: "sending",
    failure: null,
    ...patch,
  };
}

describe("S7-13 소매 조회 시각 — 모든 자동 답", () => {
  it("S7-13 재고, 되묻기, 미송, 미수 자동 답 전부 checkedAt 서울 HH:mm + ' 조회'", () => {
    const checkedAt = "2026-10-28T01:20:00Z";
    for (const intent of ["STOCK", "BACKORDER", "RECEIVABLE"] as const) {
      expect(
        autoReplySeen({ autoReply: { ...AUTO_REPLY, intent, checkedAt } }),
      ).toBe("10:20 조회");
    }
    expect(autoReplySeen(clarify(4, { checkedAt }))).toBe("10:20 조회");
    // 자정 넘는 UTC → 서울 시각
    expect(
      autoReplySeen({
        autoReply: { ...AUTO_REPLY, checkedAt: "2026-10-27T15:05:00Z" },
      }),
    ).toBe("00:05 조회");
  });
});

describe("S8-1 S8-2 재고 문의 칩", () => {
  it("S8-1 상품 상세에서 연 방만 칩이 묻는다 — 도매처 홈, from 없음, 외부 주소는 null", () => {
    expect(askListingId("/products/2001")).toBe(2001);
    expect(askListingId("/wholesalers/101")).toBeNull();
    expect(askListingId(null)).toBeNull();
    expect(askListingId("https://x.test/products/2001")).toBeNull();
    expect(askListingId("/products/2001/x")).toBeNull();
  });

  it("S8-1 칩 본문의 inquiry는 {STOCK, listingId, variantId null, backorderId null, label null}", () => {
    expect(stockAskInquiry(2001)).toEqual({
      intent: "STOCK",
      listingId: 2001,
      variantId: null,
      backorderId: null,
      label: null,
    });
  });

  it("S8-2 칩이 보낸 말풍선이 응답 전이면 칩 잠김. 실패, 옵션 칩, 자유 문장은 칩을 잠그지 않는다", () => {
    const ask = stockAskInquiry(2001);
    expect(askChipBusy([pendingOf({ inquiry: ask })])).toBe(true);
    expect(
      askChipBusy([
        pendingOf({ inquiry: ask, status: "failed", failure: "server" }),
      ]),
    ).toBe(false);
    expect(
      askChipBusy([pendingOf({ inquiry: choiceInquiry(2001, CHOICES[1]!) })]),
    ).toBe(false);
    expect(askChipBusy([pendingOf()])).toBe(false);
    expect(askChipBusy([])).toBe(false);
  });
});

describe("S8-4 S8-16 되묻기 칩 — choicesActive, selectedChoice", () => {
  const ask = message(3, {
    body: "이 셔츠 몇 장 남았어요?",
    sentAt: CLARIFY_AT,
  });
  const now = at(CLARIFY_AT, 1);

  it("S8-3 마지막 되묻기이고 그 뒤 아무 말도 없고 30분 안이면 활성. 30분 정각까지 활성, 31분 잠김", () => {
    const messages = [ask, clarify(4)];
    expect(choicesActive(messages, [], 4, now)).toBe(true);
    expect(choicesActive(messages, [], 4, at(CLARIFY_AT, 30))).toBe(true);
    expect(choicesActive(messages, [], 4, at(CLARIFY_AT, 31))).toBe(false);
  });

  it("S8-4 고른 뒤(소매 메시지) 잠김, 보내는 중이나 못 보낸 말풍선이 있어도 잠김(결정 28)", () => {
    const answered = [
      ask,
      clarify(4),
      message(5, {
        body: "레드 / M",
        inquiry: choiceInquiry(2001, CHOICES[1]!),
      }),
    ];
    expect(choicesActive(answered, [], 4, now)).toBe(false);
    expect(choicesActive([ask, clarify(4)], [pendingOf()], 4, now)).toBe(false);
    expect(
      choicesActive(
        [ask, clarify(4)],
        [pendingOf({ status: "failed", failure: "server" })],
        4,
        now,
      ),
    ).toBe(false);
  });

  it("S8-16 도매 사람 답(TEXT)이 오면 잠김. 자동 답(AUTO_REPLY)이나 넘김 줄은 잠그지 않는다", () => {
    const human = message(5, { sender: "WHOLESALER", body: "잠시만요" });
    expect(choicesActive([ask, clarify(4), human], [], 4, now)).toBe(false);
    const handoff = message(5, { sender: "SYSTEM", kind: "HANDOFF" });
    expect(choicesActive([ask, clarify(4), handoff], [], 4, now)).toBe(true);
  });

  it("S8-16 재문의로 새 되묻기가 오면 옛 줄은 잠기고 새 줄만 활성", () => {
    const messages = [
      ask,
      clarify(4),
      message(5, {
        body: "레드 / M",
        inquiry: choiceInquiry(2001, CHOICES[1]!),
      }),
      stockReply(6, { band: "UNDER_50", orderLimit: 500, orderable: true }),
      message(7, { body: "이 셔츠 몇 장 남았어요?", sentAt: CLARIFY_AT }),
      clarify(8),
    ];
    expect(choicesActive(messages, [], 4, now)).toBe(false);
    expect(choicesActive(messages, [], 8, now)).toBe(true);
  });

  it("S8-3 보기가 없는 되묻기(05a 시드), 되묻기가 아닌 메시지, 없는 sequence는 비활성", () => {
    expect(
      choicesActive([ask, clarify(4, { choices: null })], [], 4, now),
    ).toBe(false);
    expect(choicesActive([ask, clarify(4)], [], 3, now)).toBe(false);
    expect(choicesActive([ask, clarify(4)], [], 99, now)).toBe(false);
  });

  it("S8-4 고른 칩: 칩으로 고르면 inquiry.variantId, 칩 글자를 쳤으면 본문, 딴소리면 null. 보류 말풍선도 본다", () => {
    expect(
      selectedChoice(
        [
          ask,
          clarify(4),
          message(5, {
            body: "레드 / M",
            inquiry: choiceInquiry(2001, CHOICES[1]!),
          }),
        ],
        [],
        4,
      )?.variantId,
    ).toBe(3002);
    expect(
      selectedChoice(
        [ask, clarify(4), message(5, { body: " 네이비 / S " })],
        [],
        4,
      )?.variantId,
    ).toBe(3004);
    expect(
      selectedChoice(
        [ask, clarify(4), message(5, { body: "배송은 언제 돼요" })],
        [],
        4,
      ),
    ).toBeNull();
    expect(
      selectedChoice(
        [ask, clarify(4)],
        [
          pendingOf({
            inquiry: choiceInquiry(2001, CHOICES[2]!),
            status: "failed",
          }),
        ],
        4,
      )?.variantId,
    ).toBe(3003);
    expect(selectedChoice([ask, clarify(4)], [], 4)).toBeNull();
  });

  it("S8-4 옵션 칩의 inquiry는 {STOCK, 2001, 3002, label: 칩 글자}", () => {
    expect(choiceInquiry(2001, CHOICES[1]!)).toEqual({
      intent: "STOCK",
      listingId: 2001,
      variantId: 3002,
      backorderId: null,
      label: "레드 / M",
    });
  });

  it("S8-3 toClarifyView: 보기 5개, 게시글 id, 활성, 고른 것. 보기 없거나 되묻기가 아니면 null", () => {
    const view = toClarifyView(clarify(4), [ask, clarify(4)], [], now);
    expect(view).toEqual({
      mode: "stock",
      listingId: 2001,
      choices: CHOICES,
      active: true,
      selectedKey: null,
    });
    expect(
      toClarifyView(
        clarify(4, { choices: null }),
        [ask, clarify(4, { choices: null })],
        [],
        now,
      ),
    ).toBeNull();
    expect(toClarifyView(ask, [ask], [], now)).toBeNull();
  });
});

describe("S8-4 S8-9 재고 카드 — toStockCardView, stockCardLine", () => {
  const orderable = {
    band: "UNDER_50",
    orderLimit: 500,
    orderable: true,
  } as const;

  it("S8-4 옵션 이름은 같은 방 되묻기 보기의 글자 '레드 / M', 구간 '10~49장', 담기 가능", () => {
    const reply = stockReply(6, orderable);
    expect(toStockCardView(reply, [clarify(4), reply])).toEqual({
      variantId: 3002,
      optionName: "레드 / M",
      band: "UNDER_50",
      bandLabel: "10~49장",
      orderable: true,
      orderLimit: 500,
      addable: true,
    });
    expect(stockCardLine(toStockCardView(reply, [reply])!)).toEqual([
      { text: "레드 / M", strong: true },
      { text: " 재고 ", strong: false },
      { text: "10~49장", strong: true },
      { text: ", 지금 주문할 수 있어요", strong: false },
      { text: ", 한 번에 최대 ", strong: false },
      { text: "500장", strong: true },
    ]);
  });

  it("S8-9 되묻기 없이 바로 온 재고 0 → label 끝 '레드 / L', '재고 없음', 담기 불가, 한 줄에 주문 문장 없음", () => {
    const reply = stockReply(
      6,
      { band: "NONE", orderLimit: null, orderable: true },
      3003,
      "빈티지 플라워 셔츠 레드 / L",
    );
    const card = toStockCardView(reply, [reply])!;
    expect(card).toMatchObject({
      optionName: "레드 / L",
      bandLabel: "재고 없음",
      addable: false,
    });
    expect(
      stockCardLine(card)
        .map((p) => p.text)
        .join(""),
    ).toBe("레드 / L 재고 없음");
  });

  it("S8-4 구간 글자 표 4개(결정 20), 한도 null이면 한도 조각 없음, 주문 불가면 담기 불가", () => {
    const labels = (
      ["NONE", "UNDER_10", "UNDER_50", "FIFTY_PLUS"] as const
    ).map(
      (band) =>
        toStockCardView(
          stockReply(6, { band, orderLimit: null, orderable: true }),
          [],
        )?.bandLabel,
    );
    expect(labels).toEqual(["재고 없음", "1~9장", "10~49장", "50장 이상"]);
    const noLimit = toStockCardView(
      stockReply(6, { band: "FIFTY_PLUS", orderLimit: null, orderable: true }),
      [],
    )!;
    expect(
      stockCardLine(noLimit)
        .map((p) => p.text)
        .join(""),
    ).toBe("레드 / M 재고 50장 이상, 지금 주문할 수 있어요");
    const closed = toStockCardView(
      stockReply(6, { band: "UNDER_10", orderLimit: 500, orderable: false }),
      [],
    )!;
    expect(closed.addable).toBe(false);
    expect(
      stockCardLine(closed)
        .map((p) => p.text)
        .join(""),
    ).toBe("레드 / M 재고 1~9장, 지금은 주문할 수 없어요");
  });

  it("S8-10 재고 답이 아닌 것(되묻기, 미송 답, 대상 없음, TEXT)은 카드 없음", () => {
    expect(toStockCardView(clarify(4), [])).toBeNull();
    const backorder = stockReply(6, orderable);
    expect(
      toStockCardView(
        {
          ...backorder,
          autoReply: { ...backorder.autoReply!, intent: "BACKORDER" },
        },
        [],
      ),
    ).toBeNull();
    expect(
      toStockCardView(stockReply(6, orderable, null as unknown as number), []),
    ).toBeNull();
    expect(toStockCardView(message(6), [])).toBeNull();
  });

  it("S7-11 카드 뷰에 정확 수량 칸이 없다 — 소매 facts 그대로", () => {
    const card = toStockCardView(stockReply(6, orderable), [])!;
    expect(Object.keys(card)).not.toContain("availableQty");
    expect(JSON.stringify(stockCardLine(card))).not.toMatch(/35/);
  });
});

describe("S8-6 카드 수량 칸 — checkCardQty", () => {
  it.each([
    ["0", 500, "1장 이상 넣어 주세요"],
    ["", 500, "1장 이상 넣어 주세요"],
    ["   ", 500, "1장 이상 넣어 주세요"],
    ["abc", 500, "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
    ["2.5", 500, "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
    ["-1", 500, "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
    ["１", 500, "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
    ["1e3", 500, "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
    ["501", 500, "한 번에 500장까지 담을 수 있어요"],
    ["31", 30, "한 번에 30장까지 담을 수 있어요"],
    ["501", null, "한 번에 500장까지 담을 수 있어요"],
  ])("S8-6 %j (한도 %s) → 잠김: %s", (text, limit, reason) => {
    expect(checkCardQty(text, limit)).toEqual({ qty: null, reason });
  });

  it.each([
    ["1", 500, 1],
    ["500", 500, 500],
    [" 3 ", 500, 3],
    ["500", null, 500],
    ["30", 30, 30],
    // 한도 0은 한도 없음(스펙: 0이면 무제한) — SKU 상한 500
    ["500", 0, 500],
  ])("S8-6 %j (한도 %s) → %d장", (text, limit, qty) => {
    expect(checkCardQty(text, limit)).toEqual({ qty, reason: null });
  });
});

describe("S8-5 S8-7 S8-8 담기 결과", () => {
  it("S8-5 처음 담으면 '장바구니에 담았어요', 같은 SKU 다시 담아 2장이면 '(지금 2장)'", () => {
    expect(cardAddedText(1)).toBe("장바구니에 담았어요");
    expect(cardAddedText(2)).toBe("장바구니에 담았어요(지금 2장)");
    expect(cardAddedText(1200)).toBe("장바구니에 담았어요(지금 1,200장)");
  });

  it("S8-7 S8-8 실패: 403 → 승인 대기, 400 → 서버 문구, 500, 연결 실패, 모르는 오류 → 다시 눌러 주세요", () => {
    expect(cartAddFailureOf(apiError("ACCOUNT_NOT_APPROVED", 403))).toBe(
      "approval",
    );
    expect(
      cartAddFailureOf(
        new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          message: "입력값이 올바르지 않습니다.",
          fieldErrors: [
            { field: "qty", code: "MIN", message: "1 이상이어야 합니다." },
          ],
        }),
      ),
    ).toEqual({ message: "1 이상이어야 합니다." });
    expect(cartAddFailureOf(apiError("VALIDATION_FAILED", 400))).toEqual({
      message: "VALIDATION_FAILED",
    });
    const retry = { message: "장바구니에 담지 못했어요. 다시 눌러 주세요" };
    expect(cartAddFailureOf(apiError("INTERNAL_ERROR", 500))).toEqual(retry);
    expect(cartAddFailureOf(apiError(TRANSPORT_ERROR_CODE.NETWORK, 0))).toEqual(
      retry,
    );
    expect(cartAddFailureOf(new Error("x"))).toEqual(retry);
  });
});

describe("S8-14 S8-15 응답의 자동 답, polling, 다시 보내기", () => {
  it("S8-14 보내기 응답(내 글 + 되묻기) 뒤 polling 3회가 같은 sequence를 또 가져와도 하나씩, 오름차순", () => {
    const thread: ChatThread = {
      messages: [message(7)],
      cursor: 7,
      failures: 0,
      nextPollMs: 3000,
    };
    const sent = insertSent(thread, [
      message(8, { clientMessageId: "k-8" }),
      clarify(9),
    ]);
    let messages = sent.messages;
    for (let i = 0; i < 3; i++)
      messages = mergeMessages(messages, [
        message(8, { clientMessageId: "k-8" }),
        clarify(9),
      ]);
    expect(messages.map((m) => m.sequence)).toEqual([7, 8, 9]);
    expect(sent.cursor).toBe(7);
  });

  it("S8-15 다시 보내기는 같은 키, 같은 {body, inquiry} — 보류 말풍선이 inquiry를 들고 있다", () => {
    const inquiry = choiceInquiry(2001, CHOICES[1]!);
    const failed = pendingOf({
      clientMessageId: "k-r",
      inquiry,
      status: "failed",
      failure: "server",
    });
    const [retried] = upsertPending([failed], {
      ...failed,
      status: "sending",
      failure: null,
    });
    expect(retried).toMatchObject({
      clientMessageId: "k-r",
      body: "레드 / M",
      inquiry: {
        intent: "STOCK",
        listingId: 2001,
        variantId: 3002,
        backorderId: null,
        label: "레드 / M",
      },
    });
  });

  it("S8-12 응답으로 온 되묻기는 live 영역에 '무드온 자동 답변: 본문', 내 칩 보내기만으로는 없음", () => {
    expect(
      liveAnnouncement(
        [message(7), message(8, { body: "레드 / M" })],
        7,
        "무드온",
      ),
    ).toBeNull();
    expect(
      liveAnnouncement([message(7), message(8), clarify(9)], 7, "무드온"),
    ).toEqual({
      text: "무드온 자동 답변: 어떤 색상, 사이즈요?",
      sequence: 9,
    });
  });
});
