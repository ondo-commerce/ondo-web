import { describe, expect, it } from "vitest";
import {
  autoReplySeen,
  checkedLabel,
  messageAc,
  partsText,
  toReceivableReplyView,
} from "./derive";
import type { ChatMessage } from "./types";

/*
 * loop-07 S2 — 소매 미수 답 카드와 날짜 붙은 조회 시각. 금액은 정산 목 시드와 같다:
 * (무드온 101, 봄봄 1) 37,500원 기한 지남 1건 54일, (102, 1) 52,000원 연체 0(기획 §5-4 5).
 */

const T0 = "2026-10-29T14:20:00+09:00";
const NOW = Date.parse(T0) + 60_000;

type Receivable = NonNullable<
  NonNullable<ChatMessage["autoReply"]>["facts"]["receivable"]
>;

function receivableReply(
  receivable: Receivable | null,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 2005,
    roomId: 1,
    sequence: 5,
    clientMessageId: null,
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요",
    sentAt: T0,
    inquiry: null,
    autoReply: {
      intent: "RECEIVABLE",
      replyToSequence: 4,
      generatedBy: "RULE",
      checkedAt: T0,
      subject: {
        listingId: null,
        variantId: null,
        backorderId: null,
        label: null,
      },
      facts: { stock: null, backorder: null, receivable },
    },
    ...patch,
  };
}

function facts(
  outstandingAmount: number,
  prepaidAmount: number,
  overdue: Receivable["overdue"] = { count: 0, amount: 0, maxDaysOverdue: 0 },
): Receivable {
  return { outstandingAmount, prepaidAmount, overdue };
}

function linesOf(message: ChatMessage, wholesalerId = 101): string[] {
  const view = toReceivableReplyView(message, wholesalerId);
  return view === null ? [] : view.lines.map(partsText);
}

describe("S2-1 미수 답 카드 — 장면 3 값", () => {
  it("S2-1 방 1 (101, 1): 갚을 돈 37,500원 / 기한 지남 1건 37,500원 (최대 54일), 선수금 줄 0, 링크 101", () => {
    const message = receivableReply(
      facts(37_500, 0, { count: 1, amount: 37_500, maxDaysOverdue: 54 }),
    );
    expect(linesOf(message)).toEqual([
      "갚을 돈 37,500원",
      "기한 지남 1건 37,500원 (최대 54일)",
    ]);
    expect(toReceivableReplyView(message, 101)?.settlementHref).toBe(
      "/settlements?wholesaler=101",
    );
  });

  it("S2-1 방 33 (102, 1): 갚을 돈 52,000원 / 기한 지난 것 없음, '37,500' 0, 링크 102", () => {
    const message = receivableReply(facts(52_000, 0), {
      roomId: 33,
      body: "갚을 돈은 52,000원이에요. 기한 지난 것은 없어요",
    });
    const lines = linesOf(message, 102);
    expect(lines).toEqual(["갚을 돈 52,000원", "기한 지난 것 없음"]);
    expect(lines.join("\n")).not.toContain("37,500");
    expect(toReceivableReplyView(message, 102)?.settlementHref).toBe(
      "/settlements?wholesaler=102",
    );
  });

  it("S2-1 굵게는 금액과 건수만", () => {
    const view = toReceivableReplyView(
      receivableReply(
        facts(37_500, 0, { count: 1, amount: 37_500, maxDaysOverdue: 54 }),
      ),
      101,
    );
    const strong = view?.lines.flatMap((line) =>
      line.filter((part) => part.strong).map((part) => part.text),
    );
    expect(strong).toEqual(["37,500원", "1건 37,500원"]);
  });

  it("S2-1 미수 답이 아니거나 근거가 없으면 카드 없음", () => {
    expect(toReceivableReplyView(receivableReply(null), 101)).toBeNull();
    const stock = receivableReply(facts(1, 0));
    expect(
      toReceivableReplyView(
        {
          ...stock,
          autoReply: stock.autoReply && {
            ...stock.autoReply,
            intent: "STOCK",
          },
        },
        101,
      ),
    ).toBeNull();
    expect(
      toReceivableReplyView({ ...stock, kind: "CLARIFY" }, 101),
    ).toBeNull();
    expect(
      toReceivableReplyView({ ...stock, autoReply: null }, 101),
    ).toBeNull();
  });

  it("S2-1 말풍선 data-ac: 미수 답은 S2-1 S2-4, 재고 번호(S8-4)는 안 붙는다", () => {
    const ac = messageAc(receivableReply(facts(1, 0)), 0, new Set());
    expect(ac.split(" ")).toEqual(
      expect.arrayContaining(["S5-6", "S2-1", "S2-4"]),
    );
    expect(ac.split(" ")).not.toContain("S8-4");
  });
});

describe("S2-2 카드 4상태 — 정해진 글(디자인 결정 42)", () => {
  it("S2-2 연체 있음", () => {
    expect(
      linesOf(
        receivableReply(
          facts(786_000, 0, { count: 1, amount: 120_000, maxDaysOverdue: 3 }),
        ),
      ),
    ).toEqual(["갚을 돈 786,000원", "기한 지남 1건 120,000원 (최대 3일)"]);
  });

  it("S2-2 연체 없음", () => {
    expect(linesOf(receivableReply(facts(52_000, 0)))).toEqual([
      "갚을 돈 52,000원",
      "기한 지난 것 없음",
    ]);
  });

  it("S2-2 갚을 돈 없음 — 한 줄, 기한 줄 없음", () => {
    expect(linesOf(receivableReply(facts(0, 0)))).toEqual(["갚을 돈 없음"]);
  });

  it("S2-2 선수금 30,000 — 갚을 돈 없음 / 선수금 30,000원", () => {
    expect(linesOf(receivableReply(facts(0, 30_000)))).toEqual([
      "갚을 돈 없음",
      "선수금 30,000원",
    ]);
  });

  it("S2-2 큰 금액도 줄이지 않는다(1,234,567원, 12건)", () => {
    expect(
      linesOf(
        receivableReply(
          facts(1_234_567, 0, {
            count: 12,
            amount: 1_000_000,
            maxDaysOverdue: 120,
          }),
        ),
      ),
    ).toEqual([
      "갚을 돈 1,234,567원",
      "기한 지남 12건 1,000,000원 (최대 120일)",
    ]);
  });
});

describe("S2-5 조회 시각 날짜 — checkedLabel", () => {
  it("S2-5 같은 서울 날짜면 HH:mm 조회", () => {
    expect(checkedLabel(T0, NOW)).toBe("14:20 조회");
  });

  it("S2-5 전날이면 M/D HH:mm 조회(앞 0 없음)", () => {
    expect(checkedLabel("2026-10-28T14:20:00+09:00", NOW)).toBe(
      "10/28 14:20 조회",
    );
    expect(checkedLabel(T0, Date.parse("2026-10-30T09:00:00+09:00"))).toBe(
      "10/29 14:20 조회",
    );
    expect(
      checkedLabel(
        "2026-09-04T09:05:00+09:00",
        Date.parse("2026-10-01T09:00:00+09:00"),
      ),
    ).toBe("9/4 09:05 조회");
  });

  it("S2-5 서울 자정 경계: 23:59 조회는 같은 날 23:59:59까지 시각만, 00:00(UTC 15:00Z)부터 날짜", () => {
    const checkedAt = "2026-10-29T14:59:00Z"; // 서울 10/29 23:59
    expect(checkedLabel(checkedAt, Date.parse("2026-10-29T14:59:59Z"))).toBe(
      "23:59 조회",
    );
    expect(checkedLabel(checkedAt, Date.parse("2026-10-29T15:00:00Z"))).toBe(
      "10/29 23:59 조회",
    );
    // UTC 날짜는 같아도 서울 날짜가 다르면 날짜가 붙는다
    expect(
      checkedLabel("2026-10-29T14:00:00Z", Date.parse("2026-10-29T16:00:00Z")),
    ).toBe("10/29 23:00 조회");
  });

  it("S2-5 모든 자동 답(autoReplySeen)에 같은 규칙", () => {
    expect(
      autoReplySeen(
        receivableReply(facts(1, 0)),
        Date.parse("2026-10-30T09:00:00+09:00"),
      ),
    ).toBe("10/29 14:20 조회");
    expect(autoReplySeen(receivableReply(facts(1, 0)), NOW)).toBe("14:20 조회");
  });
});
