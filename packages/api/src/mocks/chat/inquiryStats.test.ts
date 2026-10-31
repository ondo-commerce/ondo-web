import { describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { businessDayStart } from "../wholesale/dashboard";
import {
  businessDateOf,
  businessDayStartMs,
  inquiryStats,
  type StatsRoom,
} from "./inquiryStats";
import {
  STATS_FIXTURE_ROOMS,
  STATS_ME_WHOLESALER_ID,
  statsRoomsOf,
} from "./inquiryStats.fixture";

/**
 * 문의 지표 집계 unit(loop-08 S1-2, S1-3). **기대값은 fixture 표(§5-4 2)를 보고 손으로 센 숫자다** — 함수 출력끼리
 * 비교하지 않는다(05b-2 M3~M5 거짓 통과). 숫자 하나가 바뀌면 fixture 표와 AC 를 같이 고쳐야 한다.
 */

type Counts = WholesaleSchema<"InquiryCounts">;
type Stats = WholesaleSchema<"InquiryStats">;

const ME = STATS_ME_WHOLESALER_ID;
const at = (local: string) => Date.parse(`${local.replace(" ", "T")}+09:00`);

/** F1~F16: unit 전용 방 중 F17 방(roomId 4)만 뺀다. F13(방 3)은 S1-2 범위 10/29 에 들어간다 */
const F1_F16 = statsRoomsOf(STATS_FIXTURE_ROOMS.filter((r) => r.roomId !== 4));
const F1_F17 = statsRoomsOf(STATS_FIXTURE_ROOMS);

/** 손으로 적은 칸을 응답 모양으로. 안 적은 의도는 0/0 */
function counts(
  c: Omit<Counts, "byIntent">,
  intents: Partial<Record<keyof Counts["byIntent"], [number, number]>> = {},
): Counts {
  const pair = (key: keyof Counts["byIntent"]) => {
    const [judged, autoReplied] = intents[key] ?? [0, 0];
    return { judged, autoReplied };
  };
  return {
    ...c,
    byIntent: {
      STOCK: pair("STOCK"),
      BACKORDER: pair("BACKORDER"),
      RECEIVABLE: pair("RECEIVABLE"),
      OTHER: pair("OTHER"),
      UNCLASSIFIED: pair("UNCLASSIFIED"),
    },
  };
}

const FIVE = [
  "autoReplied",
  "autoRepliedWithHandoff",
  "handedOff",
  "clarified",
  "noResult",
] as const;

/** 모든 응답에서 지켜야 하는 합 규칙(S1-3). 숫자 비교와 별도로 본다 */
function expectSums(stats: Stats) {
  for (const c of [stats.total, ...stats.days.map((d) => d.counts)]) {
    expect(FIVE.reduce((s, k) => s + c[k], 0)).toBe(c.retailMessages);
    const judged = c.autoReplied + c.autoRepliedWithHandoff + c.handedOff;
    expect(Object.values(c.byIntent).reduce((s, v) => s + v.judged, 0)).toBe(
      judged,
    );
    expect(
      Object.values(c.byIntent).reduce((s, v) => s + v.autoReplied, 0),
    ).toBe(c.autoReplied);
  }
  for (const key of [...FIVE, "retailMessages"] as const)
    expect(stats.days.reduce((s, d) => s + d.counts[key], 0)).toBe(
      stats.total[key],
    );
}

describe("fixture 모양 (손으로 적은 sequence 가 맞는지)", () => {
  it("결과 줄이 가리키는 sequence 는 같은 방의 소매 TEXT 이고, 그 줄보다 앞이다", () => {
    for (const room of statsRoomsOf(STATS_FIXTURE_ROOMS)) {
      for (const m of room.messages) {
        const target =
          m.kind === "HANDOFF"
            ? m.handoff?.sourceSequence
            : m.autoReply?.replyToSequence;
        if (target === undefined) continue;
        const source = room.messages.find((x) => x.sequence === target);
        expect(source?.sender).toBe("RETAILER");
        expect(source?.kind).toBe("TEXT");
        expect(target).toBeLessThan(m.sequence);
      }
    }
  });

  it("영업일 경계는 대시보드 목 businessDayStart 와 같다(11:59 는 전날, 12:00 은 그날)", () => {
    expect(businessDateOf(at("2026-10-29 11:59"))).toBe("2026-10-28");
    expect(businessDateOf(at("2026-10-29 12:00"))).toBe("2026-10-29");
    for (const local of [
      "2026-10-29 11:59:59",
      "2026-10-29 12:00:00",
      "2026-10-29 00:00:00",
      "2026-10-28 23:59:00",
    ]) {
      const ms = at(local);
      expect(businessDayStartMs(businessDateOf(ms))).toBe(
        businessDayStart(new Date(ms)).getTime(),
      );
    }
  });
});

describe("S1-2 fixture F1~F16 손 계산", () => {
  it("10/28 하루: 12, 자동 답 5, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1, STOCK 4/3, BACKORDER 1/1, RECEIVABLE 1/1, OTHER 0/0, UNCLASSIFIED 2/0", () => {
    const stats = inquiryStats(F1_F16, {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
      asOf: at("2026-10-29 11:59:30"),
    });
    expect(stats.total).toEqual(
      counts(
        {
          retailMessages: 12,
          autoReplied: 5,
          autoRepliedWithHandoff: 1,
          handedOff: 2,
          clarified: 3,
          noResult: 1,
        },
        {
          STOCK: [4, 3],
          BACKORDER: [1, 1],
          RECEIVABLE: [1, 1],
          UNCLASSIFIED: [2, 0],
        },
      ),
    );
    expect(stats.days).toHaveLength(1);
    expect(stats.startAt).toBe("2026-10-28T12:00:00+09:00");
    expect(stats.endAt).toBe("2026-10-29T12:00:00+09:00");
    expect(stats.asOf).toBe("2026-10-29T11:59:30+09:00");
    expectSums(stats);
  });

  it("10/27 ~ 10/29: 14, 자동 답 7, days 3개 [1, 12, 1] 오름차순", () => {
    const stats = inquiryStats(F1_F16, {
      wholesalerId: ME,
      from: "2026-10-27",
      to: "2026-10-29",
      asOf: at("2026-10-29 13:00"),
    });
    expect(stats.total.retailMessages).toBe(14);
    expect(stats.total.autoReplied).toBe(7);
    expect(stats.days.map((d) => d.date)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
    expect(stats.days.map((d) => d.counts.retailMessages)).toEqual([1, 12, 1]);
    expectSums(stats);
  });

  it("메시지 0인 날도 days 에 0으로 있다(10/25 ~ 10/26)", () => {
    const stats = inquiryStats(F1_F16, {
      wholesalerId: ME,
      from: "2026-10-25",
      to: "2026-10-26",
      asOf: at("2026-10-29 13:00"),
    });
    expect(stats.days.map((d) => d.counts.retailMessages)).toEqual([0, 0]);
    expect(stats.total).toEqual(
      counts({
        retailMessages: 0,
        autoReplied: 0,
        autoRepliedWithHandoff: 0,
        handedOff: 0,
        clarified: 0,
        noResult: 0,
      }),
    );
  });
});

describe("S1-3 asOf 경계(F17 결과 줄 16:32)", () => {
  // asOf 가 10/28 오후라 그 뒤에 보낸 F12(10/29 11:59)는 아직 없다. 10/28 범위 = F1~F11 + F17
  const at1631 = () =>
    inquiryStats(F1_F17, {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
      asOf: at("2026-10-28 16:31"),
    });
  const at1633 = () =>
    inquiryStats(F1_F17, {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
      asOf: at("2026-10-28 16:33"),
    });

  it("asOf 16:31 → F17 은 결과 없음: 12, 자동 답 4, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 2", () => {
    const stats = at1631();
    expect(stats.total).toEqual(
      counts(
        {
          retailMessages: 12,
          autoReplied: 4,
          autoRepliedWithHandoff: 1,
          handedOff: 2,
          clarified: 3,
          noResult: 2,
        },
        {
          STOCK: [3, 2],
          BACKORDER: [1, 1],
          RECEIVABLE: [1, 1],
          UNCLASSIFIED: [2, 0],
        },
      ),
    );
    expectSums(stats);
  });

  it("asOf 16:33 → F17 이 결과 없음에서 자동 답으로(noResult −1, autoReplied +1, STOCK +1/+1)", () => {
    const stats = at1633();
    expect(stats.total).toEqual(
      counts(
        {
          retailMessages: 12,
          autoReplied: 5,
          autoRepliedWithHandoff: 1,
          handedOff: 2,
          clarified: 3,
          noResult: 1,
        },
        {
          STOCK: [4, 3],
          BACKORDER: [1, 1],
          RECEIVABLE: [1, 1],
          UNCLASSIFIED: [2, 0],
        },
      ),
    );
    expectSums(stats);
  });

  it("asOf 를 결과 줄과 같은 16:32 로 주면 센다(이하 포함)", () => {
    const stats = inquiryStats(F1_F17, {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
      asOf: at("2026-10-28 16:32"),
    });
    expect(stats.total.autoReplied).toBe(5);
    expect(stats.total.noResult).toBe(1);
  });

  it("응답 asOf로 다시 집계하면 같은 숫자다 — 밀리초를 남긴다(메타 리뷰 M3)", () => {
    /* 16:32:00.300에 붙은 자동 답, asOf 16:32:00.500. 초로 자르면 16:32:00.000이라 그 답이 빠진다 */
    const sentAt = (ms: number) => new Date(ms).toISOString();
    const base = at("2026-10-28 16:32");
    const room: StatsRoom = {
      wholesalerId: ME,
      messages: [
        {
          sequence: 1,
          sender: "RETAILER",
          kind: "TEXT",
          sentAt: sentAt(base - 60_000),
          autoReply: null,
          handoff: null,
        },
        {
          sequence: 2,
          sender: "WHOLESALER",
          kind: "AUTO_REPLY",
          sentAt: sentAt(base + 300),
          autoReply: {
            intent: "STOCK",
            replyToSequence: 1,
            generatedBy: "RULE",
            checkedAt: sentAt(base + 300),
            subject: {
              listingId: null,
              variantId: null,
              backorderId: null,
              label: null,
            },
            facts: { stock: null, backorder: null, receivable: null },
          },
          handoff: null,
        },
      ],
    };
    const input = {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
    };
    const first = inquiryStats([room], { ...input, asOf: base + 500 });
    expect(first.asOf).toBe("2026-10-28T16:32:00.500+09:00");
    expect(first.total.autoReplied).toBe(1);
    const again = inquiryStats([room], {
      ...input,
      asOf: Date.parse(first.asOf),
    });
    expect(again).toEqual(first);
  });
});

describe("규칙 하나씩 (손으로 만든 방)", () => {
  const T = "2026-10-28T05:00:00.000Z"; // 10/28 14:00 KST
  const line = (
    sequence: number,
    sender: "RETAILER" | "WHOLESALER" | "SYSTEM",
    kind: "TEXT" | "AUTO_REPLY" | "CLARIFY" | "HANDOFF",
    target: number | null = null,
  ): StatsRoom["messages"][number] => ({
    sequence,
    sender,
    kind,
    sentAt: T,
    autoReply:
      (kind === "AUTO_REPLY" || kind === "CLARIFY") && target !== null
        ? {
            intent: "STOCK",
            replyToSequence: target,
            generatedBy: "RULE",
            checkedAt: T,
            subject: {
              listingId: null,
              variantId: null,
              backorderId: null,
              label: null,
            },
            facts: { stock: null, backorder: null, receivable: null },
          }
        : null,
    handoff:
      kind === "HANDOFF" && target !== null
        ? { reason: "NEGOTIATION", intent: null, sourceSequence: target }
        : null,
  });
  const run = (messages: StatsRoom["messages"]) =>
    inquiryStats([{ wholesalerId: ME, messages }], {
      wholesalerId: ME,
      from: "2026-10-28",
      to: "2026-10-28",
      asOf: Date.parse(T),
    }).total;

  it("CLARIFY 와 HANDOFF 가 같은 출처면 넘김(우선순위 넘김 > 되묻기), intent 는 넘김 줄 것", () => {
    const c = run([
      line(1, "RETAILER", "TEXT"),
      line(2, "WHOLESALER", "CLARIFY", 1),
      line(3, "SYSTEM", "HANDOFF", 1),
    ]);
    expect([c.handedOff, c.clarified, c.byIntent.UNCLASSIFIED.judged]).toEqual([
      1, 0, 1,
    ]);
  });

  it("다른 메시지를 가리키는 줄은 이 메시지 결과가 아니다(출처 sequence 로만 잇는다)", () => {
    const c = run([
      line(1, "RETAILER", "TEXT"),
      line(2, "RETAILER", "TEXT"),
      line(3, "WHOLESALER", "AUTO_REPLY", 2),
    ]);
    expect([c.retailMessages, c.autoReplied, c.noResult]).toEqual([2, 1, 1]);
  });

  it("도매 TEXT, 자동 줄, SYSTEM 줄은 세지 않는다", () => {
    const c = run([
      line(1, "WHOLESALER", "TEXT"),
      line(2, "SYSTEM", "HANDOFF", 1),
      line(3, "WHOLESALER", "AUTO_REPLY", 1),
    ]);
    expect(c.retailMessages).toBe(0);
  });
});
