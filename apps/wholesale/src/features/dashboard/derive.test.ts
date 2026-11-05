import { describe, expect, it } from "vitest";
import {
  autoResolvedRate,
  judgedCount,
  toInquiryView,
  toWeekLine,
  toWeekLineState,
  weekRangeOf,
} from "./derive";
import type { InquiryCounts, InquiryStats } from "./types";

/*
 * 문의 카드의 파생값(loop-08 S2). 기대값은 AC에 적힌 손 계산 숫자다 — 같은 공식을 테스트 안에서 다시 계산하지 않는다.
 */

function intents(
  judged: Record<keyof InquiryCounts["byIntent"], number>,
): InquiryCounts["byIntent"] {
  return {
    STOCK: { judged: judged.STOCK, autoReplied: 0 },
    BACKORDER: { judged: judged.BACKORDER, autoReplied: 0 },
    RECEIVABLE: { judged: judged.RECEIVABLE, autoReplied: 0 },
    OTHER: { judged: judged.OTHER, autoReplied: 0 },
    UNCLASSIFIED: { judged: judged.UNCLASSIFIED, autoReplied: 0 },
  };
}

/** `stats-v1` 시드 10/28 영업일(기획 §5-4 2, S1-2 기대표 1행) */
const STATS_V1_1028: InquiryStats = {
  from: "2026-10-28",
  to: "2026-10-28",
  startAt: "2026-10-28T12:00:00+09:00",
  endAt: "2026-10-29T12:00:00+09:00",
  asOf: "2026-10-29T11:59:30+09:00",
  total: {
    retailMessages: 12,
    autoReplied: 5,
    autoRepliedWithHandoff: 1,
    handedOff: 2,
    clarified: 3,
    noResult: 1,
    byIntent: intents({
      STOCK: 4,
      BACKORDER: 1,
      RECEIVABLE: 1,
      OTHER: 0,
      UNCLASSIFIED: 2,
    }),
  },
  days: [],
};

describe("S2-2 자동으로 끝남 비율", () => {
  it.each([
    [0, 0, "-"],
    [1, 3, "33%"],
    [5, 8, "63%"],
    [3, 3, "100%"],
    /* x.5 경계. 나누기 먼저면 57%, 14%로 내림된다(QA F1) */
    [23, 40, "58%"],
    [29, 200, "15%"],
  ])("%i/%i → %s", (autoReplied, judged, expected) => {
    expect(autoResolvedRate(autoReplied, judged)).toBe(expected);
  });

  it("판정 = 자동 답 + 답+확인 + 넘김. 되묻기, 결과 없음은 안 들어간다", () => {
    expect(judgedCount(STATS_V1_1028.total)).toBe(8);
  });
});

describe("S2-1 카드 글자 (stats-v1, 10/28 영업일, asOf 11:59:30)", () => {
  it("네 줄과 기준 줄이 기획 §4-2 2 글자 그대로", () => {
    expect(toInquiryView(STATS_V1_1028)).toEqual({
      retailMessages: 12,
      outcomeLine: "자동 답 5, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1",
      rateLabel: "63%",
      rateDetail: "(5/판정 8)",
      intentLine: "재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
      basisLine: "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
      businessDay: "2026-10-28",
    });
  });

  it("S2-3 0건 → 비율 -, (0/판정 0)", () => {
    const zero: InquiryStats = {
      ...STATS_V1_1028,
      asOf: "2026-10-29T12:00:00+09:00",
      total: {
        retailMessages: 0,
        autoReplied: 0,
        autoRepliedWithHandoff: 0,
        handedOff: 0,
        clarified: 0,
        noResult: 0,
        byIntent: intents({
          STOCK: 0,
          BACKORDER: 0,
          RECEIVABLE: 0,
          OTHER: 0,
          UNCLASSIFIED: 0,
        }),
      },
    };
    const view = toInquiryView(zero);
    expect(view.rateLabel).toBe("-");
    expect(view.rateDetail).toBe("(0/판정 0)");
    expect(view.basisLine.endsWith("12:00 기준")).toBe(true);
  });
});

/** stats-v1 10/22~10/28(기획 §4-4 5). fixture 첫 메시지가 10/28 11:59라 10/27~10/28 값과 같다 */
const STATS_V1_WEEK: InquiryStats = {
  ...STATS_V1_1028,
  from: "2026-10-22",
  to: "2026-10-28",
  startAt: "2026-10-22T12:00:00+09:00",
  total: {
    retailMessages: 13,
    autoReplied: 6,
    autoRepliedWithHandoff: 1,
    handedOff: 2,
    clarified: 3,
    noResult: 1,
    byIntent: intents({
      STOCK: 4,
      BACKORDER: 1,
      RECEIVABLE: 1,
      OTHER: 0,
      UNCLASSIFIED: 3,
    }),
  },
};

describe("08f S3-1 최근 7일 줄", () => {
  it("toInquiryView가 기준 영업일(businessDay = stats.from)을 남긴다", () => {
    expect(toInquiryView(STATS_V1_1028).businessDay).toBe("2026-10-28");
    expect(
      toInquiryView({ ...STATS_V1_1028, from: "2026-10-29", to: "2026-10-29" })
        .businessDay,
    ).toBe("2026-10-29");
  });

  it.each([
    ["2026-10-28", "2026-10-22"],
    ["2026-10-29", "2026-10-23"],
    /* 달 경계 */
    ["2026-11-03", "2026-10-28"],
    /* 해 경계 */
    ["2027-01-02", "2026-12-27"],
    /* 윤년 아닌 2월 끝 */
    ["2027-03-03", "2027-02-25"],
  ])("weekRangeOf(%s) → from %s, to 그대로", (day, from) => {
    expect(weekRangeOf(day)).toEqual({ from, to: day });
  });

  it("stats-v1 7일 → 기획 §4-4 2 글자 그대로", () => {
    expect(toWeekLine(STATS_V1_WEEK)).toBe(
      "최근 7일(10/22~10/28) 소매 메시지 13건, 자동으로 끝남 67% (6/판정 9)",
    );
  });

  it("달 경계 기간 글자 10/28~11/03", () => {
    expect(
      toWeekLine({ ...STATS_V1_WEEK, from: "2026-10-28", to: "2026-11-03" }),
    ).toMatch(/^최근 7일\(10\/28~11\/03\) /);
  });

  it("판정 0 → 자동으로 끝남 - (0/판정 0)", () => {
    const zero = {
      ...STATS_V1_WEEK.total,
      retailMessages: 4,
      autoReplied: 0,
      autoRepliedWithHandoff: 0,
      handedOff: 0,
      clarified: 3,
      noResult: 1,
    };
    expect(toWeekLine({ ...STATS_V1_WEEK, total: zero })).toBe(
      "최근 7일(10/22~10/28) 소매 메시지 4건, 자동으로 끝남 - (0/판정 0)",
    );
  });

  it("천 단위 쉼표 1,234건, (1,000/판정 1,100)", () => {
    const big = {
      ...STATS_V1_WEEK.total,
      retailMessages: 1234,
      autoReplied: 1000,
      autoRepliedWithHandoff: 50,
      handedOff: 50,
      clarified: 100,
      noResult: 34,
    };
    expect(toWeekLine({ ...STATS_V1_WEEK, total: big })).toBe(
      "최근 7일(10/22~10/28) 소매 메시지 1,234건, 자동으로 끝남 91% (1,000/판정 1,100)",
    );
  });
});

describe("08f S3-1 7일 줄 자리 = 기획 §4-4 4 표 8행", () => {
  const LINE = {
    kind: "line",
    text: "최근 7일(10/22~10/28) 소매 메시지 13건, 자동으로 끝남 67% (6/판정 9)",
  } as const;
  /** 12시를 넘겨 기준 영업일이 10/29가 된 뒤. 키가 바뀌어 새 기간 값이 아직 없다 */
  const NEXT_DAY = "2026-10-29";

  it.each([
    ["1 오늘 최초 실패", null, undefined, false, { kind: "none" }],
    /* 오늘 재조회 실패면 businessDay는 이전 성공 값 그대로, 7일 값도 그대로 */
    ["2 오늘 재조회 실패", "2026-10-28", STATS_V1_WEEK, false, LINE],
    ["3 7일 최초 로딩", "2026-10-28", undefined, false, { kind: "loading" }],
    ["4 7일 같은 범위 재조회 중", "2026-10-28", STATS_V1_WEEK, false, LINE],
    ["5 7일 최초 실패", "2026-10-28", undefined, true, { kind: "failed" }],
    ["6 7일 같은 범위 재조회 실패", "2026-10-28", STATS_V1_WEEK, true, LINE],
    /* 옛 기간 값이 넘어와도 새 날짜 옆에 세우지 않는다 */
    [
      "7 범위 교체 중 로딩",
      NEXT_DAY,
      STATS_V1_WEEK,
      false,
      { kind: "loading" },
    ],
    ["8 범위 교체 중 실패", NEXT_DAY, STATS_V1_WEEK, true, { kind: "failed" }],
  ] as const)("%s", (_row, businessDay, week, failed, expected) => {
    expect(toWeekLineState({ businessDay, week, failed })).toEqual(expected);
  });
});
