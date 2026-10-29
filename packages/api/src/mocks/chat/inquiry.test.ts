import { describe, expect, it } from "vitest";
import { chatStockListing } from "../wholesale/product";
import { CHAT_EXTRA_LISTINGS } from "./extraListings";
import { seoulDate } from "./backorderCandidates";
import { chatExtraReceivables } from "./extraReceivables";
import {
  GOLDEN,
  GOLDEN_T0,
  fullInquiry,
  goldenBackorders,
  goldenCatalog,
  goldenReceivableRows,
  projectDecision,
  projectStep,
  projectV4Lines,
  type GoldenExpect,
  type GoldenInquiry,
  type GoldenScenario,
} from "./golden.testkit";
import {
  BACKORDER_CHOICE_MAX,
  DEFAULT_AUTO_REPLY_SETTINGS,
  INQUIRY_BAND_EDGES,
  INQUIRY_CONTEXT_MINUTES,
  decideInquiry,
  generatedLines,
  linesToAppend,
  openHandoffOf,
  orderLimitOf,
  stockBand,
  stockReplyBody,
  type InquiryHistoryItem,
} from "./inquiry";
import {
  receivableOf,
  type InquiryReceivable,
  type InquiryReceivableSource,
} from "./receivable";
import { mockReceivable, resetSettlementMock } from "../wholesale/settlement";

/**
 * 판정 규칙 unit(loop-05b S7-2 ~ S7-5). 골든셋을 순수 함수로 돌린다 — 서버도 목 저장소도 없다.
 * BE도 같은 골든셋으로 같은 결과를 내야 한다(§4-3). 여기서 깨지면 규칙이 바뀐 것이고, 그 변경은
 * 골든셋 `expect`와 같은 커밋이어야 한다.
 */

const CATALOG = goldenCatalog(GOLDEN.stock);
const BACKORDERS = goldenBackorders(GOLDEN.backorders);
const RECEIVABLE_ROWS = goldenReceivableRows();
const RECEIVABLES: InquiryReceivableSource = () => RECEIVABLE_ROWS;
/** 첫 단계 시각. 재고 시나리오는 상대 시간만 보고, 미송은 이 날(서울)이 D+0이다 */
const BASE = GOLDEN_T0;
const MINUTE = 60_000;
const DAY = 86_400_000;
/** decideInquiry 를 직접 부르는 재고 unit 이 같이 넘기는 칸(방 1 봄봄상회, 오늘, 골든셋 미송 원본) */
const ROOM1 = {
  retailerId: 1,
  today: seoulDate(BASE),
  backorders: BACKORDERS,
  receivables: RECEIVABLES,
};

interface StepResult {
  scenario: string;
  required: boolean;
  expect: GoldenExpect;
  actual: GoldenExpect;
}

/**
 * 시나리오 하나를 한 방에서 차례로 돈다. 각 단계의 소매 메시지와 **방에 들어간** 줄(`linesToAppend`)을 history에
 * 쌓는다. v4(since 4)는 그 줄을 투영하고, v3까지는 판정을 투영한다(기대값 모양이 그때 정해졌다)
 */
function runScenario(
  s: GoldenScenario,
  backorders = BACKORDERS,
  rows: readonly InquiryReceivable[] = RECEIVABLE_ROWS,
): StepResult[] {
  let failsLeft = s.room.receivableFailTimes ?? 0;
  const receivables: InquiryReceivableSource = () => {
    if (failsLeft > 0) {
      failsLeft -= 1;
      throw new Error("골든셋: 정산 조회 실패");
    }
    return rows;
  };
  const rowAsOf =
    receivableOf(rows, s.room.wholesalerId, s.room.retailerId ?? 1)?.asOf ??
    null;
  let now = BASE + (s.room.afterDays ?? 0) * DAY;
  let context =
    s.room.context === null
      ? null
      : {
          listingId: s.room.context.listingId,
          at: now - s.room.context.ageMinutes * MINUTE,
        };
  const settings = {
    enabled: s.room.autoReply,
    intents: s.room.intents ?? DEFAULT_AUTO_REPLY_SETTINGS.intents,
  };
  const history: InquiryHistoryItem[] = [];
  let sequence = 0;
  return s.steps.map((step) => {
    now += (step.afterMinutes ?? 0) * MINUTE;
    if (step.enter !== undefined)
      context =
        step.enter.listingId === null
          ? null
          : { listingId: step.enter.listingId, at: now };
    sequence += 1;
    const mine = sequence;
    if (step.sender === "WHOLESALER") {
      history.push({
        sequence: mine,
        sender: "WHOLESALER",
        kind: "TEXT",
        sentAt: new Date(now).toISOString(),
        autoReply: null,
      });
      return {
        scenario: s.id,
        required: s.required,
        expect: step.expect,
        actual: { openHandoff: openHandoffOf(history) !== null },
      };
    }
    const decision = decideInquiry({
      body: step.text,
      inquiry: fullInquiry(step.inquiry),
      now,
      wholesalerId: s.room.wholesalerId,
      retailerId: s.room.retailerId ?? 1,
      today: seoulDate(now),
      settings,
      context,
      history: [...history],
      catalog: CATALOG,
      backorders,
      receivables,
    });
    const sentAt = new Date(now).toISOString();
    const before = [...history];
    history.push({
      sequence: mine,
      sender: "RETAILER",
      kind: "TEXT",
      sentAt,
      autoReply: null,
    });
    const lines = generatedLines(decision, mine, now);
    const kept = linesToAppend(lines, before);
    for (const line of kept) {
      sequence += 1;
      history.push({
        sequence,
        sender: line.sender,
        kind: line.kind,
        sentAt,
        autoReply: line.autoReply,
        handoff: line.handoff,
      });
    }
    return {
      scenario: s.id,
      required: s.required,
      expect: step.expect,
      actual:
        (s.since ?? 0) >= 4
          ? projectV4Lines(kept, { self: mine, nowMs: now, asOf: rowAsOf })
          : projectStep(decision, lines, now),
    };
  });
}

const RESULTS = GOLDEN.scenarios.flatMap((s) => runScenario(s));

/** v4 줄 투영 `{lines}`의 kind 들. v3 판정 투영은 kind 하나 또는 kinds */
const kindsOf = (e: GoldenExpect): unknown[] =>
  Array.isArray(e.lines)
    ? (e.lines as { kind: unknown }[]).map((l) => l.kind)
    : Array.isArray(e.kinds)
      ? e.kinds
      : [e.kind];
const isAuto = (e: GoldenExpect) => kindsOf(e).includes("AUTO_REPLY");
const isHandoff = (e: GoldenExpect) => kindsOf(e).includes("HANDOFF");
const isV4 = (e: GoldenExpect) => Array.isArray(e.lines);
/**
 * 같은 답인가. 재고는 대상, 구간, 주문 가능. 미송은 대상, 남은 수량, 입고일과 상태까지.
 * v4(미수)는 줄 전체 — 금액, 연체, 선수금, 본문, 조회 시각 하나라도 다르면 틀린 답이다
 */
const sameAnswer = (a: GoldenExpect, e: GoldenExpect) =>
  isV4(e)
    ? JSON.stringify(a) === JSON.stringify(e)
    : a.target === e.target &&
      a.band === e.band &&
      a.orderable === e.orderable &&
      a.remainingQty === e.remainingQty &&
      JSON.stringify(a.eta) === JSON.stringify(e.eta);

describe("골든셋 모양", () => {
  it("v4 시나리오 84개 = 필수 5 + 재고 답 17 + 넘김 22 + 미송 23 + 미수 17, id 중복 없음, v4 몫 25", () => {
    const count = (g: string) =>
      GOLDEN.scenarios.filter((s) => s.group === g).length;
    expect(GOLDEN.version).toBe(4);
    expect(GOLDEN.scenarios).toHaveLength(84);
    expect([
      count("required"),
      count("stock"),
      count("handoff"),
      count("backorder"),
      count("receivable"),
    ]).toEqual([5, 17, 22, 23, 17]);
    expect(new Set(GOLDEN.scenarios.map((s) => s.id)).size).toBe(84);
    expect(GOLDEN.scenarios.filter((s) => s.required).map((s) => s.id)).toEqual(
      ["P1", "P2", "P3", "P4", "P5"],
    );
    // v4 = 미수 18(P5 + R01~R17) + 넘김 7(H16~H22). 기존 59개는 since 없이 그대로다
    const v4 = GOLDEN.scenarios.filter((s) => (s.since ?? 0) >= 4);
    expect(v4.map((s) => s.id)).toEqual([
      "P5",
      ...Array.from(
        { length: 17 },
        (_, i) => `R${String(i + 1).padStart(2, "0")}`,
      ),
      "H16",
      "H17",
      "H18",
      "H19",
      "H20",
      "H21",
      "H22",
    ]);
  });

  it("규칙 상수가 코드와 같다(문맥 30분, 구간 경계 0 10 50, 미송 보기 8, T0 서울 2026-10-29)", () => {
    expect(GOLDEN.rules.contextMinutes).toBe(INQUIRY_CONTEXT_MINUTES);
    expect(GOLDEN.rules.bands).toEqual([...INQUIRY_BAND_EDGES]);
    expect(GOLDEN.rules.backorderChoiceMax).toBe(BACKORDER_CHOICE_MAX);
    expect(seoulDate(GOLDEN_T0)).toBe("2026-10-29");
  });
});

describe("S7-2, S1-2 필수 경로 P1 P2 P3 P4 P5 — 모든 단계 정확 일치", () => {
  for (const id of ["P1", "P2", "P3", "P4", "P5"]) {
    it(`${id} kind, intent, 대상, 구간, 주문 가능, choices`, () => {
      const steps = RESULTS.filter((r) => r.scenario === id);
      expect(steps.length).toBeGreaterThan(1);
      for (const r of steps) expect(r.actual).toEqual(r.expect);
    });
  }
});

describe("loop-07 S1-2 골든셋 v4 미수와 넘김", () => {
  const v4 = RESULTS.filter((r) => isV4(r.expect) || "openHandoff" in r.expect);

  it("v4 25개 시나리오 전 단계 정확 일치(금액, 연체, 선수금, 본문, 조회 시각, 넘김 이유, 의도, 원인 메시지)", () => {
    expect(v4.length).toBeGreaterThanOrEqual(25);
    expect(
      v4.filter((r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect)),
    ).toEqual([]);
  });

  it("미수 잘못된 자동 답 0: 미수 AUTO_REPLY 줄은 전부 기대와 같고, 넘겨야 할 미수 질문에 금액 줄이 없다", () => {
    const receivableLines = (e: GoldenExpect) =>
      Array.isArray(e.lines)
        ? (e.lines as { kind: string; intent?: string }[]).filter(
            (l) => l.kind === "AUTO_REPLY" && l.intent === "RECEIVABLE",
          )
        : [];
    const sent = v4.filter((r) => receivableLines(r.actual).length > 0);
    // 미수 답 10단계(P5 2, R01 R02 R03 R04 R08 R14 R16 R17)가 실제로 나갔다 — 0이면 측정 불가
    expect(sent.length).toBe(10);
    expect(
      sent.filter((r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect)),
    ).toEqual([]);
    const shouldHandoff = v4.filter(
      (r) => isHandoff(r.expect) && !isAuto(r.expect),
    );
    expect(shouldHandoff.filter((r) => isAuto(r.actual))).toEqual([]);
  });

  it("미수 표 ↔ 목: settlement.ts seed 행 = 정산 목 시드 요약(T0), extraReceivables.ts 행 = 채팅 목 표(asOf 제외)", () => {
    resetSettlementMock();
    const strip = (r: InquiryReceivable | null) =>
      r === null ? null : { ...r, asOf: "-" };
    for (const row of GOLDEN.receivables) {
      const golden = strip(
        receivableOf(RECEIVABLE_ROWS, row.wholesalerId, row.retailerId),
      );
      if (row.source === "settlement.ts seed")
        expect(
          strip(mockReceivable(row.wholesalerId, row.retailerId, GOLDEN_T0)),
          `${row.wholesalerId}×${row.retailerId}`,
        ).toEqual(golden);
      else if (row.source === "extraReceivables.ts")
        expect(
          strip(
            receivableOf(
              chatExtraReceivables(GOLDEN.rules.t0),
              row.wholesalerId,
              row.retailerId,
            ),
          ),
        ).toEqual(golden);
      else expect(row.source).toBe("golden only");
    }
    // 목 시드 몫은 두 행뿐이다(장면 3의 방 1, 방 33)
    expect(
      GOLDEN.receivables
        .filter((r) => r.source !== "golden only")
        .map((r) => [r.wholesalerId, r.retailerId]),
    ).toEqual([
      [101, 1],
      [102, 1],
    ]);
  });
});

describe("S7-3, S1-2 골든셋 84개 지표", () => {
  it("전 단계 정확 일치(필수 밖도 기대값과 같다)", () => {
    const misses = RESULTS.filter(
      (r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect),
    );
    expect(misses).toEqual([]);
  });

  it("잘못된 자동 답 0(AUTO_REPLY 0건이면 측정 불가로 실패), 안전한 넘김 전부, 맞힌 답 80% 이상", () => {
    const sent = RESULTS.filter((r) => isAuto(r.actual));
    expect(sent.length).toBeGreaterThan(0);
    const wrong = sent.filter(
      (r) => !isAuto(r.expect) || !sameAnswer(r.actual, r.expect),
    );
    expect(wrong).toEqual([]);

    const handoffExpected = RESULTS.filter(
      (r) => isHandoff(r.expect) && !isAuto(r.expect),
    );
    const safe = handoffExpected.filter((r) => isHandoff(r.actual));
    expect(safe.length).toBe(handoffExpected.length);

    const autoExpected = RESULTS.filter((r) => isAuto(r.expect));
    const right = autoExpected.filter(
      (r) =>
        isAuto(r.actual) &&
        r.actual.intent === r.expect.intent &&
        sameAnswer(r.actual, r.expect),
    );
    expect(right.length / autoExpected.length).toBeGreaterThanOrEqual(0.8);
  });

  it("시드 몫 stock 이 상품 목 시드와 variant마다 같다, 채팅 목 전용 몫은 extraListings 와 같다", () => {
    for (const row of GOLDEN.stock) {
      const listing =
        row.source === "product.ts seed"
          ? chatStockListing(row.listingId)
          : (CHAT_EXTRA_LISTINGS.find((l) => l.listingId === row.listingId) ??
            null);
      expect(row.source).toMatch(/^(product\.ts seed|chat mock extra)$/);
      expect(listing, `${row.listingId}`).not.toBeNull();
      const v = listing?.variants.find((x) => x.variantId === row.variantId);
      expect({
        wholesalerId: listing?.wholesalerId,
        title: listing?.title,
        listingPublished: listing?.published,
        color: v?.color,
        size: v?.size,
        availableQty: v?.availableQty,
        orderLimit: v?.orderLimit,
        variantPublished: v?.published,
      }).toEqual({
        wholesalerId: row.wholesalerId,
        title: row.listingTitle,
        listingPublished: row.listingPublished,
        color: row.color,
        size: row.size,
        availableQty: row.availableQty,
        orderLimit: row.orderLimit,
        variantPublished: row.variantPublished,
      });
    }
    // 골든셋이 쓰는 게시글의 옵션은 빠짐없이 표에 있다(순서까지) — 되묻기 보기가 표와 같아야 해서
    for (const id of new Set(GOLDEN.stock.map((r) => r.listingId))) {
      const real =
        chatStockListing(id) ??
        CHAT_EXTRA_LISTINGS.find((l) => l.listingId === id);
      expect(real?.variants.map((v) => v.variantId)).toEqual(
        GOLDEN.stock.filter((r) => r.listingId === id).map((r) => r.variantId),
      );
    }
  });
});

/** 골든셋 밖 시나리오. 골든셋 파일은 계약 stage에서만 바꾼다 — 그래서 여기 unit으로 둔다 */
function adhoc(
  id: string,
  listingId: number,
  steps: { text: string; inquiry?: GoldenInquiry; expect: GoldenExpect }[],
): StepResult[] {
  return runScenario({
    id,
    title: id,
    required: false,
    group: "handoff",
    room: {
      wholesalerId: 101,
      context: { listingId, ageMinutes: 2 },
      autoReply: true,
    },
    steps: steps.map((st) => ({ ...st, inquiry: st.inquiry ?? null })),
  });
}

const CLARIFY_2001 = {
  kind: "CLARIFY",
  intent: "STOCK",
  choices: [3001, 3002, 3003, 3004, 3005],
};

describe("옵션 확정은 색상과 사이즈 둘 다(§4-2 2, 7, codex-meta M1)", () => {
  it('되묻기 뒤 "빨강 L 몇 장 있어요?" → 넘김(CLARIFY_AGAIN), "L이요" → 넘김. L이 레드뿐이어도 레드 L로 답하지 않는다', () => {
    for (const [text, reason] of [
      ["빨강 L 몇 장 있어요?", "CLARIFY_AGAIN"],
      ["빨강 L", "NO_INTENT"],
      ["L이요", "NO_INTENT"],
    ] as const) {
      const [, second] = adhoc("M1-inherit", 2001, [
        { text: "이 셔츠 몇 장 남았어요?", expect: CLARIFY_2001 },
        { text, expect: { kind: "HANDOFF", reason } },
      ]);
      expect(second?.actual, text).toEqual({ kind: "HANDOFF", reason });
    }
  });

  it("첫 문장에 사이즈만, 색상만 있으면 답하지 않고 되묻는다", () => {
    for (const text of [
      "L 몇 장 있어요?",
      "빨강 L 몇 장 있어요?",
      "레드 몇 장 남았어요?",
    ]) {
      const [first] = adhoc("M1-fresh", 2001, [{ text, expect: CLARIFY_2001 }]);
      expect(first?.actual, text).toEqual(CLARIFY_2001);
    }
  });

  it("값이 하나뿐인 칸은 말하지 않아도 된다(FREE 상품의 색상만), 게시 옵션 1개면 옵션어 없이 답(S7-7)", () => {
    const [beige] = adhoc("M1-free", 2002, [
      { text: "베이지 몇 장 남았어요?", expect: {} },
    ]);
    expect(beige?.actual).toMatchObject({ kind: "AUTO_REPLY", target: 3007 });
    const [single] = adhoc("M1-single", 2901, [
      { text: "FREE 몇 장 남았어요?", expect: {} },
    ]);
    expect(single?.actual).toMatchObject({ kind: "AUTO_REPLY", target: 3901 });
  });
});

describe("되묻기 계승은 같은 의도와 같은 상품일 때만(PR #291 C1, D34)", () => {
  const ASK = { text: "이 셔츠 몇 장 남았어요?", expect: CLARIFY_2001 };
  const second = (
    steps: { text: string; inquiry?: GoldenInquiry; expect: GoldenExpect }[],
  ) => adhoc("C1", 2001, [ASK, ...steps])[1]?.actual;

  it('(a) 재고 되묻기 뒤 "레드 M 미송은 언제 와요?" → 재고 답 없이 미송 판정. 봄봄상회의 레드 M 미송(9004)은 해소돼 넘김(NO_MATCH)', () => {
    // loop-05b 때는 미송이 넘김(NOT_SUPPORTED)이었다. loop-06부터 미송 가지가 받는다 — 재고 3002로 답하지 않는 게 요점
    expect(second([{ text: "레드 M 미송은 언제 와요?", expect: {} }])).toEqual({
      kind: "HANDOFF",
      reason: "NO_MATCH",
    });
  });

  it('(b) 2001 되묻기가 열린 채 inquiry {STOCK, 2002} + "레드 M" → 2001의 3002로 답하지 않는다', () => {
    expect(
      second([
        {
          text: "레드 M",
          inquiry: { intent: "STOCK", listingId: 2002, variantId: null },
          expect: {},
        },
      ]),
    ).toEqual({ kind: "CLARIFY", intent: "STOCK", choices: [3006, 3007] });
    // 보기 안의 variantId(3002)라도 상품이 2002면 계승하지 않는다 → 2002에 없는 옵션이라 넘김
    expect(
      second([
        {
          text: "레드 M",
          inquiry: { intent: "STOCK", listingId: 2002, variantId: 3002 },
          expect: {},
        },
      ]),
    ).toEqual({ kind: "HANDOFF", reason: "INVALID_TARGET" });
  });

  it('(c) inquiry.variantId가 보기 밖이면 본문 "레드 M"으로 넘어가 고르지 않는다', () => {
    for (const variantId of [3999, 3006]) {
      expect(
        second([
          {
            text: "레드 M",
            inquiry: { intent: "STOCK", listingId: 2001, variantId },
            expect: {},
          },
        ]),
        `${variantId}`,
      ).toEqual({ kind: "HANDOFF", reason: "INVALID_TARGET" });
    }
  });

  it("inquiry.intent와 본문 키워드 의도가 다르면 MULTI_INTENT 넘김(되묻기 없어도)", () => {
    const [first] = adhoc("C1-377", 2001, [
      {
        text: "레드 M 미송 언제 와요?",
        inquiry: { intent: "STOCK", listingId: 2001, variantId: 3002 },
        expect: {},
      },
    ]);
    expect(first?.actual).toEqual({ kind: "HANDOFF", reason: "MULTI_INTENT" });
  });

  it("같은 의도, 같은 상품이면 그대로 계승한다(칩, 본문 옵션어)", () => {
    expect(
      second([
        {
          text: "레드 / M",
          inquiry: { intent: "STOCK", listingId: 2001, variantId: 3002 },
          expect: {},
        },
      ]),
    ).toMatchObject({ kind: "AUTO_REPLY", target: 3002 });
    expect(second([{ text: "레드 M이요", expect: {} }])).toMatchObject({
      kind: "AUTO_REPLY",
      target: 3002,
    });
  });
});

describe("S7-4 정규화 표 6행", () => {
  for (const row of GOLDEN.normalization) {
    it(row.rule, () => {
      for (const c of row.cases) {
        const now = BASE;
        const history: InquiryHistoryItem[] = [];
        if (c.afterClarify === true) {
          // 직전 유효 되묻기를 깐다: 1분 전 소매 질문 + 같은 시각 되묻기
          const ask = decideInquiry({
            body: "이 셔츠 몇 장 남았어요?",
            inquiry: null,
            now: now - MINUTE,
            wholesalerId: 101,
            settings: DEFAULT_AUTO_REPLY_SETTINGS,
            context: { listingId: 2001, at: now - 2 * MINUTE },
            history: [],
            catalog: CATALOG,
            ...ROOM1,
          });
          const at = new Date(now - MINUTE).toISOString();
          history.push({
            sequence: 1,
            sender: "RETAILER",
            kind: "TEXT",
            sentAt: at,
            autoReply: null,
          });
          for (const line of generatedLines(ask, 1, now - MINUTE))
            history.push({
              sequence: 2,
              sender: line.sender,
              kind: line.kind,
              sentAt: at,
              autoReply: line.autoReply,
            });
        }
        const d = decideInquiry({
          body: c.text,
          inquiry: null,
          now,
          wholesalerId: 101,
          settings: DEFAULT_AUTO_REPLY_SETTINGS,
          context: { listingId: 2001, at: now - 2 * MINUTE },
          history,
          catalog: CATALOG,
          ...ROOM1,
        });
        expect(projectDecision(d), c.text).toEqual(c.expect);
      }
    });
  }
});

describe("S7-5 구간 경계와 한도", () => {
  it("−13 0 1 9 10 49 50 → NONE NONE UNDER_10 UNDER_10 UNDER_50 UNDER_50 FIFTY_PLUS", () => {
    expect([-13, 0, 1, 9, 10, 49, 50].map(stockBand)).toEqual([
      "NONE",
      "NONE",
      "UNDER_10",
      "UNDER_10",
      "UNDER_50",
      "UNDER_50",
      "FIFTY_PLUS",
    ]);
  });

  it("한도 0 → null, 500 → 500", () => {
    expect(orderLimitOf(0)).toBeNull();
    expect(orderLimitOf(500)).toBe(500);
  });
});

describe("자동 답 문장 — 소매에게 가는 글에 정확 수량이 없다", () => {
  it("구간 글자만 쓰고, 수량 한 줄은 끝에 붙는다", () => {
    const listing = CATALOG(2001);
    const variant = listing?.variants.find((v) => v.variantId === 3002);
    if (listing === null || variant === undefined) throw new Error("시드 없음");
    const body = stockReplyBody({
      kind: "AUTO_REPLY",
      intent: "STOCK",
      listing,
      variant,
      band: "UNDER_50",
      orderable: true,
      orderLimit: 500,
      qtyNote: true,
    });
    expect(body).toBe(
      "레드 M은 10~49장 있어요. 지금 주문할 수 있어요(한 번에 최대 500장). 수량은 주문서에서 확인돼요",
    );
    expect(body).not.toContain("35");
  });

  it("재고 0 은 AUTO_REPLY(없어요) + HANDOFF 두 줄, 도매 facts 판매가능은 0으로 접힌다", () => {
    const listing = CATALOG(2001);
    const variant = listing?.variants.find((v) => v.variantId === 3003);
    if (listing === null || variant === undefined) throw new Error("시드 없음");
    const lines = generatedLines(
      {
        kind: "AUTO_REPLY",
        intent: "STOCK",
        listing,
        variant,
        band: "NONE",
        orderable: true,
        orderLimit: null,
        qtyNote: false,
      },
      7,
      BASE,
    );
    expect(lines.map((l) => l.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe("레드 L은 지금은 재고가 없어요");
    expect(lines[0]?.autoReply?.facts.stock?.availableQty).toBe(0);
    expect(lines[0]?.autoReply?.replyToSequence).toBe(7);
  });
});
