import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  goldenScore,
  kindsOf,
  runScenario,
  type GoldenExpect,
  type StepResult,
} from "./golden.testkit";

/**
 * 골든 점수 unit(loop-08b S2). 기대값은 전부 **손으로 센 숫자**다 — 실제 결과에서 다시 계산해 기대값을 만들면
 * 판정이 틀려도 같이 틀려서 통과한다(앞 회차 test 거짓 통과 6건).
 */

/** 기대 = 실제가 같은 재고 자동 답 하나. 한 칸만 바꾼 사례(S2-6)의 바탕이다 */
const STOCK_AUTO: GoldenExpect = {
  kind: "AUTO_REPLY",
  intent: "STOCK",
  target: 3002,
  band: "UNDER_50",
  orderable: true,
  orderLimit: 500,
  qtyNote: false,
};
const HANDOFF: GoldenExpect = { kind: "HANDOFF", reason: "NEGOTIATION" };
const CLARIFY: GoldenExpect = {
  kind: "CLARIFY",
  intent: "STOCK",
  choices: [2001, 2002],
};
const SET = { version: 99, scenarios: [{}, {}] };

/** 남긴 줄(`sent`)을 따로 안 주면 투영의 kind 그대로 — 판정대로 줄이 나간 경우 */
const step = (
  expect: GoldenExpect,
  actual: GoldenExpect,
  sender: StepResult["sender"] = "RETAILER",
  sent: readonly string[] = sender === "WHOLESALER"
    ? []
    : kindsOf(actual).filter((k): k is string => typeof k === "string"),
): StepResult => ({
  scenario: "T",
  required: false,
  sender,
  expect,
  actual,
  sent,
});

describe("S2-1 손으로 만든 결과 6개", () => {
  it("steps 6, retailSteps 5, exact 4, autoSent 2, autoWrong 1, autoExpected 2, autoRight 1, handoffExpected 2, handoffSafe 1, clarifyExpected 1, clarifyRight 1, rates.autoWrong 0.5", () => {
    const results = [
      step(STOCK_AUTO, STOCK_AUTO), // 기대 자동 답, 같은 답
      step(STOCK_AUTO, HANDOFF), // 기대 자동 답, 넘김
      step(HANDOFF, STOCK_AUTO), // 기대 넘김, 자동 답
      step(HANDOFF, HANDOFF), // 기대 넘김, 넘김
      step(CLARIFY, CLARIFY), // 같은 되묻기
      step({ openHandoff: true }, { openHandoff: true }, "WHOLESALER"), // 사장 글
    ];
    expect(goldenScore(results, SET)).toEqual({
      version: 99,
      scenarios: 2,
      steps: 6,
      retailSteps: 5,
      exact: 4,
      autoSent: 2,
      autoWrong: 1,
      autoExpected: 2,
      autoRight: 1,
      handoffExpected: 2,
      handoffSafe: 1,
      clarifyExpected: 1,
      clarifyRight: 1,
      noneExpected: 0,
      noneRight: 0,
      rates: {
        exact: 4 / 6,
        autoWrong: 0.5,
        autoRight: 0.5,
        handoffSafe: 0.5,
        clarifyRight: 1,
      },
    });
  });

  it("사장 글은 기대값이 자동 답 모양이어도 분모에 안 들어간다(라벨은 sender로 정한다)", () => {
    const s = goldenScore([step(STOCK_AUTO, HANDOFF, "WHOLESALER")], SET);
    expect([s.retailSteps, s.autoSent, s.autoExpected, s.exact]).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("S2-2 분모 0", () => {
  it("결과 0개 → rates 전부 null", () => {
    expect(goldenScore([], SET).rates).toEqual({
      exact: null,
      autoWrong: null,
      autoRight: null,
      handoffSafe: null,
      clarifyRight: null,
    });
  });

  it("넘김만 3개 → autoSent 0, rates.autoWrong null, rates.handoffSafe 1", () => {
    const s = goldenScore(
      [step(HANDOFF, HANDOFF), step(HANDOFF, HANDOFF), step(HANDOFF, HANDOFF)],
      SET,
    );
    expect(s.autoSent).toBe(0);
    expect(s.rates.autoWrong).toBeNull();
    expect(s.rates.handoffSafe).toBe(1);
  });

  it("넘김 기대에 답+넘김을 냈으면 안전한 넘김이 아니다(자동 답이 나갔다)", () => {
    const s = goldenScore(
      [
        step(HANDOFF, {
          ...STOCK_AUTO,
          kind: undefined,
          kinds: ["AUTO_REPLY", "HANDOFF"],
        }),
      ],
      SET,
    );
    expect([s.handoffSafe, s.autoSent, s.autoWrong]).toEqual([0, 1, 1]);
  });
});

describe("S2-6 한 칸만 틀린 자동 답", () => {
  const ANSWER_AND_HANDOFF: GoldenExpect = {
    kinds: ["AUTO_REPLY", "HANDOFF"],
    intent: "STOCK",
    target: 3002,
    band: "NONE",
    orderable: false,
    orderLimit: 0,
    qtyNote: false,
  };
  const cases: [string, GoldenExpect, GoldenExpect][] = [
    ["intent만 BACKORDER", STOCK_AUTO, { ...STOCK_AUTO, intent: "BACKORDER" }],
    ["orderLimit만 null", STOCK_AUTO, { ...STOCK_AUTO, orderLimit: null }],
    ["qtyNote만 true", STOCK_AUTO, { ...STOCK_AUTO, qtyNote: true }],
    [
      "답+넘김인데 넘김 줄이 빠짐",
      ANSWER_AND_HANDOFF,
      { ...ANSWER_AND_HANDOFF, kinds: undefined, kind: "AUTO_REPLY" },
    ],
  ];
  for (const [name, expected, actual] of cases) {
    it(`${name} → autoWrong 1, autoRight 0`, () => {
      const s = goldenScore([step(expected, actual)], SET);
      expect([s.autoSent, s.autoWrong, s.autoExpected, s.autoRight]).toEqual([
        1, 1, 1, 0,
      ]);
    });
  }

  it("키 순서만 다르면 같은 답이다", () => {
    const reordered = Object.fromEntries(Object.entries(STOCK_AUTO).reverse());
    expect(goldenScore([step(STOCK_AUTO, reordered)], SET).autoRight).toBe(1);
  });

  it("sender 없는 결과는 타입 오류다", () => {
    const noSender = {
      scenario: "T",
      required: false,
      expect: STOCK_AUTO,
      actual: STOCK_AUTO,
    };
    // @ts-expect-error sender 가 없는 결과는 사장 글과 소매 단계를 가를 수 없어 받지 않는다
    expect(() => goldenScore([noSender], SET)).toThrow();
  });
});

describe("M5 발송 지표는 남긴 줄에서, 판정 정확도는 투영에서", () => {
  it("판정은 맞았는데 줄이 안 나갔다 → autoRight 1(판정), autoSent 0(발송)", () => {
    const s = goldenScore([step(STOCK_AUTO, STOCK_AUTO, "RETAILER", [])], SET);
    expect([s.exact, s.autoRight, s.autoSent, s.autoWrong]).toEqual([
      1, 1, 0, 0,
    ]);
  });

  it("넘김 판정인데 넘김 줄이 안 남았다 → handoffSafe 0", () => {
    const s = goldenScore([step(HANDOFF, HANDOFF, "RETAILER", [])], SET);
    expect([s.handoffExpected, s.handoffSafe]).toEqual([1, 0]);
  });

  it("넘김 판정인데 자동 답 줄이 남았다 → autoSent 1, autoWrong 1, handoffSafe 0", () => {
    const s = goldenScore(
      [step(HANDOFF, HANDOFF, "RETAILER", ["AUTO_REPLY", "HANDOFF"])],
      SET,
    );
    expect([s.autoSent, s.autoWrong, s.handoffSafe]).toEqual([1, 1, 0]);
  });

  it("골든셋 전 소매 단계: 투영이 자동 답이면 남긴 줄에도 자동 답, 넘김이면 넘김 줄(v3 판정 투영 포함)", () => {
    const results = GOLDEN.scenarios
      .flatMap((s) => runScenario(s))
      .filter((r) => r.sender === "RETAILER");
    const mismatch = results.filter(
      (r) =>
        kindsOf(r.actual).includes("AUTO_REPLY") !==
          r.sent.includes("AUTO_REPLY") ||
        kindsOf(r.actual).includes("HANDOFF") !== r.sent.includes("HANDOFF"),
    );
    expect(mismatch.map((r) => r.scenario)).toEqual([]);
    expect(results).toHaveLength(116);
  });
});

describe("S2-3, S2-4 골든셋 점수", () => {
  const score = goldenScore(
    GOLDEN.scenarios.flatMap((s) => runScenario(s)),
    GOLDEN,
  );

  it("v4 = 기획 §5-4 손 계산(116 소매 단계 = 자동 30 + 답+확인 5 + 넘김 51 + 되묻기 29 + 줄 없음 1, 사장 1)", () => {
    expect(score).toEqual({
      version: 4,
      scenarios: 84,
      steps: 117,
      retailSteps: 116,
      exact: 117,
      autoSent: 35,
      autoWrong: 0,
      autoExpected: 35,
      autoRight: 35,
      handoffExpected: 51,
      handoffSafe: 51,
      clarifyExpected: 29,
      clarifyRight: 29,
      noneExpected: 1,
      noneRight: 1,
      rates: {
        exact: 1,
        autoWrong: 0,
        autoRight: 1,
        handoffSafe: 1,
        clarifyRight: 1,
      },
    });
  });

  it("점수 파일 inquiry-golden.score.json 고정, version = 골든셋 version", async () => {
    expect(score.version).toBe(GOLDEN.version);
    // 골든셋이나 판정이 바뀌면 여기서 실패한다. `vitest -u`로 갱신한 diff가 PR에 남는다
    await expect(`${JSON.stringify(score, null, 2)}\n`).toMatchFileSnapshot(
      "../../../openapi/golden/inquiry-golden.score.json",
    );
  });
});
