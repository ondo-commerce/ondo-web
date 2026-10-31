import { describe, expect, it } from "vitest";
import { autoResolvedRate, judgedCount, toInquiryView } from "./derive";
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
