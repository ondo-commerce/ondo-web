import { beforeEach, describe, expect, it } from "vitest";
import {
  mockReceivable,
  mockReceivableRows,
  receivableSummary,
  resetSettlementMock,
  type SummaryLedgerLine,
  type SummaryOrder,
  type SummaryPayment,
} from "../wholesale/settlement";
import { seoulDate } from "./backorderCandidates";
import { GOLDEN, GOLDEN_T0, anomalyRow } from "./golden.testkit";
import {
  DEFAULT_AUTO_REPLY_SETTINGS,
  decideInquiry,
  generatedLines,
  type InquiryDecision,
} from "./inquiry";
import {
  formatWon,
  receivableReplyBody,
  toReceivableFacts,
  type InquiryReceivable,
} from "./receivable";

/**
 * 미수 금액 변환과 정산 요약 unit(loop-07 S1-3 ~ S1-6). 골든셋 시나리오는 `inquiry.test.ts`가 돈다.
 * 여기는 시나리오가 못 덮는 것: 문장 글자, 이상값 7종, 요약 함수의 배분, 선수금, 나눠 출고, 취소, 조정, 연체 경계,
 * 조회 시각이 판정 시각이 아니라 원본 시각인지.
 */

const T0_ISO = new Date(GOLDEN_T0).toISOString();
const MINUTE = 60_000;

/** 원본 한 줄. 쌍은 (101, 1) */
function row(over: Partial<InquiryReceivable> = {}): InquiryReceivable {
  return {
    wholesalerId: 101,
    retailerId: 1,
    balance: 37_500,
    unpaid: 37_500,
    prepaid: 0,
    overdue: { amount: 37_500, count: 1, maxDays: 54 },
    exact: true,
    asOf: T0_ISO,
    ...over,
  };
}

/** 이 방(101, 1) 판정 한 번. 원본은 넘긴 줄들 */
function decide(
  rows: readonly InquiryReceivable[],
  opts: { body?: string; now?: number } = {},
): InquiryDecision {
  const now = opts.now ?? GOLDEN_T0;
  return decideInquiry({
    body: opts.body ?? "지금 미수 얼마예요?",
    inquiry: null,
    now,
    wholesalerId: 101,
    retailerId: 1,
    today: seoulDate(now),
    settings: DEFAULT_AUTO_REPLY_SETTINGS,
    context: null,
    history: [],
    catalog: () => null,
    backorders: () => [],
    receivables: () => rows,
  });
}

const BODY = {
  A: "갚을 돈은 52,000원이에요. 기한 지난 것은 없어요",
  B: "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요",
  B786: "갚을 돈은 786,000원이에요. 그중 기한 지난 것 1건, 120,000원이에요",
  C: "지금 갚을 돈은 없어요",
  D: "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 30,000원이 남아 있어요",
};

describe("S1-3 toReceivableFacts 와 문장", () => {
  it("A B C D 본문이 기획 §4-1 10 글과 정확히 같다(원 단위 정수, 세 자리 쉼표)", () => {
    const body = (r: InquiryReceivable) => {
      const c = toReceivableFacts(r);
      if (!c.ok) throw new Error(c.anomaly);
      return receivableReplyBody(c.facts);
    };
    expect(
      body(
        row({
          balance: 52_000,
          unpaid: 52_000,
          overdue: { amount: 0, count: 0, maxDays: 0 },
        }),
      ),
    ).toBe(BODY.A);
    expect(body(row())).toBe(BODY.B);
    expect(
      body(
        row({
          balance: 786_000,
          unpaid: 786_000,
          overdue: { amount: 120_000, count: 1, maxDays: 3 },
        }),
      ),
    ).toBe(BODY.B786);
    const zero = { amount: 0, count: 0, maxDays: 0 };
    expect(body(row({ balance: 0, unpaid: 0, overdue: zero }))).toBe(BODY.C);
    expect(
      body(
        row({ balance: -30_000, unpaid: 0, prepaid: 30_000, overdue: zero }),
      ),
    ).toBe(BODY.D);
    expect([0, 999, 1000, 37_500, 1_234_567].map(formatWon)).toEqual([
      "0원",
      "999원",
      "1,000원",
      "37,500원",
      "1,234,567원",
    ]);
  });

  it("안전 정수 밖 금액(1e21, 2^53, Infinity) → NOT_INTEGER, AMOUNT_UNSURE. '1e+21원'이 나가지 않는다(M3)", () => {
    const zero = { amount: 0, count: 0, maxDays: 0 };
    const big = 2 ** 53;
    for (const [name, r] of [
      ["1e21", row({ balance: 1e21, unpaid: 1e21, overdue: zero })],
      ["2^53", row({ balance: big, unpaid: big, overdue: zero })],
      [
        "연체 금액만 2^53",
        row({
          balance: big,
          unpaid: big,
          overdue: { amount: big, count: 1, maxDays: 3 },
        }),
      ],
      ["Infinity", row({ balance: Infinity, unpaid: Infinity, overdue: zero })],
      [
        "선수금 -1e21",
        row({ balance: -1e21, unpaid: 0, prepaid: 1e21, overdue: zero }),
      ],
    ] as const) {
      expect(toReceivableFacts(r), name).toEqual({
        ok: false,
        anomaly: "NOT_INTEGER",
      });
      const d = decide([r]);
      expect(d, name).toEqual({
        kind: "HANDOFF",
        reason: "AMOUNT_UNSURE",
        intent: "RECEIVABLE",
      });
    }
    // 안전 정수 끝값은 통과한다
    const max = Number.MAX_SAFE_INTEGER;
    expect(
      toReceivableFacts(row({ balance: max, unpaid: max, overdue: zero })).ok,
    ).toBe(true);
  });

  it("facts 는 갚을 돈 = unpaid, 선수금 = prepaid, 연체 세 칸. checkedAt = asOf", () => {
    expect(toReceivableFacts(row())).toEqual({
      ok: true,
      facts: {
        outstandingAmount: 37_500,
        prepaidAmount: 0,
        overdue: { count: 1, amount: 37_500, maxDaysOverdue: 54 },
      },
      checkedAt: T0_ISO,
    });
  });

  it("골든셋 이상값 표 9줄(7종) 각각 → 그 규칙으로 걸리고, 판정은 AMOUNT_UNSURE 넘김 한 줄, AUTO_REPLY 0", () => {
    expect(new Set(GOLDEN.receivableAnomalies.map((c) => c.anomaly))).toEqual(
      new Set([
        "NOT_EXACT",
        "NOT_INTEGER",
        "NEGATIVE",
        "SIGN_MISMATCH",
        "MIXED_BALANCE",
        "OVERDUE_COUNT_AMOUNT",
        "OVERDUE_DAYS",
        "OVERDUE_OVER_UNPAID",
      ]),
    );
    for (const c of GOLDEN.receivableAnomalies) {
      const r = anomalyRow(c);
      expect(toReceivableFacts(r), c.rule).toEqual({
        ok: false,
        anomaly: c.anomaly,
      });
      const d = decide([r]);
      expect(d, c.rule).toEqual({
        kind: "HANDOFF",
        reason: "AMOUNT_UNSURE",
        intent: "RECEIVABLE",
      });
      expect(
        generatedLines(d, 1, GOLDEN_T0).map((l) => l.kind),
        c.rule,
      ).toEqual(["HANDOFF"]);
    }
  });
});

/* --- 정산 요약 ------------------------------------------------------------ */

const SEED_SALE: SummaryLedgerLine = {
  retailerId: 1,
  entryType: "SALE",
  balanceChange: -37_500,
  occurredAt: "2026-09-04T10:00:00+09:00",
  orderId: 7004,
};
const ORDER_7004: SummaryOrder = {
  id: 7004,
  retailerId: 1,
  status: "CONFIRMED",
  allocatedAmount: 0,
};

function summary(input: {
  ledger?: SummaryLedgerLine[];
  orders?: SummaryOrder[];
  payments?: SummaryPayment[];
  today?: string;
}) {
  return receivableSummary({
    ledger: input.ledger ?? [SEED_SALE],
    orders: input.orders ?? [ORDER_7004],
    payments: input.payments ?? [],
    retailerId: 1,
    today: input.today ?? "2026-10-29",
    asOf: T0_ISO,
  });
}

/** 요약 → 판정 → 본문(넘김이면 그 이유) */
function answerOf(s: ReturnType<typeof summary>): string {
  const d = decide([{ wholesalerId: 101, retailerId: 1, ...s }]);
  return d.kind === "HANDOFF"
    ? d.reason
    : (generatedLines(d, 1, GOLDEN_T0)[0]?.body ?? "");
}

const payment = (amount: number, at: string): SummaryLedgerLine => ({
  retailerId: 1,
  entryType: "PAYMENT",
  balanceChange: amount,
  occurredAt: at,
  orderId: null,
});

describe("S1-4 receivableSummary (T0 = 10/29 14:20)", () => {
  beforeEach(() => resetSettlementMock());

  it("정산 목 시드 → {37,500, 37,500, 0, {37,500, 1, 54}, exact}. 본문 B", () => {
    const seed = mockReceivable(101, 1, GOLDEN_T0);
    expect(seed).toEqual({
      wholesalerId: 101,
      retailerId: 1,
      balance: 37_500,
      unpaid: 37_500,
      prepaid: 0,
      overdue: { amount: 37_500, count: 1, maxDays: 54 },
      exact: true,
      asOf: T0_ISO,
    });
    // 같은 값을 순수 함수에 fixture 로 넣어도 같다(목은 저장소를 넣어 부를 뿐이다)
    expect({ wholesalerId: 101, retailerId: 1, ...summary({}) }).toEqual(seed);
    expect(answerOf(summary({}))).toBe(BODY.B);
    // 시드에서 미수 줄이 서는 소매처는 봄봄상회(1, 37,500)와 대기상회(2, 확정만 있고 출고 0 → 0원) 둘
    expect(
      mockReceivableRows(GOLDEN_T0).map((r) => [r.retailerId, r.unpaid]),
    ).toEqual([
      [1, 37_500],
      [2, 0],
    ]);
  });

  it("20,000 배분 → B 17,500(연체 1건 17,500, 54일)", () => {
    const s = summary({
      ledger: [SEED_SALE, payment(20_000, "2026-10-29T14:00:00+09:00")],
      orders: [{ ...ORDER_7004, allocatedAmount: 20_000 }],
      payments: [
        { retailerId: 1, amount: 20_000, allocations: [{ amount: 20_000 }] },
      ],
    });
    expect(s).toMatchObject({
      balance: 17_500,
      unpaid: 17_500,
      prepaid: 0,
      overdue: { amount: 17_500, count: 1, maxDays: 54 },
      exact: true,
    });
    expect(answerOf(s)).toBe(
      "갚을 돈은 17,500원이에요. 그중 기한 지난 것 1건, 17,500원이에요",
    );
  });

  it("20,000 배분 없이 → 미수 37,500 + 선수금 20,000 → AMOUNT_UNSURE(17,500원이라 말하지 않는다)", () => {
    const s = summary({
      ledger: [SEED_SALE, payment(20_000, "2026-10-29T14:00:00+09:00")],
      payments: [{ retailerId: 1, amount: 20_000, allocations: [] }],
    });
    expect(s).toMatchObject({
      balance: 17_500,
      unpaid: 37_500,
      prepaid: 20_000,
    });
    expect(answerOf(s)).toBe("AMOUNT_UNSURE");
  });

  it("먼저 낸 선수금 20,000을 뒤에 배정에 쓰고 17,500을 더 냄(결과 상태) → C", () => {
    const s = summary({
      ledger: [
        SEED_SALE,
        payment(20_000, "2026-09-01T10:00:00+09:00"),
        payment(17_500, "2026-10-29T14:00:00+09:00"),
      ],
      orders: [{ ...ORDER_7004, allocatedAmount: 37_500 }],
      payments: [
        { retailerId: 1, amount: 20_000, allocations: [{ amount: 20_000 }] },
        { retailerId: 1, amount: 17_500, allocations: [{ amount: 17_500 }] },
      ],
    });
    expect(s).toMatchObject({ balance: 0, unpaid: 0, prepaid: 0, exact: true });
    expect(answerOf(s)).toBe(BODY.C);
  });

  it("50,000 입금 중 37,500 배분 → D 선수금 12,500", () => {
    const s = summary({
      ledger: [SEED_SALE, payment(50_000, "2026-10-29T14:00:00+09:00")],
      orders: [{ ...ORDER_7004, allocatedAmount: 37_500 }],
      payments: [
        { retailerId: 1, amount: 50_000, allocations: [{ amount: 37_500 }] },
      ],
    });
    expect(s).toMatchObject({ balance: -12_500, unpaid: 0, prepaid: 12_500 });
    expect(answerOf(s)).toBe(
      "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 12,500원이 남아 있어요",
    );
  });

  it("나눠 출고(9/4, 9/10), PAYMENT_VOID, ADJUST, 취소 주문 판매 줄 → 각각 exact false → AMOUNT_UNSURE", () => {
    const split = summary({
      ledger: [
        { ...SEED_SALE, balanceChange: -20_000 },
        {
          ...SEED_SALE,
          balanceChange: -17_500,
          occurredAt: "2026-09-10T10:00:00+09:00",
        },
      ],
    });
    const voided = summary({
      ledger: [
        SEED_SALE,
        payment(10_000, "2026-10-01T10:00:00+09:00"),
        {
          ...payment(-10_000, "2026-10-02T10:00:00+09:00"),
          entryType: "PAYMENT_VOID",
        },
      ],
    });
    const adjusted = summary({
      ledger: [
        SEED_SALE,
        { ...payment(5_000, "2026-10-02T10:00:00+09:00"), entryType: "ADJUST" },
      ],
    });
    const cancelled = summary({
      orders: [{ ...ORDER_7004, status: "CANCELLED" }],
    });
    for (const [name, s] of [
      ["나눠 출고", split],
      ["입금 취소", voided],
      ["조정", adjusted],
      ["취소 주문", cancelled],
    ] as const) {
      expect(s.exact, name).toBe(false);
      expect(answerOf(s), name).toBe("AMOUNT_UNSURE");
    }
    // 나눠 출고도 다 갚았으면 금액을 보장할 수 있다(남은 미수가 없다)
    expect(
      summary({
        ledger: [
          { ...SEED_SALE, balanceChange: -20_000 },
          {
            ...SEED_SALE,
            balanceChange: -17_500,
            occurredAt: "2026-09-10T10:00:00+09:00",
          },
          payment(37_500, "2026-10-29T14:00:00+09:00"),
        ],
        orders: [{ ...ORDER_7004, allocatedAmount: 37_500 }],
        payments: [
          { retailerId: 1, amount: 37_500, allocations: [{ amount: 37_500 }] },
        ],
      }).exact,
    ).toBe(true);
  });

  it("판매 줄의 주문이 orders 에 없으면 exact false → AMOUNT_UNSURE(배정 0으로 보고 전액 말하지 않는다, M2)", () => {
    const missing = summary({ orders: [] });
    expect(missing).toMatchObject({ unpaid: 37_500, exact: false });
    expect(answerOf(missing)).toBe("AMOUNT_UNSURE");
    // 다른 주문만 있어도 같다
    const other = summary({ orders: [{ ...ORDER_7004, id: 7999 }] });
    expect(other.exact).toBe(false);
    expect(answerOf(other)).toBe("AMOUNT_UNSURE");
  });

  it("다른 소매처 줄과 입금은 섞이지 않는다", () => {
    const s = summary({
      ledger: [
        SEED_SALE,
        { ...SEED_SALE, retailerId: 2, orderId: 7005, balanceChange: -99_000 },
      ],
      orders: [ORDER_7004, { ...ORDER_7004, id: 7005, retailerId: 2 }],
      payments: [{ retailerId: 2, amount: 50_000, allocations: [] }],
    });
    expect(s).toMatchObject({ balance: 37_500, unpaid: 37_500, prepaid: 0 });
  });
});

describe("S1-5 연체 경계(외상 1일)", () => {
  const overdueOn = (shippedAt: string, today: string) =>
    summary({ ledger: [{ ...SEED_SALE, occurredAt: shippedAt }], today })
      .overdue;

  it("출고 다음 날 0, 이틀째 1일", () => {
    expect(overdueOn("2026-10-28T10:00:00+09:00", "2026-10-29")).toEqual({
      amount: 0,
      count: 0,
      maxDays: 0,
    });
    expect(overdueOn("2026-10-28T10:00:00+09:00", "2026-10-30")).toEqual({
      amount: 37_500,
      count: 1,
      maxDays: 1,
    });
    // 출고 당일도 0
    expect(overdueOn("2026-10-29T10:00:00+09:00", "2026-10-29").count).toBe(0);
  });

  it("출고 시각의 서울 날짜: UTC 14:59:59Z 는 그날, 15:00:00Z 는 다음 날", () => {
    // 10/27 23:59:59 KST 출고 → 10/29 에 1일, 10/28 00:00 KST 출고 → 10/29 에 0
    expect(overdueOn("2026-10-27T14:59:59Z", "2026-10-29").maxDays).toBe(1);
    expect(overdueOn("2026-10-27T15:00:00Z", "2026-10-29").count).toBe(0);
  });

  it("목 원본의 오늘도 서울 날짜: 10/28 14:59:59Z 는 53일, 15:00:00Z 는 54일", () => {
    resetSettlementMock();
    const days = (iso: string) =>
      mockReceivable(101, 1, Date.parse(iso))?.overdue.maxDays;
    expect(days("2026-10-28T14:59:59Z")).toBe(53);
    expect(days("2026-10-28T15:00:00Z")).toBe(54);
  });
});

describe("S1-6 조회 시각 = 원본 asOf", () => {
  it("asOf 14:20, 판정 now 14:21 → checkedAt 은 14:20", () => {
    const now = GOLDEN_T0 + MINUTE;
    const d = decide([row({ asOf: T0_ISO })], { now });
    const [line] = generatedLines(d, 1, now);
    expect(line?.autoReply?.checkedAt).toBe(T0_ISO);
    expect(line?.autoReply?.checkedAt).not.toBe(new Date(now).toISOString());
  });

  it("목 원본은 부를 때마다 장부를 읽고 그 시각이 asOf 다(입금 직전, 직후 답의 checkedAt 이 각 요약 시각)", () => {
    resetSettlementMock();
    const before = mockReceivable(101, 1, GOLDEN_T0);
    const after = mockReceivable(101, 1, GOLDEN_T0 + 5 * MINUTE);
    expect(before?.asOf).toBe(T0_ISO);
    expect(after?.asOf).toBe(new Date(GOLDEN_T0 + 5 * MINUTE).toISOString());
  });
});
