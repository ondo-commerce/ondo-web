import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKORDER_SEED_ETA_DAYS,
  inquiryBackorders,
  resetBackorderMock,
} from "../wholesale/backorder";
import {
  addDays,
  backorderChoiceLabel,
  etaState,
  koreanDate,
  seoulDate,
  type InquiryBackorder,
} from "./backorderCandidates";
import {
  GOLDEN,
  GOLDEN_D0,
  GOLDEN_T0,
  goldenBackorderRows,
  goldenCatalog,
  relDate,
} from "./golden.testkit";
import {
  BACKORDER_CLARIFY_BODY,
  DEFAULT_AUTO_REPLY_SETTINGS,
  HANDOFF_BODY,
  NOT_LISTED_LABEL,
  decideInquiry,
  generatedLines,
  type InquiryDecision,
  type InquiryHistoryItem,
} from "./inquiry";

/**
 * 미송 판정과 문장 unit(loop-06 S1-3, S1-6, 골든셋 표 ↔ 목 시드). 골든셋 시나리오 자체는 `inquiry.test.ts`가 돈다.
 * 여기는 골든셋이 못 덮는 것: 9개 이상 후보, 문장 글자, 서울 자정과 연도 경계, 목 시드와 표가 같은지.
 */

const CATALOG = goldenCatalog(GOLDEN.stock);
const MINUTE = 60_000;

function row(
  id: number,
  over: Partial<InquiryBackorder> = {},
): InquiryBackorder {
  return {
    backorderId: id,
    orderId: 7000 + id,
    wholesalerId: 101,
    retailerId: 1,
    variantId: 3019,
    title: "린넨 셋업 자켓",
    color: "베이지",
    size: "L",
    remainingQty: 2,
    orderedAt: "2026-09-07T08:00:00+09:00",
    expectedInboundDate: "2026-11-05",
    expectedInboundReason: "원단 수급 지연",
    ...over,
  };
}

function decide(
  body: string,
  rows: readonly InquiryBackorder[],
  opts: {
    now?: number;
    today?: string;
    history?: InquiryHistoryItem[];
    inquiry?: Parameters<typeof decideInquiry>[0]["inquiry"];
  } = {},
): InquiryDecision {
  const now = opts.now ?? GOLDEN_T0;
  return decideInquiry({
    body,
    inquiry: opts.inquiry ?? null,
    now,
    wholesalerId: 101,
    retailerId: 1,
    today: opts.today ?? seoulDate(now),
    settings: DEFAULT_AUTO_REPLY_SETTINGS,
    context: null,
    history: opts.history ?? [],
    catalog: CATALOG,
    backorders: () => rows,
    // 미송 unit 은 미수 가지에 안 간다. 가면 LOOKUP_FAILED 넘김이 돼 기대값과 갈린다
    receivables: () => {
      throw new Error("미송 unit 이 미수 원본을 읽었다");
    },
  });
}

/** 판정 한 번 → 생성 줄을 history 모양으로(다음 판정의 앞 메시지) */
function asHistory(
  d: InquiryDecision,
  now: number,
  sequence = 1,
): InquiryHistoryItem[] {
  const sentAt = new Date(now).toISOString();
  return [
    { sequence, sender: "RETAILER", kind: "TEXT", sentAt, autoReply: null },
    ...generatedLines(d, sequence, now).map((l, i) => ({
      sequence: sequence + 1 + i,
      sender: l.sender,
      kind: l.kind,
      sentAt,
      autoReply: l.autoReply,
    })),
  ];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("골든셋 backorders 표 = 도매 미송 목 시드(T0 reset)", () => {
  it("판정에 넘기는 칸이 줄마다 같다(남은 수량, 입고일 D±n, 사유, 소유). 원래 수량 칸은 원본에 없다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(GOLDEN_T0);
    resetBackorderMock();
    const mock = [...inquiryBackorders()].sort(
      (a, b) => a.backorderId - b.backorderId,
    );
    const table = goldenBackorderRows(GOLDEN.backorders).sort(
      (a, b) => a.backorderId - b.backorderId,
    );
    expect(mock).toEqual(table);
    for (const b of mock) {
      expect(Object.keys(b)).not.toContain("qty");
      expect(Object.keys(b)).not.toContain("availableQty");
      expect(Object.keys(b)).not.toContain("retailerName");
    }
    // 표의 qty, status 는 시드 설명이다: 해소 = 남은 0, 9006 은 원래 4 남은 2
    for (const r of GOLDEN.backorders)
      expect(r.status === "RESOLVED", `${r.backorderId}`).toBe(
        r.remainingQty === 0,
      );
    expect(GOLDEN.backorders.find((r) => r.backorderId === 9006)).toMatchObject(
      { qty: 4, remainingQty: 2 },
    );
    expect(relDate(addDays(GOLDEN_D0, BACKORDER_SEED_ETA_DAYS[3019]))).toBe(
      "D+7",
    );
  });

  it("입고일은 reset 시각 기준 상대값이다 — 하루 뒤 reset 하면 같이 하루 밀린다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(GOLDEN_T0 + 86_400_000);
    resetBackorderMock();
    const b = inquiryBackorders().find((x) => x.backorderId === 9003);
    expect(b?.expectedInboundDate).toBe(addDays(GOLDEN_D0, 8));
  });
});

describe("S1-3 미송 답 생성", () => {
  it("예정: 남은 수량, 입고일, 사유, subject.backorderId, checkedAt = now, 한 줄", () => {
    const d = decide("린넨 셋업 자켓 베이지 L 미송 언제 와요?", [
      row(9003, { expectedInboundDate: "2026-11-05" }),
    ]);
    const lines = generatedLines(d, 3, GOLDEN_T0);
    expect(lines.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
    const [reply] = lines;
    expect(reply?.body).toBe(
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)",
    );
    expect(reply?.autoReply).toMatchObject({
      intent: "BACKORDER",
      replyToSequence: 3,
      checkedAt: new Date(GOLDEN_T0).toISOString(),
      subject: {
        listingId: null,
        variantId: 3019,
        backorderId: 9003,
        label: "린넨 셋업 자켓 베이지 / L",
      },
      facts: {
        stock: null,
        backorder: {
          qty: 2,
          expectedInboundDate: "2026-11-05",
          expectedInboundReason: "원단 수급 지연",
        },
        receivable: null,
      },
      choices: null,
    });
  });

  it("오늘, 미정, 지남 문장. 미정과 지남은 AUTO_REPLY + HANDOFF, 사유는 예정과 오늘만", () => {
    const body = (over: Partial<InquiryBackorder>) => {
      const lines = generatedLines(
        decide("린넨 셋업 자켓 베이지 L 미송 언제 와요?", [row(9003, over)]),
        1,
        GOLDEN_T0,
      );
      return [lines.map((l) => l.kind).join("+"), lines[0]?.body];
    };
    expect(body({ expectedInboundDate: "2026-10-29" })).toEqual([
      "AUTO_REPLY",
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 오늘 도매 입고 예정이에요(원단 수급 지연)",
    ]);
    expect(
      body({ expectedInboundDate: null, expectedInboundReason: null }),
    ).toEqual([
      "AUTO_REPLY+HANDOFF",
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 아직 도매 입고일이 정해지지 않았어요",
    ]);
    expect(body({ expectedInboundDate: "2026-10-26" })).toEqual([
      "AUTO_REPLY+HANDOFF",
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 등록된 입고 예정일 10월 26일이 지났어요",
    ]);
    // 지남 문장에 "지연"을 쓰지 않는다(Q2)
    expect(body({ expectedInboundDate: "2026-10-26" })[1]).not.toContain(
      "지연",
    );
  });

  it("되묻기: 본문, 보기 kind와 backorderId, 오래된 순, 끝 NOT_LISTED(variantId 0, orderable false)", () => {
    const d = decide("미송 언제 와요?", [
      row(2, { orderedAt: "2026-09-07T08:00:00+09:00" }),
      row(1, { orderedAt: "2026-09-07T08:00:00+09:00" }),
      row(3, { orderedAt: "2026-09-01T08:00:00+09:00" }),
    ]);
    const [line] = generatedLines(d, 1, GOLDEN_T0);
    expect(line?.kind).toBe("CLARIFY");
    expect(line?.body).toBe(BACKORDER_CLARIFY_BODY);
    expect(line?.autoReply?.intent).toBe("BACKORDER");
    expect(
      line?.autoReply?.choices?.map((c) => [c.kind, c.backorderId]),
    ).toEqual([
      ["BACKORDER", 3],
      ["BACKORDER", 1],
      ["BACKORDER", 2],
      ["NOT_LISTED", null],
    ]);
    expect(line?.autoReply?.choices?.at(-1)).toEqual({
      variantId: 0,
      label: NOT_LISTED_LABEL,
      orderable: false,
      kind: "NOT_LISTED",
      backorderId: null,
    });
  });

  it('9개 이상이면 오래된 8개 + "오래된 8개만 보여요", 8개면 안내 없음', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        row(100 + i, {
          orderedAt: `2026-09-${String(10 + i).padStart(2, "0")}T08:00:00+09:00`,
        }),
      );
    const [nine] = generatedLines(decide("미송 언제 와요?", many(9)), 1, 0);
    expect(nine?.body).toBe("어느 주문이요? 오래된 8개만 보여요");
    expect(nine?.autoReply?.choices?.map((c) => c.backorderId)).toEqual([
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      107,
      null,
    ]);
    const [eight] = generatedLines(decide("미송 언제 와요?", many(8)), 1, 0);
    expect(eight?.body).toBe("어느 주문이요?");
    expect(eight?.autoReply?.choices).toHaveLength(9);
  });

  it("열린 넘김 억제와 무관하게 미정, 지남 답의 넘김 줄은 생성 단계에서 늘 나온다(M2 예외는 목 저장 단계)", () => {
    const lines = generatedLines(
      decide("린넨 셋업 자켓 베이지 L 미송 언제 와요?", [
        row(9003, { expectedInboundDate: null }),
      ]),
      1,
      0,
    );
    expect(lines[1]).toMatchObject({
      sender: "SYSTEM",
      kind: "HANDOFF",
      body: HANDOFF_BODY,
    });
  });
});

describe("S1-6 날짜 경계(서울)", () => {
  it("서울 23:59:59 = UTC 14:59:59Z 는 그날, 00:00:00 = 15:00:00Z 는 다음 날", () => {
    expect(seoulDate(Date.parse("2026-10-29T14:59:59Z"))).toBe("2026-10-29");
    expect(seoulDate(Date.parse("2026-10-29T15:00:00Z"))).toBe("2026-10-30");
    expect(seoulDate(Date.parse("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  it("입고일 = 오늘 → TODAY, 서울 자정을 넘기면 PAST 로 바뀐다(같은 입고일, now 만 다름)", () => {
    const rows = [row(9003, { expectedInboundDate: "2026-10-29" })];
    const at = (iso: string) => {
      const now = Date.parse(iso);
      const d = decide("린넨 셋업 자켓 베이지 L 미송 언제 와요?", rows, {
        now,
      });
      return d.kind === "AUTO_REPLY" && d.intent === "BACKORDER"
        ? d.eta
        : d.kind;
    };
    expect(at("2026-10-29T14:59:59Z")).toBe("TODAY");
    expect(at("2026-10-29T15:00:00Z")).toBe("PAST");
    expect(at("2026-10-28T14:59:59Z")).toBe("FUTURE");
    expect(etaState(null, "2026-10-29")).toBe("NONE");
  });

  it('다른 해 입고일 "2027년 1월 5일", 다른 해 주문 칩 "2025/12/30 주문"', () => {
    const [reply] = generatedLines(
      decide("린넨 셋업 자켓 베이지 L 미송 언제 와요?", [
        row(9003, { expectedInboundDate: "2027-01-05" }),
      ]),
      1,
      GOLDEN_T0,
    );
    expect(reply?.body).toBe(
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 2027년 1월 5일 도매 입고 예정이에요(원단 수급 지연)",
    );
    expect(koreanDate("2026-11-05", "2026-10-29")).toBe("11월 5일");
    expect(
      backorderChoiceLabel(
        row(9101, { orderedAt: "2025-12-30T10:00:00+09:00", orderId: 6001 }),
        "2026-10-29",
      ),
    ).toBe("린넨 셋업 자켓 베이지/L, 남은 2장, 2025/12/30 주문 #6001");
    // 주문 시각은 서울 날짜로 읽는다: UTC 12/31 16:00 = 서울 1/1
    expect(
      backorderChoiceLabel(
        row(9102, { orderedAt: "2025-12-31T16:00:00Z", orderId: 6002 }),
        "2026-10-29",
      ),
    ).toBe("린넨 셋업 자켓 베이지/L, 남은 2장, 1/1 주문 #6002");
  });
});

describe("칩 검증(§4-2 2) — 보기 밖, 30분, 보기 뒤 해소", () => {
  const rows = [
    row(9001, { color: "레드", orderedAt: "2026-09-04T10:00:00+09:00" }),
    row(9003),
  ];
  const chip = (backorderId: number) => ({
    intent: "BACKORDER" as const,
    listingId: null,
    variantId: 3019,
    backorderId,
    label: null,
  });

  it("보기 안 + 후보 안 → 답, 31분 뒤 같은 칩 → 넘김", () => {
    const history = asHistory(decide("미송 언제 와요?", rows), GOLDEN_T0);
    const ok = decide("칩", rows, {
      now: GOLDEN_T0 + MINUTE,
      history,
      inquiry: chip(9003),
    });
    expect(ok).toMatchObject({ kind: "AUTO_REPLY", intent: "BACKORDER" });
    const late = decide("칩", rows, {
      now: GOLDEN_T0 + 31 * MINUTE,
      history,
      inquiry: chip(9003),
    });
    expect(late).toEqual({
      kind: "HANDOFF",
      reason: "INVALID_TARGET",
      intent: "BACKORDER",
    });
  });

  it("보기를 띄운 뒤 전량 배분돼 해소(남은 0) → 그 칩은 넘김", () => {
    const history = asHistory(decide("미송 언제 와요?", rows), GOLDEN_T0);
    const resolved = [
      rows[0] as InquiryBackorder,
      row(9003, { remainingQty: 0 }),
    ];
    expect(
      decide("칩", resolved, {
        now: GOLDEN_T0 + MINUTE,
        history,
        inquiry: chip(9003),
      }),
    ).toMatchObject({ kind: "HANDOFF", reason: "INVALID_TARGET" });
  });

  it("되묻기 없이 칩만 와도 넘김(보기가 없다)", () => {
    expect(decide("칩", rows, { inquiry: chip(9003) })).toMatchObject({
      kind: "HANDOFF",
      reason: "INVALID_TARGET",
    });
  });
});
