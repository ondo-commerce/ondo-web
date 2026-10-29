import { describe, expect, it } from "vitest";
import {
  backorderChoiceInquiry,
  backorderStateLine,
  choiceKey,
  choicesActive,
  isBackorderClarify,
  messageAc,
  selectedChoice,
  toBackorderReplyView,
  toClarifyView,
  toStockCardView,
} from "./derive";
import type { ChatChoice, ChatMessage, PendingMessage } from "./types";

/*
 * loop-06 S3 — 미송 되묻기 보기(선택 키 backorderId), 미송 답 카드. 목 시드(`mocks/wholesale/backorder.ts`)와 같은
 * 값을 쓴다: 9001 9006은 같은 SKU 3003(빈티지 플라워 셔츠 레드/L), 9002 데님 3011, 9003 린넨 3019.
 */

const T0 = "2026-10-29T14:20:00+09:00";
const NOW = Date.parse(T0) + 60_000;

const CHOICES: ChatChoice[] = [
  {
    variantId: 3003,
    label: "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001",
    orderable: false,
    kind: "BACKORDER",
    backorderId: 9001,
  },
  {
    variantId: 3011,
    label: "와이드 데님 팬츠 소라/M, 남은 1장, 9/6 주문 #7002",
    orderable: false,
    kind: "BACKORDER",
    backorderId: 9002,
  },
  {
    variantId: 3003,
    label: "빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006",
    orderable: false,
    kind: "BACKORDER",
    backorderId: 9006,
  },
  {
    variantId: 3019,
    label: "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003",
    orderable: false,
    kind: "BACKORDER",
    backorderId: 9003,
  },
  {
    variantId: 0,
    label: "다른 주문이에요",
    orderable: false,
    kind: "NOT_LISTED",
    backorderId: null,
  },
];

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
    sentAt: T0,
    inquiry: null,
    autoReply: null,
    ...patch,
  };
}

const ask = message(3, { body: "지난주 주문한 거 언제 와요?" });

function clarify(sequence: number, choices: ChatChoice[] = CHOICES) {
  return message(sequence, {
    sender: "WHOLESALER",
    kind: "CLARIFY",
    body: "어느 주문이요?",
    autoReply: {
      intent: "BACKORDER",
      replyToSequence: sequence - 1,
      generatedBy: "RULE",
      checkedAt: T0,
      subject: {
        listingId: null,
        variantId: null,
        backorderId: null,
        label: null,
      },
      facts: { stock: null, backorder: null, receivable: null },
      choices,
    },
  });
}

function backorderReply(
  sequence: number,
  backorder: {
    backorderId: number;
    label: string;
    qty: number;
    date: string | null;
    reason: string | null;
    checkedAt?: string;
  },
) {
  return message(sequence, {
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: "답",
    autoReply: {
      intent: "BACKORDER",
      replyToSequence: sequence - 1,
      generatedBy: "RULE",
      checkedAt: backorder.checkedAt ?? T0,
      subject: {
        listingId: null,
        variantId: 3019,
        backorderId: backorder.backorderId,
        label: backorder.label,
      },
      facts: {
        stock: null,
        backorder: {
          qty: backorder.qty,
          expectedInboundDate: backorder.date,
          expectedInboundReason: backorder.reason,
        },
        receivable: null,
      },
      choices: null,
    },
  });
}

function pendingOf(patch: Partial<PendingMessage> = {}): PendingMessage {
  return {
    clientMessageId: "11111111-1111-4111-8111-111111111111",
    body: CHOICES[3]!.label,
    inquiry: backorderChoiceInquiry(CHOICES[3]!),
    status: "sending",
    failure: null,
    ...patch,
  };
}

describe("S3-2 backorderChoiceInquiry — 보내는 문맥", () => {
  it("미송 보기 → {BACKORDER, backorderId, variantId: 그 SKU, listingId: null}", () => {
    expect(backorderChoiceInquiry(CHOICES[3]!)).toEqual({
      intent: "BACKORDER",
      listingId: null,
      variantId: 3019,
      backorderId: 9003,
      label: "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003",
    });
  });

  it("다른 주문이에요 → {BACKORDER, notListed: true}, variantId와 backorderId는 null", () => {
    expect(backorderChoiceInquiry(CHOICES[4]!)).toEqual({
      intent: "BACKORDER",
      listingId: null,
      variantId: null,
      backorderId: null,
      label: "다른 주문이에요",
      notListed: true,
    });
  });
});

describe("S3-1 S3-2 미송 되묻기 보기 — 키, 선택, 활성", () => {
  it("choiceKey — 미송은 backorderId, 같은 SKU 9001과 9006도 다른 키. 칸 없는 보기는 VARIANT", () => {
    expect(choiceKey(CHOICES[0]!)).toBe("backorder:9001");
    expect(choiceKey(CHOICES[2]!)).toBe("backorder:9006");
    expect(choiceKey(CHOICES[4]!)).toBe("not-listed");
    expect(choiceKey({ variantId: 3002, backorderId: undefined })).toBe(
      "variant:3002",
    );
  });

  it("isBackorderClarify — 의도 BACKORDER 또는 미송 보기가 있는 되묻기", () => {
    expect(isBackorderClarify(clarify(4))).toBe(true);
    expect(isBackorderClarify(ask)).toBe(false);
  });

  it("toClarifyView — 게시글 문맥(listingId) 없이도 미송 보기를 그린다, 순서 그대로", () => {
    const view = toClarifyView(clarify(4), [ask, clarify(4)], [], NOW);
    expect(view).toEqual({
      mode: "backorder",
      listingId: null,
      choices: CHOICES,
      active: true,
      selectedKey: null,
    });
    expect(view?.choices.map((c) => c.backorderId)).toEqual([
      9001,
      9002,
      9006,
      9003,
      null,
    ]);
  });

  it("selectedChoice — 같은 SKU 두 보기 중 backorderId로 고른 9006만", () => {
    const messages = [
      ask,
      clarify(4),
      message(5, {
        body: CHOICES[2]!.label,
        inquiry: backorderChoiceInquiry(CHOICES[2]!),
      }),
    ];
    expect(selectedChoice(messages, [], 4)?.backorderId).toBe(9006);
    expect(toClarifyView(messages[1]!, messages, [], NOW)?.selectedKey).toBe(
      "backorder:9006",
    );
  });

  it("selectedChoice — 보내는 중 말풍선이면 그 보기, notListed면 다른 주문이에요", () => {
    expect(
      selectedChoice([ask, clarify(4)], [pendingOf()], 4)?.backorderId,
    ).toBe(9003);
    const notListed = [
      ask,
      clarify(4),
      message(5, {
        body: "다른 주문이에요",
        inquiry: backorderChoiceInquiry(CHOICES[4]!),
      }),
    ];
    expect(choiceKey(selectedChoice(notListed, [], 4)!)).toBe("not-listed");
  });

  it("selectedChoice — 손으로 친 '다른 주문이에요'는 고른 것으로 보지 않는다(서버가 새로 판정, S3-4)", () => {
    const typed = [
      ask,
      clarify(4),
      message(5, { body: "다른 주문이에요", inquiry: null }),
    ];
    expect(selectedChoice(typed, [], 4)).toBeNull();
  });

  it("choicesActive — 보내는 중이면 잠기고, 못 보내면(실패) 풀린다. 고른 표시도 사라진다", () => {
    const messages = [ask, clarify(4)];
    expect(choicesActive(messages, [pendingOf()], 4, NOW)).toBe(false);
    const failed = pendingOf({ status: "failed", failure: "server" });
    expect(choicesActive(messages, [failed], 4, NOW)).toBe(true);
    expect(selectedChoice(messages, [failed], 4)).toBeNull();
  });

  it("choicesActive — 서버에 간 선택 뒤(새로고침 뒤 포함)는 잠김, 고른 표시 그대로", () => {
    const messages = [
      ask,
      clarify(4),
      message(5, {
        body: CHOICES[2]!.label,
        inquiry: backorderChoiceInquiry(CHOICES[2]!),
      }),
    ];
    expect(choicesActive(messages, [], 4, NOW)).toBe(false);
    expect(selectedChoice(messages, [], 4)?.backorderId).toBe(9006);
  });

  it("messageAc — 미송 되묻기 S3-1, 미송 답 S3-3. 재고 것은 그대로 S8-3 S8-4", () => {
    expect(messageAc(clarify(4), 99, new Set())).toBe("S5-6 S3-1");
    const reply = backorderReply(5, {
      backorderId: 9003,
      label: "린넨 셋업 자켓 베이지 / L",
      qty: 2,
      date: "2026-11-05",
      reason: null,
    });
    expect(messageAc(reply, 99, new Set())).toBe("S5-6 S3-3");
  });
});

describe("S3-3 toBackorderReplyView, backorderStateLine — 미송 답 카드", () => {
  const linen = {
    backorderId: 9003,
    label: "린넨 셋업 자켓 베이지 / L",
    qty: 2,
    reason: "원단 수급 지연",
  };

  it("예정(T0+7) — 대상, 주문 조각, 남은 미송 2장, 도매 입고 예정 11월 5일, 사유", () => {
    const reply = backorderReply(6, { ...linen, date: "2026-11-05" });
    const card = toBackorderReplyView(reply, [ask, clarify(4), reply]);
    expect(card).toEqual({
      backorderId: 9003,
      target: "린넨 셋업 자켓 베이지 / L",
      order: "9/7 주문 #7003",
      qtyLabel: "2장",
      state: "FUTURE",
      dateLabel: "11월 5일",
      reason: "원단 수급 지연",
    });
    expect(backorderStateLine(card!)).toEqual([
      { text: "도매 입고 예정 ", strong: false },
      { text: "11월 5일", strong: true },
    ]);
  });

  it("오늘 — '도매 입고 예정 오늘', 사유 있음", () => {
    const reply = backorderReply(6, { ...linen, date: "2026-10-29" });
    const card = toBackorderReplyView(reply, [reply])!;
    expect(card.state).toBe("TODAY");
    expect(card.reason).toBe("원단 수급 지연");
    expect(
      backorderStateLine(card)
        .map((p) => p.text)
        .join(""),
    ).toBe("도매 입고 예정 오늘");
  });

  it("미정(9002) — '입고일 미정', 사유 없음", () => {
    const reply = backorderReply(6, {
      backorderId: 9002,
      label: "와이드 데님 팬츠 소라 / M",
      qty: 1,
      date: null,
      reason: "공장 확인 중",
    });
    const card = toBackorderReplyView(reply, [clarify(4), reply])!;
    expect(card.state).toBe("NONE");
    expect(card.reason).toBeNull();
    expect(card.order).toBe("9/6 주문 #7002");
    expect(backorderStateLine(card)).toEqual([
      { text: "입고일 미정", strong: true },
    ]);
  });

  it("지남(9001, T0−3) — '등록 예정일 지남 (10월 26일)', 사유 없음, '지연' 낱말 없음", () => {
    const reply = backorderReply(6, {
      backorderId: 9001,
      label: "빈티지 플라워 셔츠 레드 / L",
      qty: 4,
      date: "2026-10-26",
      reason: "공장 재입고 예정",
    });
    const card = toBackorderReplyView(reply, [clarify(4), reply])!;
    expect(card.state).toBe("PAST");
    expect(card.reason).toBeNull();
    const line = backorderStateLine(card)
      .map((p) => p.text)
      .join("");
    expect(line).toBe("등록 예정일 지남 (10월 26일)");
    expect(line).not.toContain("지연");
  });

  it("'오늘'은 답을 만든 시각(checkedAt)의 서울 날짜 — UTC 14:59:59Z 는 그날, 15:00:00Z 는 다음 날", () => {
    const due = { ...linen, date: "2026-10-29" };
    expect(
      toBackorderReplyView(
        backorderReply(6, { ...due, checkedAt: "2026-10-29T14:59:59Z" }),
        [],
      )?.state,
    ).toBe("TODAY");
    expect(
      toBackorderReplyView(
        backorderReply(6, { ...due, checkedAt: "2026-10-29T15:00:00Z" }),
        [],
      )?.state,
    ).toBe("PAST");
  });

  it("다른 해 입고일은 연도를 붙인다, 다른 해 주문 조각도 그대로", () => {
    const reply = backorderReply(6, { ...linen, date: "2027-01-05" });
    const old = clarify(4, [
      {
        ...CHOICES[3]!,
        label: "린넨 셋업 자켓 베이지/L, 남은 2장, 2025/12/30 주문 #7003",
      },
    ]);
    const card = toBackorderReplyView(reply, [old, reply])!;
    expect(card.dateLabel).toBe("2027년 1월 5일");
    expect(card.order).toBe("2025/12/30 주문 #7003");
  });

  it("보기 없이 바로 온 답은 주문 조각 없이 대상만, 미송 답이 아니면 null", () => {
    const reply = backorderReply(6, { ...linen, date: "2026-11-05" });
    expect(toBackorderReplyView(reply, [reply])?.order).toBeNull();
    expect(toBackorderReplyView(clarify(4), [clarify(4)])).toBeNull();
    expect(toBackorderReplyView(ask, [ask])).toBeNull();
  });

  it("재고 카드 옵션 이름은 미송 보기 글자를 쓰지 않는다(같은 variantId라도)", () => {
    const stock = message(8, {
      sender: "WHOLESALER",
      kind: "AUTO_REPLY",
      body: "답",
      autoReply: {
        intent: "STOCK",
        replyToSequence: 7,
        generatedBy: "RULE",
        checkedAt: T0,
        subject: {
          listingId: 2001,
          variantId: 3003,
          backorderId: null,
          label: "빈티지 플라워 셔츠 레드 / L",
        },
        facts: {
          stock: { band: "UNDER_10", orderLimit: null, orderable: true },
          backorder: null,
          receivable: null,
        },
        choices: null,
      },
    });
    expect(toStockCardView(stock, [clarify(4), stock])?.optionName).toBe(
      "레드 / L",
    );
  });
});
