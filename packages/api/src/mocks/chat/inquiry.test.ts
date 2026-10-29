import { describe, expect, it } from "vitest";
import { chatStockListing } from "../wholesale/product";
import { CHAT_EXTRA_LISTINGS } from "./extraListings";
import {
  GOLDEN,
  fullInquiry,
  goldenCatalog,
  projectDecision,
  type GoldenExpect,
  type GoldenInquiry,
  type GoldenScenario,
} from "./golden.testkit";
import {
  DEFAULT_AUTO_REPLY_SETTINGS,
  INQUIRY_BAND_EDGES,
  INQUIRY_CONTEXT_MINUTES,
  decideInquiry,
  generatedLines,
  orderLimitOf,
  stockBand,
  stockReplyBody,
  type InquiryHistoryItem,
} from "./inquiry";

/**
 * 판정 규칙 unit(loop-05b S7-2 ~ S7-5). 골든셋을 순수 함수로 돌린다 — 서버도 목 저장소도 없다.
 * BE도 같은 골든셋으로 같은 결과를 내야 한다(§4-3). 여기서 깨지면 규칙이 바뀐 것이고, 그 변경은
 * 골든셋 `expect`와 같은 커밋이어야 한다.
 */

const CATALOG = goldenCatalog(GOLDEN.stock);
const BASE = Date.parse("2026-10-28T10:00:00+09:00");
const MINUTE = 60_000;

interface StepResult {
  scenario: string;
  required: boolean;
  expect: GoldenExpect;
  actual: GoldenExpect;
}

/** 시나리오 하나를 한 방에서 차례로 돈다. 각 단계의 소매 메시지와 생성 줄을 history에 쌓는다 */
function runScenario(s: GoldenScenario): StepResult[] {
  let now = BASE;
  let context =
    s.room.context === null
      ? null
      : {
          listingId: s.room.context.listingId,
          at: now - s.room.context.ageMinutes * MINUTE,
        };
  const settings = s.room.autoReply
    ? DEFAULT_AUTO_REPLY_SETTINGS
    : { ...DEFAULT_AUTO_REPLY_SETTINGS, enabled: false };
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
    const decision = decideInquiry({
      body: step.text,
      inquiry: fullInquiry(step.inquiry),
      now,
      wholesalerId: s.room.wholesalerId,
      settings,
      context,
      history: [...history],
      catalog: CATALOG,
    });
    const sentAt = new Date(now).toISOString();
    history.push({
      sequence: mine,
      sender: "RETAILER",
      kind: "TEXT",
      sentAt,
      autoReply: null,
    });
    for (const line of generatedLines(decision, mine, now)) {
      sequence += 1;
      history.push({
        sequence,
        sender: line.sender,
        kind: line.kind,
        sentAt,
        autoReply: line.autoReply,
      });
    }
    return {
      scenario: s.id,
      required: s.required,
      expect: step.expect,
      actual: projectDecision(decision),
    };
  });
}

const RESULTS = GOLDEN.scenarios.flatMap(runScenario);

const isAuto = (e: GoldenExpect) =>
  e.kind === "AUTO_REPLY" ||
  (Array.isArray(e.kinds) && e.kinds.includes("AUTO_REPLY"));
const isHandoff = (e: GoldenExpect) =>
  e.kind === "HANDOFF" ||
  (Array.isArray(e.kinds) && e.kinds.includes("HANDOFF"));
const sameAnswer = (a: GoldenExpect, e: GoldenExpect) =>
  a.target === e.target && a.band === e.band && a.orderable === e.orderable;

describe("골든셋 모양", () => {
  it("시나리오 35개 = 필수 3 + 재고 답 17 + 넘김 15, id 중복 없음", () => {
    const count = (g: string) =>
      GOLDEN.scenarios.filter((s) => s.group === g).length;
    expect(GOLDEN.scenarios).toHaveLength(35);
    expect([count("required"), count("stock"), count("handoff")]).toEqual([
      3, 17, 15,
    ]);
    expect(new Set(GOLDEN.scenarios.map((s) => s.id)).size).toBe(35);
    expect(GOLDEN.scenarios.filter((s) => s.required).map((s) => s.id)).toEqual(
      ["P1", "P2", "P3"],
    );
  });

  it("규칙 상수가 코드와 같다(문맥 30분, 구간 경계 0 10 50)", () => {
    expect(GOLDEN.rules.contextMinutes).toBe(INQUIRY_CONTEXT_MINUTES);
    expect(GOLDEN.rules.bands).toEqual([...INQUIRY_BAND_EDGES]);
  });
});

describe("S7-2 필수 경로 P1 P2 P3 — 모든 단계 정확 일치", () => {
  for (const id of ["P1", "P2", "P3"]) {
    it(`${id} kind, intent, 대상, 구간, 주문 가능, choices`, () => {
      const steps = RESULTS.filter((r) => r.scenario === id);
      expect(steps.length).toBeGreaterThan(1);
      for (const r of steps) expect(r.actual).toEqual(r.expect);
    });
  }
});

describe("S7-3 골든셋 35개 지표", () => {
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

  it('(a) 재고 되묻기 뒤 "레드 M 미송은 언제 와요?" → 재고 답 없이 넘김(미송 NOT_SUPPORTED)', () => {
    expect(second([{ text: "레드 M 미송은 언제 와요?", expect: {} }])).toEqual({
      kind: "HANDOFF",
      reason: "NOT_SUPPORTED",
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
