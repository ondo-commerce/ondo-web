import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  autoReplySeen,
  bubbleKindOf,
  chatRoomHref,
  entryFailureOf,
  formatClock,
  formatDateDivider,
  mergeMessages,
  messageAc,
  parseRoomId,
  returnLinkOf,
  senderLabel,
  systemLineText,
  toThreadItems,
} from "./derive";
import type { ChatMessage } from "./types";

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
