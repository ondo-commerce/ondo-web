import { describe, expect, it } from "vitest";
import { chatStockListing } from "../wholesale/product";
import { CHAT_EXTRA_LISTINGS } from "./extraListings";
import { seoulDate } from "./backorderCandidates";
import { chatExtraReceivables } from "./extraReceivables";
import {
  GOLDEN,
  GOLDEN_T0,
  goldenBackorders,
  goldenCatalog,
  goldenReceivableRows,
  fullInquiry,
  goldenScore,
  isAuto,
  isHandoff,
  projectDecision,
  runScenario,
  type GoldenExpect,
  type GoldenInquiry,
  type StepResult,
} from "./golden.testkit";
import {
  BACKORDER_CHOICE_MAX,
  DEFAULT_AUTO_REPLY_SETTINGS,
  INQUIRY_BAND_EDGES,
  INQUIRY_CONTEXT_MINUTES,
  RECEIVABLE_AMOUNT_QUESTIONS,
  decideInquiry,
  generatedLines,
  hasPeriodWord,
  isReceivableAmountQuestion,
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
import type { InquiryPacking, InquiryPackingSource } from "./packingOrders";

/**
 * 판정 규칙 unit(loop-05b S7-2 ~ S7-5). 골든셋을 순수 함수로 돌린다 — 서버도 목 저장소도 없다.
 * BE도 같은 골든셋으로 같은 결과를 내야 한다(§4-3). 여기서 깨지면 규칙이 바뀐 것이고, 그 변경은
 * 골든셋 `expect`와 같은 커밋이어야 한다.
 */

const CATALOG = goldenCatalog(GOLDEN.stock);
const BACKORDERS = goldenBackorders(GOLDEN.backorders);
const RECEIVABLE_ROWS = goldenReceivableRows();
const RECEIVABLES: InquiryReceivableSource = () => RECEIVABLE_ROWS;
/** 포장 원본 0(loop-08i). 방 1은 열린 미송이 있어 어차피 안 부른다 */
const NO_PACKINGS: InquiryPackingSource = () => [];
/** 첫 단계 시각. 재고 시나리오는 상대 시간만 보고, 미송은 이 날(서울)이 D+0이다 */
const BASE = GOLDEN_T0;
const MINUTE = 60_000;
/** decideInquiry 를 직접 부르는 재고 unit 이 같이 넘기는 칸(방 1 봄봄상회, 오늘, 골든셋 미송 원본) */
const ROOM1 = {
  retailerId: 1,
  today: seoulDate(BASE),
  backorders: BACKORDERS,
  receivables: RECEIVABLES,
  packings: NO_PACKINGS,
};

/** 골든셋 전 단계 결과. 점수(`goldenScore.test.ts`)도 같은 `runScenario`를 돈다 */
const RESULTS = GOLDEN.scenarios.flatMap((s) => runScenario(s));
const SCORE = goldenScore(RESULTS, GOLDEN);

const isV4 = (e: GoldenExpect) => Array.isArray(e.lines);

describe("골든셋 모양", () => {
  it("v7 시나리오 132개 = 필수 5 + 재고 답 17 + 넘김 53 + 미송 40 + 미수 17, id 중복 없음, v4 몫 25, v5 몫 25, v6 몫 7, v7 몫 16", () => {
    const count = (g: string) =>
      GOLDEN.scenarios.filter((s) => s.group === g).length;
    expect(GOLDEN.version).toBe(7);
    expect(GOLDEN.scenarios).toHaveLength(132);
    // v4 84개(넘김 22, 미송 23) + v5 넘김 24(N 12 + U 9 + X 3), 미송 1(G01) + v6 넘김 7(O01~O07)
    expect([
      count("required"),
      count("stock"),
      count("handoff"),
      count("backorder"),
      count("receivable"),
    ]).toEqual([5, 17, 53, 40, 17]);
    expect(new Set(GOLDEN.scenarios.map((s) => s.id)).size).toBe(132);
    // S3-6 v5는 뒤에 붙이기만 했다: 앞 84개는 since 5가 아니고, 판정 투영을 고른 건 G01뿐
    expect(GOLDEN.scenarios.slice(0, 84).every((s) => (s.since ?? 0) < 5)).toBe(
      true,
    );
    // 08f S1-2 v6도 뒤에 붙이기만 했다: 앞 109개는 since 6이 아니고, 뒤 7개가 O01~O07
    expect(
      GOLDEN.scenarios.slice(0, 109).every((s) => (s.since ?? 0) < 6),
    ).toBe(true);
    expect(
      GOLDEN.scenarios.filter((s) => s.since === 6).map((s) => s.id),
    ).toEqual(["O01", "O02", "O03", "O04", "O05", "O06", "O07"]);
    expect(GOLDEN.aboutV6).toMatch(/^v6\(since 6, loop-08f §5-3\)/);
    expect(GOLDEN.scenarios.slice(109, 116).map((s) => s.id)).toEqual([
      "O01",
      "O02",
      "O03",
      "O04",
      "O05",
      "O06",
      "O07",
    ]);
    // 08i S1-9 v7도 뒤에 붙이기만 했다: 앞 116개는 since 7이 아니고, 뒤 16개가 K01~K16(전부 미송, 필수 아님)
    expect(
      GOLDEN.scenarios.slice(0, 116).every((s) => (s.since ?? 0) < 7),
    ).toBe(true);
    const k16 = Array.from(
      { length: 16 },
      (_, i) => `K${String(i + 1).padStart(2, "0")}`,
    );
    expect(GOLDEN.scenarios.slice(116).map((s) => s.id)).toEqual(k16);
    expect(
      GOLDEN.scenarios.filter((s) => s.since === 7).map((s) => s.id),
    ).toEqual(k16);
    expect(
      GOLDEN.scenarios
        .slice(116)
        .every((s) => s.group === "backorder" && !s.required),
    ).toBe(true);
    expect(GOLDEN.aboutV7).toMatch(/^v7\(since 7, loop-08i §5-3\)/);
    expect(
      GOLDEN.scenarios
        .filter((s) => s.projection !== undefined)
        .map((s) => s.id),
    ).toEqual(["G01", "K13"]);
    const two = (p: string, n: number) =>
      Array.from(
        { length: n },
        (_, i) => `${p}${String(i + 1).padStart(2, "0")}`,
      );
    expect(
      GOLDEN.scenarios.filter((s) => s.since === 5).map((s) => s.id),
    ).toEqual([...two("N", 12), ...two("U", 9), "G01", ...two("X", 3)]);
    expect(GOLDEN.scenarios.filter((s) => s.required).map((s) => s.id)).toEqual(
      ["P1", "P2", "P3", "P4", "P5"],
    );
    // v4 = 미수 18(P5 + R01~R17) + 넘김 7(H16~H22). 기존 59개는 since 없이 그대로다
    const v4 = GOLDEN.scenarios.filter((s) => s.since === 4);
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
    // 미수 답 9단계(P5 2, R01 R02 R03 R04 R14 R16 R17)가 실제로 나갔다 — 0이면 측정 불가.
    // R08 "잔액 얼마예요"는 C4로 넘김이 됐다
    expect(sent.length).toBe(9);
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

describe("S7-3, S1-2, 08c S3-6, 08f S1-2, 08i S1-9 골든셋 132개 지표(v4 84개 포함 전 단계)", () => {
  it("전 단계 정확 일치(필수 밖도 기대값과 같다)", () => {
    const misses = RESULTS.filter(
      (r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect),
    );
    expect(misses).toEqual([]);
  });

  it("잘못된 자동 답 0(AUTO_REPLY 0건이면 측정 불가로 실패), 안전한 넘김 전부, 맞힌 답 80% 이상 — goldenScore 값", () => {
    // 같은 답 = 기대 투영 전체 일치(loop-08b S2-3). 옛 sameAnswer 는 재고 intent, orderLimit, qtyNote 를 안 봤다
    expect(SCORE.autoSent).toBeGreaterThan(0);
    expect(SCORE.autoWrong).toBe(0);
    expect(SCORE.handoffExpected).toBeGreaterThan(0);
    expect(SCORE.handoffSafe).toBe(SCORE.handoffExpected);
    expect(SCORE.rates.autoRight).not.toBeNull();
    expect(SCORE.rates.autoRight ?? 0).toBeGreaterThanOrEqual(0.8);
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

describe("loop-08i S1-9 S1-10 기존 기대와 투영별 결과 보존(골든 v7, 포장 답 줄 투영 칸)", () => {
  /** v6까지의 116개. v7은 뒤에 붙이기만 한다 */
  const OLD = GOLDEN.scenarios.slice(0, 116);
  const lineProjected = (s: (typeof OLD)[number]) =>
    (s.since ?? 0) >= 4 && s.projection !== "decision";

  it("줄 투영 56개 + 판정 투영 60개, 전 단계 actual = expect, 어느 줄에도 facts 칸이 없다", () => {
    expect(OLD.filter(lineProjected)).toHaveLength(56);
    expect(OLD.filter((s) => !lineProjected(s))).toHaveLength(60);
    const ids = new Set(OLD.map((s) => s.id));
    const old = RESULTS.filter((r) => ids.has(r.scenario));
    expect(old).toHaveLength(150);
    expect(
      old.filter((r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect)),
    ).toEqual([]);
    const withFacts = old.filter((r) =>
      ((r.actual.lines ?? []) as Record<string, unknown>[]).some(
        (l) => "facts" in l,
      ),
    );
    expect(withFacts.map((r) => r.scenario)).toEqual([]);
  });

  it("S1-9 앞 116개 시나리오 JSON(기대 포함)이 v6 파일과 같다: 직렬화 길이 49214, FNV-1a da65aad3(v6 커밋 009ce48에서 잼)", () => {
    const text = JSON.stringify(OLD);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    expect([text.length, h.toString(16)]).toEqual([49214, "da65aad3"]);
  });

  it("S1-9 앞 116개에는 room.packings 칸이 없다(빈 원본), B05는 그대로 NO_BACKORDER", () => {
    expect(
      OLD.filter(
        (s) => s.room.packings !== undefined || s.room.packingFailTimes,
      ).map((s) => s.id),
    ).toEqual([]);
    const b05 = RESULTS.filter((r) => r.scenario === "B05");
    expect(b05.map((r) => r.actual)).toEqual([
      { kind: "HANDOFF", reason: "NO_BACKORDER" },
    ]);
  });

  it("S1-10 K13 기대 JSON = B04 기대 JSON(글자까지), 실제도 같다", () => {
    const expectOf = (id: string) =>
      GOLDEN.scenarios.find((s) => s.id === id)?.steps.map((st) => st.expect);
    expect(expectOf("K13")).toEqual(expectOf("B04"));
    expect(JSON.stringify(expectOf("K13"))).toBe(
      JSON.stringify(expectOf("B04")),
    );
    const actualOf = (id: string) =>
      RESULTS.filter((r) => r.scenario === id).map((r) => r.actual);
    expect(actualOf("K13")).toEqual(actualOf("B04"));
  });

  it("S1-10 v7: facts 칸은 포장 답 줄(AUTO_REPLY BACKORDER target null)에만, 값은 null. 7단계(K01 K02 K03 K04 K09 K14 둘)", () => {
    const v7 = RESULTS.filter((r) => /^K\d\d$/.test(r.scenario));
    expect(v7).toHaveLength(17);
    const lines = v7.flatMap((r) =>
      ((r.actual.lines ?? []) as Record<string, unknown>[]).map((l) => ({
        id: r.scenario,
        l,
      })),
    );
    const withFacts = lines.filter(({ l }) => "facts" in l);
    expect(withFacts.map(({ id }) => id)).toEqual([
      "K01",
      "K02",
      "K03",
      "K04",
      "K09",
      "K14",
      "K14",
    ]);
    for (const { l } of withFacts)
      expect(l).toMatchObject({
        kind: "AUTO_REPLY",
        intent: "BACKORDER",
        target: null,
        facts: null,
      });
    expect(
      v7.filter((r) => JSON.stringify(r.actual) !== JSON.stringify(r.expect)),
    ).toEqual([]);
  });

  it("room.packings 행 → 포장 답 줄에만 facts: null, packingFailTimes 1 → 넘김 하나", () => {
    const room = {
      wholesalerId: 101,
      retailerId: 3,
      context: null,
      autoReply: true,
      packings: [
        {
          packingId: 9201,
          orderId: 7101,
          wholesalerId: 101,
          retailerId: 3,
          orderCancelled: false,
          packingStatus: "READY" as const,
          outboundShipped: null,
          qty: 1,
          note: "유효 READY",
        },
      ],
    };
    const run = (packingFailTimes?: number) =>
      runScenario({
        id: "K-adhoc",
        title: "K-adhoc",
        required: false,
        group: "backorder",
        since: 7,
        room: {
          ...room,
          ...(packingFailTimes === undefined ? {} : { packingFailTimes }),
        },
        steps: [{ text: "미송 언제 와요?", inquiry: null, expect: {} }],
      })[0]?.actual;
    const handoff = {
      kind: "HANDOFF",
      reason: "NO_BACKORDER",
      intent: "BACKORDER",
      sourceSequence: "self",
    };
    expect(run()).toEqual({
      lines: [
        {
          kind: "AUTO_REPLY",
          intent: "BACKORDER",
          target: null,
          body: "출고 준비 중인 주문이 있어요(#7101)",
          facts: null,
        },
        handoff,
      ],
    });
    expect(run(1)).toEqual({ lines: [handoff] });
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

/** 방 1 한 번 판정. 상품 문맥 2001(2분 전)을 줄지 고른다 */
function decideOnce(body: string, withContext = false) {
  return decideInquiry({
    body,
    inquiry: null,
    now: BASE,
    wholesalerId: 101,
    settings: DEFAULT_AUTO_REPLY_SETTINGS,
    context: withContext ? { listingId: 2001, at: BASE - 2 * MINUTE } : null,
    history: [],
    catalog: CATALOG,
    ...ROOM1,
  });
}

const PERIOD_HANDOFF = {
  kind: "HANDOFF",
  reason: "PERIOD",
  intent: "RECEIVABLE",
} as const;

describe("미수 기간 말은 넓게 잡는다(loop-07 codex-meta M1, QA F4)", () => {
  it("달, 주, 날, 해, 지난번, 날짜 모양이 붙은 미수 질문 → 금액 없이 PERIOD 넘김", () => {
    for (const body of [
      "9월 미수 얼마예요?",
      "10 월 외상 얼마예요",
      "시월 미수 얼마예요?",
      "지난주 미수 얼마예요?",
      "이번 주 미수 얼마예요?",
      "저번 주 외상 얼마예요",
      "다음 주까지 갚을 돈 얼마예요?",
      "다음달 잔금 얼마예요",
      "월말 미수 얼마예요?",
      "지난번 미수 얼마예요?",
      "저번에 가져간 거 외상 얼마예요",
      "어제 미수 얼마예요?",
      "오늘 미수 얼마예요?",
      "그저께 외상 얼마예요",
      "엊그제 잔액 얼마예요",
      "9/7 미수 얼마예요?",
      "10.29 외상 얼마예요",
      "9-15 잔금 얼마예요",
      "15일 미수 얼마예요?",
      "2주 동안 외상 얼마예요",
      "3개월 미수 얼마예요?",
      "두 달 밀린 거 얼마예요",
      "상반기 미수 얼마예요?",
      "하반기 외상 얼마예요",
      "올해 미수 얼마예요",
      "작년 외상 얼마예요",
      "1분기 잔액 얼마예요",
      "최근 미수 얼마예요?",
      "월요일 외상 얼마예요",
    ]) {
      expect(decideOnce(body), body).toEqual(PERIOD_HANDOFF);
    }
  });

  it("기간 말 없는 미수 질문은 그대로 금액 답(지금은 기간이 아니다)", () => {
    for (const body of [
      "지금 미수 얼마예요?",
      "미수 얼마예요?",
      "제 외상 얼마 있어요?",
    ]) {
      expect(decideOnce(body), body).toMatchObject({
        kind: "AUTO_REPLY",
        intent: "RECEIVABLE",
      });
    }
  });

  it('상품 문맥이 있는 방의 "이번 달 얼마 남았어요?"는 재고 되묻기가 아니라 PERIOD 넘김(F4)', () => {
    for (const body of [
      "이번 달 얼마 남았어요?",
      "지난주 얼마 남았어요",
      "9월 얼마 남았나요?",
    ]) {
      expect(decideOnce(body, true), body).toEqual(PERIOD_HANDOFF);
    }
  });

  it('기간 말 없는 "이 셔츠 얼마 남았어요?"(R10), "얼마" 없는 "오늘 몇 장 남았어요?"는 재고 되묻기 그대로', () => {
    for (const body of ["이 셔츠 얼마 남았어요?", "오늘 몇 장 남았어요?"]) {
      expect(decideOnce(body, true), body).toMatchObject({
        kind: "CLARIFY",
        intent: "STOCK",
      });
    }
  });

  it("한자어, 축약, 붙여쓰기 기간 말 + 미수 → PERIOD 넘김(Codex C1 전월)", () => {
    for (const word of [
      "전월",
      "당월",
      "금월",
      "익월",
      "전전월",
      "차월",
      "이달",
      "지지난달",
      "다다음달",
      "전년",
      "작년",
      "재작년",
      "금년",
      "올해",
      "내년",
      "명년",
      "당해",
      "전분기",
      "상순",
      "중순",
      "하순",
      "월초",
      "월중",
      "월말",
      "연초",
      "연말",
      "연중",
      "상반기",
      "하반기",
      "금주",
      "차주",
      "전주",
      "이번달",
      "지난달",
      "저번달",
      "금일",
      "당일",
      "전일",
      "익일",
    ]) {
      const body = `${word} 미수 얼마예요?`;
      expect(hasPeriodWord(body), body).toBe(true);
      expect(decideOnce(body), body).toEqual(PERIOD_HANDOFF);
    }
  });

  it("hasPeriodWord 는 원문 날짜 모양을 본다(정규화가 / 를 공백으로 바꾸기 전)", () => {
    expect(hasPeriodWord("9/7 주문분")).toBe(true);
    expect(hasPeriodWord("37,500원")).toBe(false);
    expect(hasPeriodWord("지금 미수 얼마예요?")).toBe(false);
  });
});

const UNKNOWN_WORD_HANDOFF = {
  kind: "HANDOFF",
  reason: "AMOUNT_UNSURE",
  intent: "RECEIVABLE",
} as const;

/** 골든셋에서 미수 금액 답(AUTO_REPLY RECEIVABLE)을 기대하는 단계의 본문 */
const GOLDEN_RECEIVABLE_AUTO_TEXTS = GOLDEN.scenarios.flatMap((s) =>
  s.steps.flatMap((st) =>
    JSON.stringify(st.expect).includes('"intent":"RECEIVABLE"') &&
    JSON.stringify(st.expect).includes('"kind":"AUTO_REPLY"')
      ? [st.text]
      : [],
  ),
);

describe("미수 금액은 정해 둔 문장일 때만(D41, Codex C2 C3)", () => {
  it("C2 반례 8개: 목록에 없는 기간 말이 붙은 미수 질문 → 금액 없이 넘김", () => {
    for (const period of [
      "보름 동안",
      "열흘간",
      "일주일 전",
      "이틀 전",
      "3일 전",
      "석 달",
      "두어 주",
      "요 며칠",
    ]) {
      for (const body of [
        `${period} 미수 얼마예요?`,
        `${period} 외상 얼마 있어요?`,
      ]) {
        expect(isReceivableAmountQuestion(body), body).toBe(false);
        expect(decideOnce(body), body).toMatchObject({
          kind: "HANDOFF",
          intent: "RECEIVABLE",
        });
      }
      // hasPeriodWord 가 못 잡는 것은 문장 검사가 받는다
      const body = `${period} 미수 얼마예요?`;
      if (!hasPeriodWord(body))
        expect(decideOnce(body), body).toEqual(UNKNOWN_WORD_HANDOFF);
    }
  });

  it("C3 반례: 허용 조각으로 만든 다른 뜻(방향 반대, 기한), 누가 누구에게인지 모호한 문장 → 넘김", () => {
    for (const body of [
      "사장님이 저희에게 갚을 돈은 얼마예요?",
      "미수 얼마만에 갚아야 되나요?",
      "사장님 미수 얼마예요",
    ]) {
      expect(isReceivableAmountQuestion(body), body).toBe(false);
      expect(decideOnce(body), body).toEqual(UNKNOWN_WORD_HANDOFF);
    }
  });

  it("숫자가 붙은 금액 확인, 붙여 쓴 기간 말(이주)도 넘긴다", () => {
    for (const body of [
      "미수 37,500원 맞아요?",
      "외상 2만원 맞죠",
      "이주 미수 얼마예요",
    ]) {
      expect(decideOnce(body), body).toEqual(UNKNOWN_WORD_HANDOFF);
    }
  });

  it("허용 문장은 전부 금액 답. 띄어쓰기, 문장부호 차이는 같은 문장이다", () => {
    for (const sentence of RECEIVABLE_AMOUNT_QUESTIONS) {
      for (const body of [
        sentence,
        sentence.replace(/[?,]/g, ""),
        `${sentence.replace(/\s/g, "")}!!`,
      ]) {
        expect(isReceivableAmountQuestion(body), body).toBe(true);
        expect(decideOnce(body), body).toMatchObject({
          kind: "AUTO_REPLY",
          intent: "RECEIVABLE",
        });
      }
    }
  });

  it('"외상 얼마 남았어요?"는 문장 검사 전에 재고 낱말 "남았"과 겹쳐 의도 둘이다(R11과 같다)', () => {
    expect(decideOnce("외상 얼마 남았어요?")).toEqual({
      kind: "HANDOFF",
      reason: "MULTI_INTENT",
      intent: null,
    });
  });

  it("C4: '잔액'이 든 문장은 선수금 잔액으로도 읽혀 금액 없이 넘긴다. 장면 문장은 그대로 금액", () => {
    for (const body of [
      "잔액 얼마예요",
      "잔액 얼마예요?",
      "제 잔액 얼마예요?",
    ]) {
      expect(isReceivableAmountQuestion(body), body).toBe(false);
      expect(decideOnce(body), body).toEqual(UNKNOWN_WORD_HANDOFF);
    }
    expect(
      RECEIVABLE_AMOUNT_QUESTIONS.filter((s) => s.includes("잔액")),
    ).toEqual([]);
    expect(decideOnce("지금 미수 얼마예요?")).toMatchObject({
      kind: "AUTO_REPLY",
      intent: "RECEIVABLE",
    });
  });

  it("골든셋 미수 금액 답 9단계 본문은 전부 허용 문장이다", () => {
    expect(GOLDEN_RECEIVABLE_AUTO_TEXTS).toHaveLength(9);
    for (const text of GOLDEN_RECEIVABLE_AUTO_TEXTS)
      expect(isReceivableAmountQuestion(text), text).toBe(true);
  });

  it("재고 문장은 이 검사를 타지 않는다", () => {
    expect(decideOnce("이 셔츠 몇 장 남았어요?", true)).toMatchObject({
      kind: "CLARIFY",
      intent: "STOCK",
    });
    expect(decideOnce("레드 M 몇 장 남았어요?", true)).toMatchObject({
      kind: "AUTO_REPLY",
      intent: "STOCK",
    });
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

describe("08c S3 골든 v5 넘김 낱말 — 시나리오별 이유", () => {
  /** 시나리오 단계들의 넘김 줄 (이유, 의도). 줄 투영이 아니면(G01) 빈 배열 */
  const handoffs = (id: string) =>
    RESULTS.filter((r) => r.scenario === id).map((r) => {
      const lines = (r.actual.lines ?? []) as {
        reason?: string;
        intent?: string | null;
      }[];
      return lines.map((l) => [l.reason, l.intent]);
    });
  const ids = (p: string, from: number, to: number) =>
    Array.from(
      { length: to - from + 1 },
      (_, i) => `${p}${String(from + i).padStart(2, "0")}`,
    );

  it("S3-1 N01~N12 → 넘김 줄 하나, NEGOTIATION, intent null, 기대값과 정확 일치", () => {
    for (const id of ids("N", 1, 12)) {
      expect(handoffs(id), id).toEqual([[["NEGOTIATION", null]]]);
      for (const r of RESULTS.filter((x) => x.scenario === id))
        expect(r.actual, id).toEqual(r.expect);
    }
  });

  it("S3-2 U01~U06 → 넘김 줄 하나, HUMAN_REQUEST, intent null", () => {
    for (const id of ids("U", 1, 6))
      expect(handoffs(id), id).toEqual([[["HUMAN_REQUEST", null]]]);
  });

  it("S3-3 U07 → HUMAN_REQUEST(협상 낱말 가격이 같이 있어도), U08 → OFF, U09 → NEGOTIATION 줄 뒤 HUMAN_REQUEST 새 줄", () => {
    expect(handoffs("U07")).toEqual([[["HUMAN_REQUEST", null]]]);
    expect(handoffs("U08")).toEqual([[["OFF", null]]]);
    expect(handoffs("U09")).toEqual([
      [["NEGOTIATION", null]],
      [["HUMAN_REQUEST", null]],
    ]);
  });

  it("S3-4 G01 = B01 판정, X01 NO_INTENT, X02 PAYMENT_REPORT(RECEIVABLE), X03 NEGOTIATION", () => {
    const only = (id: string) => RESULTS.find((r) => r.scenario === id);
    expect(only("G01")?.actual).toEqual(only("B01")?.actual);
    expect(only("G01")?.actual).toEqual(only("G01")?.expect);
    expect(handoffs("X01")).toEqual([[["NO_INTENT", null]]]);
    expect(handoffs("X02")).toEqual([[["PAYMENT_REPORT", "RECEIVABLE"]]]);
    expect(handoffs("X03")).toEqual([[["NEGOTIATION", null]]]);
  });
});

describe("08c S3 넘김 낱말 — 사람 요청, 협상 17개 + DC", () => {
  const handoffOf = (reason: string, intent: string | null = null) => ({
    kind: "HANDOFF",
    reason,
    intent,
  });

  it('S3-4 DC 경계: "ADC 셔츠 재고 있어요?", "DC100 재고" → 협상 아님, "DC 돼요" "dc 되나요" → 협상', () => {
    // 시드에 그 상품이 없어 다른 이유로 넘기긴 한다. 협상으로 넘기지 않는 것만 본다
    const reasonOf = (body: string) => {
      const d = decideOnce(body);
      return d.kind === "HANDOFF" ? d.reason : d.kind;
    };
    expect(reasonOf("ADC 셔츠 재고 있어요?")).not.toBe("NEGOTIATION");
    expect(reasonOf("DC100 재고")).not.toBe("NEGOTIATION");
    expect(decideOnce("DC 돼요")).toEqual(handoffOf("NEGOTIATION"));
    expect(decideOnce("dc 되나요")).toEqual(handoffOf("NEGOTIATION"));
  });

  it("S3-3 같은 사람 요청이 두 번 오면 둘째 줄 0(열린 넘김과 이유가 같다)", () => {
    const self = (reason: string) => ({
      lines: [
        { kind: "HANDOFF", reason, intent: null, sourceSequence: "self" },
      ],
    });
    const results = runScenario({
      id: "U-twice",
      title: "U-twice",
      required: false,
      group: "handoff",
      since: 4,
      room: { wholesalerId: 101, context: null, autoReply: true },
      steps: [
        {
          text: "사장님이랑 통화하고 싶어요",
          inquiry: null,
          expect: self("HUMAN_REQUEST"),
        },
        { text: "전화 주세요", inquiry: null, expect: { lines: [] } },
      ],
    });
    expect(results.map((r) => r.actual)).toEqual([
      self("HUMAN_REQUEST"),
      { lines: [] },
    ]);
  });

  it('S3-4 "사장님, 제 미수 얼마예요?", "외상 얼마예요?"는 금액 답 그대로(호칭만으로 안 넘긴다)', () => {
    for (const body of ["사장님, 제 미수 얼마예요?", "외상 얼마예요?"])
      expect(decideOnce(body).kind, body).toBe("AUTO_REPLY");
  });
});

describe("08c 리뷰 R3 R4 R5 — 사람 요청은 요청형만, 보조 낱말 허용, 외상 활용형", () => {
  const reasonOf = (body: string) => {
    const d = decideOnce(body);
    return d.kind === "HANDOFF" ? d.reason : d.kind;
  };

  it('R3 도매처 102 상품 2004 문맥 "보통 화이트 M 재고 있어요?" → 재고 자동 답(공백 지운 "보통화이트"의 "통화"는 사람 요청 아님)', () => {
    const d = decideInquiry({
      body: "보통 화이트 M 재고 있어요?",
      inquiry: null,
      now: BASE,
      wholesalerId: 102,
      settings: DEFAULT_AUTO_REPLY_SETTINGS,
      context: { listingId: 2004, at: BASE - 2 * MINUTE },
      history: [],
      catalog: CATALOG,
      ...ROOM1,
    });
    expect(d.kind).toBe("AUTO_REPLY");
    expect(d.kind === "AUTO_REPLY" ? d.intent : null).toBe("STOCK");
  });

  it('R3 "직원분이 입금했어요" → PAYMENT_REPORT(직원분은 호칭일 뿐), "보상 담당자 있나요"의 "상담"도 아님', () => {
    expect(decideOnce("직원분이 입금했어요")).toEqual({
      kind: "HANDOFF",
      reason: "PAYMENT_REPORT",
      intent: "RECEIVABLE",
    });
    expect(reasonOf("보상 담당자 있나요")).not.toBe("HUMAN_REQUEST");
  });

  it('R4 "전화 좀 주세요. 레드 M 재고 있어요?" 같은 보조 낱말(좀, 한번) → 재고보다 먼저 HUMAN_REQUEST', () => {
    for (const body of [
      "전화 좀 주세요. 레드 M 재고 있어요?",
      "전화 한번 주세요",
      "전화 한 번 부탁드려요",
      "직원분 좀 바꿔 주세요",
    ])
      expect(reasonOf(body), body).toBe("HUMAN_REQUEST");
  });

  it('M3 "직원분 부탁드려요. 레드 M 재고 있어요?" 같은 부탁, 불러 달라는 꼴 → 재고보다 먼저 HUMAN_REQUEST', () => {
    for (const body of [
      "직원분 부탁드려요. 레드 M 재고 있어요?",
      "직원분 부탁해요",
      "직원 부탁합니다",
      "직원분 좀 불러 주세요",
      "사장님 바꿔 주세요",
    ])
      expect(reasonOf(body), body).toBe("HUMAN_REQUEST");
  });

  it('M3 "직원분이 입금했어요", "직원분이 주문했어요"는 사람 요청 아님', () => {
    expect(reasonOf("직원분이 입금했어요")).toBe("PAYMENT_REPORT");
    expect(reasonOf("직원분이 주문했어요")).not.toBe("HUMAN_REQUEST");
  });

  it("R3 R4 사람 요청 요청형은 그대로(U01~U06 문장)", () => {
    for (const body of [
      "사장님이랑 통화하고 싶어요",
      "사장님과 이야기하고 싶어요",
      "직원분 바꿔 주세요",
      "상담 가능할까요?",
      "통화 가능해요?",
      "전화 주세요",
    ])
      expect(reasonOf(body), body).toBe("HUMAN_REQUEST");
  });

  it('R5 "외상 되나요?", "외상 될까요?", "외상 해 주세요", "외상 할 수 있어요?" → NEGOTIATION', () => {
    for (const body of [
      "외상 되나요?",
      "외상 될까요?",
      "외상 해 주세요",
      "외상 할 수 있어요?",
    ])
      expect(reasonOf(body), body).toBe("NEGOTIATION");
  });

  it("R5 D41 금액 문장은 협상으로 안 빠진다", () => {
    for (const body of RECEIVABLE_AMOUNT_QUESTIONS)
      expect(reasonOf(body), body).not.toBe("NEGOTIATION");
  });
});

/* --- loop-08f S1-1, S1-7 전부 꺼짐 때 의도 분류 ----------------------------- */

const OFF_SETTINGS = { ...DEFAULT_AUTO_REPLY_SETTINGS, enabled: false };

/** 방 1(도매처 101, 소매처 1) 한 번 판정. 설정과 원본 콜백을 골라 넣는다 */
function decideRoom1(
  body: string,
  opts: {
    settings?: typeof DEFAULT_AUTO_REPLY_SETTINGS;
    context?: boolean;
    inquiry?: GoldenInquiry | null;
    catalog?: typeof CATALOG;
    receivables?: InquiryReceivableSource;
    backorders?: typeof BACKORDERS;
    packings?: InquiryPackingSource;
  } = {},
) {
  return decideInquiry({
    body,
    inquiry: fullInquiry(opts.inquiry ?? null),
    now: BASE,
    wholesalerId: 101,
    settings: opts.settings ?? OFF_SETTINGS,
    context:
      opts.context === true ? { listingId: 2001, at: BASE - 2 * MINUTE } : null,
    history: [],
    catalog: opts.catalog ?? CATALOG,
    ...ROOM1,
    ...(opts.receivables === undefined
      ? {}
      : { receivables: opts.receivables }),
    ...(opts.backorders === undefined ? {} : { backorders: opts.backorders }),
    ...(opts.packings === undefined ? {} : { packings: opts.packings }),
  });
}

describe("loop-08f S1-1 전부 꺼짐: 이유 OFF, intent는 켜졌다면 나갔을 판정의 intent", () => {
  /** 시나리오 단계들의 넘김 줄 (이유, 의도) */
  const offLines = (id: string) =>
    RESULTS.filter((r) => r.scenario === id).map((r) =>
      (
        (r.actual.lines ?? []) as { reason?: string; intent?: string | null }[]
      ).map((l) => [l.reason, l.intent]),
    );

  it("O01~O07 → 줄 하나, OFF, intent STOCK BACKORDER RECEIVABLE null STOCK RECEIVABLE null", () => {
    const want: [string, string | null][] = [
      ["O01", "STOCK"],
      ["O02", "BACKORDER"],
      ["O03", "RECEIVABLE"],
      ["O04", null],
      ["O05", "STOCK"],
      ["O06", "RECEIVABLE"],
      ["O07", null],
    ];
    for (const [id, intent] of want) {
      expect(offLines(id), id).toEqual([[["OFF", intent]]]);
      for (const r of RESULTS.filter((x) => x.scenario === id))
        expect(r.actual, id).toEqual(r.expect);
    }
  });

  it("O01~O07 본문을 켜짐으로 판정한 intent = 꺼짐 줄의 intent(재판정 규칙 그대로)", () => {
    for (const s of GOLDEN.scenarios.filter((x) => x.since === 6)) {
      const step = s.steps[0];
      if (step === undefined) throw new Error(s.id);
      const opts = {
        context: s.room.context !== null,
        inquiry: step.inquiry ?? null,
      };
      const on = decideRoom1(step.text, {
        ...opts,
        settings: DEFAULT_AUTO_REPLY_SETTINGS,
      });
      expect(decideRoom1(step.text, opts), s.id).toEqual({
        kind: "HANDOFF",
        reason: "OFF",
        intent: on.intent,
      });
    }
  });

  it("의도별 꺼짐 + 전체 꺼짐(BACKORDER만 꺼짐, '미송 언제 와요?') → OFF intent BACKORDER", () => {
    expect(
      decideRoom1("미송 언제 와요?", {
        settings: {
          enabled: false,
          intents: { STOCK: true, BACKORDER: false, RECEIVABLE: true },
        },
      }),
    ).toEqual({ kind: "HANDOFF", reason: "OFF", intent: "BACKORDER" });
  });

  it("의도별 꺼짐만(R15) 그대로, U08 intent null, H15 기대값(v1 투영) 그대로", () => {
    const only = (id: string) => RESULTS.filter((r) => r.scenario === id);
    for (const id of ["R15", "U08", "H15"])
      for (const r of only(id)) expect(r.actual, id).toEqual(r.expect);
    expect(offLines("R15")).toEqual([[["OFF", "RECEIVABLE"]]]);
    expect(offLines("U08")).toEqual([[["OFF", null]]]);
    expect(only("H15").map((r) => r.actual)).toEqual([
      { kind: "HANDOFF", reason: "OFF" },
    ]);
  });
});

describe("loop-08f S1-7 꺼짐 재판정의 원본 조회", () => {
  const boom = () => {
    throw new Error("원본 조회 실패");
  };

  it("① catalog가 던짐 + 전체 꺼짐 + 문맥 있는 재고 질문 → OFF intent null, 예외 밖으로 0", () => {
    expect(() =>
      decideRoom1("레드 M 몇 장 있어요?", { context: true, catalog: boom }),
    ).not.toThrow();
    expect(
      decideRoom1("레드 M 몇 장 있어요?", { context: true, catalog: boom }),
    ).toEqual({ kind: "HANDOFF", reason: "OFF", intent: null });
  });

  it("② receivables가 던짐 + 미수 질문 → OFF intent RECEIVABLE(미수 가지가 LOOKUP_FAILED로 잡는다)", () => {
    expect(decideRoom1("지금 미수 얼마예요?", { receivables: boom })).toEqual({
      kind: "HANDOFF",
      reason: "OFF",
      intent: "RECEIVABLE",
    });
  });

  it("③ 켜짐 판정은 그대로: catalog 예외는 지금처럼 던지고, 미수 예외는 LOOKUP_FAILED", () => {
    const on = { settings: DEFAULT_AUTO_REPLY_SETTINGS };
    expect(() =>
      decideRoom1("레드 M 몇 장 있어요?", {
        ...on,
        context: true,
        catalog: boom,
      }),
    ).toThrow("원본 조회 실패");
    expect(
      decideRoom1("지금 미수 얼마예요?", { ...on, receivables: boom }),
    ).toEqual({
      kind: "HANDOFF",
      reason: "LOOKUP_FAILED",
      intent: "RECEIVABLE",
    });
  });

  it("④ 콜백 호출 수: 꺼짐 판정 1회 = 켜짐 판정 1회(catalog, 미송, 미수, 포장 각각). 08i S1-6 포장 칸 추가", () => {
    /** 포장 READY 한 건(방 1 소매처 1). 미송 0이면 포장 단계까지 간다 */
    const ready: InquiryPacking = {
      packingId: 9201,
      orderId: 7101,
      wholesalerId: 101,
      retailerId: 1,
      orderCancelled: false,
      packingStatus: "READY",
      outboundShipped: null,
      qty: 1,
    };
    const counted = (noBackorders: boolean) => {
      const n = { catalog: 0, backorders: 0, receivables: 0, packings: 0 };
      return {
        n,
        catalog: (id: number) => {
          n.catalog += 1;
          return CATALOG(id);
        },
        backorders: () => {
          n.backorders += 1;
          return noBackorders ? [] : BACKORDERS();
        },
        receivables: () => {
          n.receivables += 1;
          return RECEIVABLE_ROWS;
        },
        packings: () => {
          n.packings += 1;
          return [ready];
        },
      };
    };
    for (const [body, context, noBackorders] of [
      ["레드 M 몇 장 있어요?", true, false],
      ["미송 언제 와요?", false, false],
      ["지금 미수 얼마예요?", false, false],
      ["레드 L 재고랑 미송 같이 알려 주세요", true, false],
      // 08i: 미송 0 + 대상 없음 → 포장 원본 1회(꺼짐도 켜짐도)
      ["미송 언제 와요?", false, true],
    ] as const) {
      const label = `${body}${noBackorders ? " (미송 0)" : ""}`;
      const off = counted(noBackorders);
      const on = counted(noBackorders);
      decideRoom1(body, { context, ...off });
      decideRoom1(body, {
        context,
        ...on,
        settings: DEFAULT_AUTO_REPLY_SETTINGS,
      });
      expect(off.n, label).toEqual(on.n);
      expect(
        off.n.catalog + off.n.backorders + off.n.receivables,
        label,
      ).toBeGreaterThan(0);
      expect(off.n.packings, label).toBe(noBackorders ? 1 : 0);
    }
  });
});
