import { describe, expect, it } from "vitest";
import { HANDOFF_REASON_TEXT } from "./constants";
import {
  checkedLabel,
  handoffReasonOf,
  handoffReasonText,
  toFactsView,
} from "./derive";
import type { ChatAutoReply, ChatHandoff } from "./types";

/**
 * #302 S3 도매 넘김 이유 줄과 근거 줄 조회 시각(loop-07 01-plan §4-3 4 5, §6 S3-1 S3-5, 디자인 결정 39 42 43).
 * 기대 글은 기획 §4-3 4 표를 그대로 옮겼다 — 상수 표를 다시 읽어 비교하면 표가 틀려도 통과한다.
 */

/** 기획 §4-3 4의 8개 글(원문) */
const PLAN_REASONS: Record<string, string> = {
  NEGOTIATION: "가격, 외상, 교환, 반품 이야기예요",
  MULTI_INTENT: "한 번에 두 가지를 물었어요",
  PAYMENT_REPORT: "입금했다는 말이에요. 정산 탭에서 입금을 확인해 주세요",
  PERIOD: "기간을 정해 물었어요. 기간별 금액은 자동으로 답하지 않아요",
  AMOUNT_UNSURE: "잔액과 연체 내역 확인이 필요해요",
  NO_RELATION: "정산 기록이 없는 소매처예요",
  LOOKUP_FAILED: "정산 조회에 실패했어요",
  OFF: "자동 답변이 꺼져 있어요",
};

/** 계약 enum 20개 중 이번 회차에 글이 없는 12개 */
const NO_TEXT_REASONS = [
  "NO_INTENT",
  "NOT_SUPPORTED",
  "NO_CONTEXT",
  "NO_OPTIONS",
  "INVALID_TARGET",
  "CLARIFY_AGAIN",
  "NO_BACKORDER",
  "NO_MATCH",
  "NOT_LISTED",
  "STOCK_ZERO",
  "ETA_UNKNOWN",
  "ETA_PAST",
];

function handoff(reason: ChatHandoff["reason"]): ChatHandoff {
  return { reason, intent: null, sourceSequence: 3 };
}

describe("S3-1 넘김 이유 줄", () => {
  it("8개 이유 → 기획 §4-3 4 글과 정확히 같다", () => {
    for (const [reason, text] of Object.entries(PLAN_REASONS))
      expect(handoffReasonText(reason), reason).toBe(text);
    // 표에 8개만 있다 — 하나 늘면 기획 표도 같이 고쳐야 한다
    expect(Object.keys(HANDOFF_REASON_TEXT).sort()).toEqual(
      Object.keys(PLAN_REASONS).sort(),
    );
  });

  it("이번 회차 밖 12개, 모르는 값, 빈 글자, null, undefined → 이유 줄 없음(null)", () => {
    for (const reason of NO_TEXT_REASONS)
      expect(handoffReasonText(reason), reason).toBeNull();
    expect(handoffReasonText("SOMETHING_NEW")).toBeNull();
    expect(handoffReasonText("")).toBeNull();
    expect(handoffReasonText(null)).toBeNull();
    expect(handoffReasonText(undefined)).toBeNull();
  });

  it("객체 원형 키(toString, constructor)도 이유가 아니다", () => {
    expect(handoffReasonText("toString")).toBeNull();
    expect(handoffReasonText("constructor")).toBeNull();
    expect(handoffReasonText("__proto__")).toBeNull();
  });

  it("말 하나: HANDOFF + 8개 이유면 글, handoff null이나 칸 없음이면 null, HANDOFF가 아니면 값이 있어도 null", () => {
    expect(
      handoffReasonOf({ kind: "HANDOFF", handoff: handoff("PAYMENT_REPORT") }),
    ).toBe("입금했다는 말이에요. 정산 탭에서 입금을 확인해 주세요");
    expect(
      handoffReasonOf({ kind: "HANDOFF", handoff: handoff("STOCK_ZERO") }),
    ).toBeNull();
    expect(handoffReasonOf({ kind: "HANDOFF", handoff: null })).toBeNull();
    expect(handoffReasonOf({ kind: "HANDOFF" })).toBeNull();
    expect(
      handoffReasonOf({ kind: "TEXT", handoff: handoff("NEGOTIATION") }),
    ).toBeNull();
  });
});

describe("S3-5 근거 줄 조회 시각", () => {
  const T0 = Date.parse("2026-10-29T14:20:00+09:00");

  it("같은 서울 날짜면 HH:mm 조회", () => {
    expect(checkedLabel("2026-10-29T14:20:00+09:00", T0)).toBe("14:20 조회");
    expect(checkedLabel("2026-10-29T00:05:00+09:00", T0)).toBe("00:05 조회");
  });

  it("전날이면 M/D HH:mm 조회(앞 0 없음)", () => {
    expect(
      checkedLabel(
        "2026-10-28T14:20:00+09:00",
        Date.parse("2026-10-29T09:00:00+09:00"),
      ),
    ).toBe("10/28 14:20 조회");
    expect(
      checkedLabel(
        "2026-09-04T09:07:00+09:00",
        Date.parse("2026-10-29T09:00:00+09:00"),
      ),
    ).toBe("9/4 09:07 조회");
  });

  it("서울 자정 경계: 23:59 조회는 그날 23:59엔 시각만, 다음 날 00:00엔 날짜가 붙는다. UTC로 와도 서울 날짜", () => {
    const at = "2026-10-28T14:59:00Z"; // 서울 10/28 23:59
    expect(checkedLabel(at, Date.parse("2026-10-28T23:59:30+09:00"))).toBe(
      "23:59 조회",
    );
    expect(checkedLabel(at, Date.parse("2026-10-29T00:00:00+09:00"))).toBe(
      "10/28 23:59 조회",
    );
  });

  it("근거 칸 끝 줄(toFactsView)이 같은 규칙: 미수 근거 줄 형식은 그대로, 끝 줄만 날짜가 붙는다", () => {
    const autoReply: ChatAutoReply = {
      intent: "RECEIVABLE",
      replyToSequence: 1,
      generatedBy: "RULE",
      checkedAt: "2026-10-29T14:20:00+09:00",
      subject: {
        listingId: null,
        variantId: null,
        backorderId: null,
        label: null,
      },
      facts: {
        stock: null,
        backorder: null,
        receivable: {
          outstandingAmount: 0,
          prepaidAmount: 12_500,
          overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
        },
      },
    };
    const today = toFactsView(autoReply, T0);
    expect(today?.lines.map((l) => l.map((p) => p.text).join(""))).toEqual([
      "미결제 0원, 선수금 12,500원",
      "연체 없음",
    ]);
    expect(today?.seen).toBe("14:20 조회");
    const nextDay = toFactsView(
      autoReply,
      Date.parse("2026-10-30T09:00:00+09:00"),
    );
    expect(nextDay?.lines).toEqual(today?.lines);
    expect(nextDay?.seen).toBe("10/29 14:20 조회");
    // 와이어프레임 17 `#state-rc-latest` 번호(QA F1): 미결제 줄만 S3-3, 끝 줄 S3-5 S3-3(loop-04 S7-13 유지)
    expect(today?.lineAc).toEqual(["S3-3", null]);
    expect(today?.seenAc).toBe("S7-13 S3-5 S3-3");
  });

  it("재고 근거의 앞말도 그대로 두고 시각만 날짜가 붙는다", () => {
    const view = toFactsView(
      {
        intent: "STOCK",
        replyToSequence: 5,
        generatedBy: "RULE",
        checkedAt: "2026-10-28T09:22:00+09:00",
        subject: {
          listingId: 2001,
          variantId: 3002,
          backorderId: null,
          label: null,
        },
        facts: {
          stock: { availableQty: 35, band: "UNDER_50", orderLimit: 500 },
          backorder: null,
          receivable: null,
        },
      },
      T0,
    );
    expect(view?.seen).toBe(
      '소매처에게는 "10~49장"으로 보였어요. 10/28 09:22 조회',
    );
    // 재고 답은 미수 번호(S3-3)가 없다 — `#state-rc-seen-date` 재고 줄 `.seen data-ac="S3-5"`
    expect(view?.lineAc).toEqual([null]);
    expect(view?.seenAc).toBe("S7-13 S3-5");
  });
});
