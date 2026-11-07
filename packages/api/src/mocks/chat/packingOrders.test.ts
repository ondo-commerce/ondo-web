import { describe, expect, it } from "vitest";
import { seoulDate, type InquiryBackorder } from "./backorderCandidates";
import {
  GOLDEN,
  GOLDEN_T0,
  goldenCatalog,
  goldenReceivableRows,
} from "./golden.testkit";
import {
  DEFAULT_AUTO_REPLY_SETTINGS,
  HANDOFF_BODY,
  decideInquiry,
  generatedLines,
  linesToAppend,
  type AutoReplySettings,
  type InquiryDecision,
  type InquiryHistoryItem,
} from "./inquiry";
import {
  packingOrdersOf,
  packingReplyBody,
  type InquiryPacking,
} from "./packingOrders";

/**
 * 미송 0일 때 출고 준비 중 주문 답 unit(loop-08i S1-1 ~ S1-8). 골든 v7(K01~K16)이 못 덮는 것:
 * 거르기 조합 하나씩, 본문 건수 경계, 원본 호출 수, 의도 경계, 되묻기 직후 배분.
 * 방은 무드온(101) x 가람상회(3)다 — 골든 미송 표에 행이 없는 소매처(B05)라 미송 후보가 늘 0이다.
 */

const CATALOG = goldenCatalog(GOLDEN.stock);
const RECEIVABLE_ROWS = goldenReceivableRows();
const NOW = GOLDEN_T0;
const MINUTE = 60_000;

/** 유효한 포장 한 줄(방 101 x 3, READY, 봉투 없음). 칸 하나씩 바꿔 경계를 본다 */
function pk(
  orderId: number,
  over: Partial<InquiryPacking> = {},
): InquiryPacking {
  return {
    packingId: orderId + 2100,
    orderId,
    wholesalerId: 101,
    retailerId: 3,
    orderCancelled: false,
    packingStatus: "READY",
    outboundShipped: null,
    qty: 1,
    ...over,
  };
}

/** 호출을 세는 원본. "throw"면 부를 때마다 던진다 */
function counting(rows: readonly InquiryPacking[] | "throw") {
  const n = { calls: 0 };
  return {
    n,
    source: () => {
      n.calls += 1;
      if (rows === "throw") throw new Error("포장 조회 실패");
      return rows;
    },
  };
}

/** 미송 9003(린넨 셋업 자켓 베이지/L) — 되묻기 이력과 칩에 쓴다. 남은 수량을 골라 열림/해소를 만든다 */
function bo(remainingQty: number): InquiryBackorder {
  return {
    backorderId: 9003,
    orderId: 7003,
    wholesalerId: 101,
    retailerId: 3,
    variantId: 3019,
    title: "린넨 셋업 자켓",
    color: "베이지",
    size: "L",
    remainingQty,
    orderedAt: "2026-09-07T10:00:00+09:00",
    expectedInboundDate: "2026-11-05",
    expectedInboundReason: null,
  };
}

interface DecideOpts {
  packings?: readonly InquiryPacking[] | "throw";
  backorders?: readonly InquiryBackorder[];
  history?: InquiryHistoryItem[];
  inquiry?: Parameters<typeof decideInquiry>[0]["inquiry"];
  settings?: AutoReplySettings;
  retailerId?: number;
  now?: number;
}

/** 방 101 x 3 판정 한 번. 포장 원본 호출 수를 같이 돌려준다 */
function decide(body: string, opts: DecideOpts = {}) {
  const packings = counting(opts.packings ?? [pk(7101)]);
  const now = opts.now ?? NOW;
  const d = decideInquiry({
    body,
    inquiry: opts.inquiry ?? null,
    now,
    wholesalerId: 101,
    retailerId: opts.retailerId ?? 3,
    today: seoulDate(now),
    settings: opts.settings ?? DEFAULT_AUTO_REPLY_SETTINGS,
    context: null,
    history: opts.history ?? [],
    catalog: CATALOG,
    backorders: () => opts.backorders ?? [],
    receivables: () => RECEIVABLE_ROWS,
    packings: packings.source,
  });
  return { d, calls: packings.n.calls };
}

const PACKING = (...ids: number[]): InquiryDecision => ({
  kind: "AUTO_REPLY",
  intent: "BACKORDER",
  packingOrderIds: ids,
});
const NO_BACKORDER: InquiryDecision = {
  kind: "HANDOFF",
  reason: "NO_BACKORDER",
  intent: "BACKORDER",
};

/** 미송 9003 하나로 되묻기를 받은 이력(at에 소매 질문 + 되묻기) */
function clarifyHistory(at: number): InquiryHistoryItem[] {
  const sentAt = new Date(at).toISOString();
  const ask: InquiryDecision = {
    kind: "CLARIFY",
    intent: "BACKORDER",
    choices: [bo(2)],
    truncated: false,
    today: seoulDate(at),
  };
  return [
    { sequence: 1, sender: "RETAILER", kind: "TEXT", sentAt, autoReply: null },
    ...generatedLines(ask, 1, at).map((l, i) => ({
      sequence: 2 + i,
      sender: l.sender,
      kind: l.kind,
      sentAt,
      autoReply: l.autoReply,
      handoff: l.handoff,
    })),
  ];
}

describe("S1-1 거르기: 소유, 소매처, 취소, 수량, 상태 조합", () => {
  it("뺌: 도매처 다름, 도매처 null, 소매처 다름, 취소, 수량 0, PACKED 출고됨, READY + 봉투 있음(출고 전, 출고됨), PACKED + 봉투 없음", () => {
    const cases: [string, Partial<InquiryPacking>][] = [
      ["도매처 102", { wholesalerId: 102 }],
      ["도매처 null", { wholesalerId: null }],
      ["소매처 4", { retailerId: 4 }],
      ["취소", { orderCancelled: true }],
      ["수량 0", { qty: 0 }],
      ["PACKED 출고됨", { packingStatus: "PACKED", outboundShipped: true }],
      ["READY 봉투 출고 전", { outboundShipped: false }],
      ["READY 봉투 출고됨", { outboundShipped: true }],
      ["PACKED 봉투 없음", { packingStatus: "PACKED", outboundShipped: null }],
    ];
    for (const [label, over] of cases)
      expect(packingOrdersOf([pk(7101, over)], 101, 3), label).toEqual([]);
  });

  it("남김: READY + 봉투 없음, PACKED + 봉투 출고 전", () => {
    expect(packingOrdersOf([pk(7101)], 101, 3)).toEqual([7101]);
    expect(
      packingOrdersOf(
        [pk(7102, { packingStatus: "PACKED", outboundShipped: false })],
        101,
        3,
      ),
    ).toEqual([7102]);
  });

  it("같은 주문 포장 둘(READY + PACKED 출고 전) → 1건, 결과는 orderId 오름차순(입력 순서 섞음)", () => {
    const rows = [
      pk(7104),
      pk(7101, { packingStatus: "PACKED", outboundShipped: false }),
      pk(7102, { wholesalerId: 102 }),
      pk(7103),
      pk(7101, { packingId: 9999 }),
    ];
    expect(packingOrdersOf(rows, 101, 3)).toEqual([7101, 7103, 7104]);
  });

  it("같은 주문의 한 포장은 출고됨, 다른 포장은 READY → 그 주문 남음(출고된 행만 뺀다)", () => {
    const rows = [
      pk(7101, {
        packingId: 1,
        packingStatus: "PACKED",
        outboundShipped: true,
      }),
      pk(7101, { packingId: 2 }),
    ];
    expect(packingOrdersOf(rows, 101, 3)).toEqual([7101]);
  });
});

describe("S1-2 본문 건수(§5-2 글자 그대로)", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => 7101 + i);
  it("1, 2, 3, 4, 10건", () => {
    expect(packingReplyBody(ids(1))).toBe(
      "출고 준비 중인 주문이 있어요(#7101)",
    );
    expect(packingReplyBody(ids(2))).toBe(
      "출고 준비 중인 주문 2건이 있어요(#7101, #7102)",
    );
    expect(packingReplyBody(ids(3))).toBe(
      "출고 준비 중인 주문 3건이 있어요(#7101, #7102, #7103)",
    );
    expect(packingReplyBody(ids(4))).toBe(
      "출고 준비 중인 주문 4건이 있어요(#7101, #7102, #7103 외 1건)",
    );
    expect(packingReplyBody(ids(10))).toBe(
      "출고 준비 중인 주문 10건이 있어요(#7101, #7102, #7103 외 7건)",
    );
  });
});

describe("S1-3 생성 줄 두 줄과 실제로 남는 줄", () => {
  it("AUTO_REPLY(subject 넷 null, facts 셋 null, choices null, checkedAt = now) + HANDOFF(NO_BACKORDER, BACKORDER, 원인 = 소매 글)", () => {
    const { d } = decide("미송 언제 와요?");
    expect(d).toEqual(PACKING(7101));
    expect(generatedLines(d, 5, NOW)).toEqual([
      {
        sender: "WHOLESALER",
        kind: "AUTO_REPLY",
        body: "출고 준비 중인 주문이 있어요(#7101)",
        handoff: null,
        autoReply: {
          intent: "BACKORDER",
          replyToSequence: 5,
          generatedBy: "RULE",
          checkedAt: new Date(NOW).toISOString(),
          subject: {
            listingId: null,
            variantId: null,
            backorderId: null,
            label: null,
          },
          facts: { stock: null, backorder: null, receivable: null },
          choices: null,
        },
      },
      {
        sender: "SYSTEM",
        kind: "HANDOFF",
        body: HANDOFF_BODY,
        autoReply: null,
        handoff: {
          reason: "NO_BACKORDER",
          intent: "BACKORDER",
          sourceSequence: 5,
        },
      },
    ]);
  });

  const sentAt = new Date(NOW).toISOString();
  const retail = (sequence: number): InquiryHistoryItem => ({
    sequence,
    sender: "RETAILER",
    kind: "TEXT",
    sentAt,
    autoReply: null,
  });
  const kinds = (d: InquiryDecision, history: InquiryHistoryItem[]) =>
    linesToAppend(generatedLines(d, history.length + 1, NOW), history).map(
      (l) => l.kind,
    );
  /** 포장 답 한 번이 남긴 이력(소매 글, 답, 넘김) */
  const afterPacking = (): InquiryHistoryItem[] => [
    retail(1),
    ...generatedLines(PACKING(7101), 1, NOW).map((l, i) => ({
      sequence: 2 + i,
      sender: l.sender,
      kind: l.kind,
      sentAt,
      autoReply: l.autoReply,
      handoff: l.handoff,
    })),
  ];

  it("열린 NO_BACKORDER 넘김 뒤 포장 답 → [AUTO_REPLY, HANDOFF](답 + 넘김은 늘 둘 다)", () => {
    const history: InquiryHistoryItem[] = [
      retail(1),
      {
        sequence: 2,
        sender: "SYSTEM",
        kind: "HANDOFF",
        sentAt,
        autoReply: null,
        handoff: { reason: "NO_BACKORDER" },
      },
      retail(3),
    ];
    expect(kinds(PACKING(7101), history)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  });

  it("포장 답 뒤(사장 답 없음) 포장 없는 넘김 → [], 사이에 사장 TEXT → [HANDOFF]", () => {
    expect(kinds(NO_BACKORDER, [...afterPacking(), retail(4)])).toEqual([]);
    expect(
      kinds(NO_BACKORDER, [
        ...afterPacking(),
        {
          sequence: 4,
          sender: "WHOLESALER",
          kind: "TEXT",
          sentAt,
          autoReply: null,
        },
        retail(5),
      ]),
    ).toEqual(["HANDOFF"]);
  });
});

describe("S1-4 대상 말함(D57 Q2 ①)", () => {
  it("대상 있음 4문장 → NO_BACKORDER 넘김 + 원본 호출 0", () => {
    for (const body of [
      "블랙 셔츠 미송 언제 와요?",
      "L 미송 언제 와요?",
      "#7101 언제 와요?",
      "셔츠 언제 와요?",
    ]) {
      const { d, calls } = decide(body);
      expect(d, body).toEqual(NO_BACKORDER);
      expect(calls, body).toBe(0);
    }
  });

  it("대상 없음 4문장 → 포장 답, 원본 호출 1", () => {
    for (const body of [
      "미송 언제 와요?",
      "언제 와요?",
      "주문한 거 언제 와요?",
      "혹시 미송 언제쯤 오나요",
    ]) {
      const { d, calls } = decide(body);
      expect(d, body).toEqual(PACKING(7101));
      expect(calls, body).toBe(1);
    }
  });
});

describe("S1-5 포장 원본은 e단계에서만 부른다(호출 세는 원본)", () => {
  it("열린 미송, 미송 의도 꺼짐, 칩, 다른 주문이에요, 배송어, 되묻기 계승, 재고, 미수, 의도 없음 → 0회", () => {
    const cases: [string, string, DecideOpts][] = [
      ["열린 미송 ≥ 1", "미송 언제 와요?", { backorders: [bo(2)] }],
      [
        "미송 의도 꺼짐",
        "미송 언제 와요?",
        {
          settings: {
            enabled: true,
            intents: { STOCK: true, BACKORDER: false, RECEIVABLE: true },
          },
        },
      ],
      [
        "칩",
        "린넨 셋업 자켓 베이지/L",
        {
          inquiry: {
            intent: "BACKORDER",
            listingId: null,
            variantId: 3019,
            backorderId: 9003,
            label: null,
          },
        },
      ],
      [
        "다른 주문이에요",
        "다른 주문이에요",
        {
          inquiry: {
            intent: "BACKORDER",
            listingId: null,
            variantId: 0,
            backorderId: null,
            label: null,
            notListed: true,
          },
        },
      ],
      ["배송어", "미송 배송 언제 돼요?", {}],
      ["되묻기 계승", "언제 와요?", { history: clarifyHistory(NOW - MINUTE) }],
      ["재고", "레드 M 몇 장 있어요?", {}],
      ["미수", "지금 미수 얼마예요?", {}],
      ["의도 없음", "안녕하세요", {}],
    ];
    for (const [label, body, opts] of cases)
      expect(decide(body, opts).calls, label).toBe(0);
  });

  it("후보 0 + 대상 없음 → 1회", () => {
    expect(decide("미송 언제 와요?").calls).toBe(1);
  });
});

describe("S1-6 원본 실패와 전체 꺼짐", () => {
  const OFF = { ...DEFAULT_AUTO_REPLY_SETTINGS, enabled: false };

  it("원본 던짐 → NO_BACKORDER 넘김, 예외 밖으로 0", () => {
    expect(() =>
      decide("미송 언제 와요?", { packings: "throw" }),
    ).not.toThrow();
    expect(decide("미송 언제 와요?", { packings: "throw" }).d).toEqual(
      NO_BACKORDER,
    );
  });

  it("전체 꺼짐 + 포장 있음 → OFF BACKORDER, 전체 꺼짐 + 원본 던짐 → OFF BACKORDER(null 아님)", () => {
    const off: InquiryDecision = {
      kind: "HANDOFF",
      reason: "OFF",
      intent: "BACKORDER",
    };
    expect(decide("미송 언제 와요?", { settings: OFF }).d).toEqual(off);
    expect(
      decide("미송 언제 와요?", { settings: OFF, packings: "throw" }).d,
    ).toEqual(off);
  });
});

describe("S1-7 의도 경계(§4-1 2 표: 본문, inquiry, 이력 고정, 포장 READY 한 건)", () => {
  const chip = {
    intent: "BACKORDER" as const,
    listingId: null,
    variantId: null,
    backorderId: null,
    label: null,
  };
  it("여섯 줄: '주문한 거 언제 와요?'만 포장 답, NO_INTENT(intent null)와 NOT_SUPPORTED(BACKORDER)가 갈린다", () => {
    const rows: [string, DecideOpts, InquiryDecision, number][] = [
      ["주문한 거 언제 와요?", {}, PACKING(7101), 1],
      [
        "주문한 거 언제 받아요?",
        {},
        { kind: "HANDOFF", reason: "NO_INTENT", intent: null },
        0,
      ],
      [
        "주문한 거 언제 받아요?",
        { inquiry: chip },
        { kind: "HANDOFF", reason: "NOT_SUPPORTED", intent: "BACKORDER" },
        0,
      ],
      [
        "주문한 거 언제 받아요?",
        { history: clarifyHistory(NOW - 10 * MINUTE) },
        { kind: "HANDOFF", reason: "NOT_SUPPORTED", intent: "BACKORDER" },
        0,
      ],
      [
        "미송 언제 받아요?",
        {},
        { kind: "HANDOFF", reason: "NOT_SUPPORTED", intent: "BACKORDER" },
        0,
      ],
      [
        "미송 출고 언제 돼요?",
        {},
        { kind: "HANDOFF", reason: "NOT_SUPPORTED", intent: "BACKORDER" },
        0,
      ],
    ];
    for (const [body, opts, want, calls] of rows) {
      const label = `${body} inquiry=${opts.inquiry ? "칩" : "null"} 이력=${opts.history ? "되묻기" : "없음"}`;
      const got = decide(body, opts);
      expect(got.d, label).toEqual(want);
      expect(got.calls, label).toBe(calls);
    }
  });
});

describe("S1-8 되묻기 직후 다 배분(미송 9003 해소, 포장 READY 한 건)", () => {
  const asked = NOW - MINUTE;
  const resolved = { backorders: [bo(0)] };

  it("① 칩 9003 → INVALID_TARGET ② '베이지 L이요' ③ '언제 와요?' → CLARIFY_AGAIN, 셋 다 원본 호출 0", () => {
    const history = clarifyHistory(asked);
    const chip = decide("린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003", {
      ...resolved,
      history,
      inquiry: {
        intent: "BACKORDER",
        listingId: null,
        variantId: 3019,
        backorderId: 9003,
        label: null,
      },
    });
    expect(chip.d).toEqual({
      kind: "HANDOFF",
      reason: "INVALID_TARGET",
      intent: "BACKORDER",
    });
    expect(chip.calls).toBe(0);
    for (const body of ["베이지 L이요", "언제 와요?"]) {
      const got = decide(body, { ...resolved, history });
      expect(got.d, body).toEqual({
        kind: "HANDOFF",
        reason: "CLARIFY_AGAIN",
        intent: "BACKORDER",
      });
      expect(got.calls, body).toBe(0);
    }
  });

  it("④ 되묻기 31분 뒤 '미송 언제 와요?' → 포장 답, 원본 호출 1", () => {
    const got = decide("미송 언제 와요?", {
      ...resolved,
      history: clarifyHistory(asked),
      now: asked + 31 * MINUTE,
    });
    expect(got.d).toEqual(PACKING(7101));
    expect(got.calls).toBe(1);
  });
});
