import type { WholesaleSchema } from "../../wholesale";
import type { StatsMessage, StatsRoom } from "./inquiryStats";

/**
 * 문의 지표 고정 fixture F1~F17(loop-08 §5-4 2). **기대값은 사람이 이 표를 보고 손으로 셌다** — 테스트는 op 응답끼리
 * 비교하지 않고 AC(S1-2, S1-3, S1-5, S2-1)에 적힌 숫자와 비교한다. 집계가 틀리면 숫자가 어긋나 실패한다.
 *
 * 도매 목 `reset {seed: "stats-v1"}`가 `unitOnly: false` 방(F1~F12, F14~F16)을 저장소에 넣는다. F13, F17은 unit 전용이다:
 * F13(10/29 12:00)은 시드에 넣으면 S1-5의 "10/29 11:59:30" 시계보다 뒤라 생길 수 없는 메시지가 되고,
 * F17(결과 줄 16:32)은 asOf 경계 시험용이다.
 *
 * 방 안 순서가 곧 sequence 다(1부터). `replyToSequence`, `sourceSequence`는 그 번호를 손으로 적었다 —
 * `inquiryStats.test.ts`가 "줄 순서 = sequence"와 "가리키는 줄이 소매 TEXT"를 확인한다.
 * BE 는 같은 표로 자기 집계 테스트를 맞춘다(§5-3 2).
 */

type ChatMessage = WholesaleSchema<"ChatMessage">;
type ChatIntent = WholesaleSchema<"ChatIntent">;
type ChatHandoffReason = WholesaleSchema<"ChatHandoffReason">;

/** 도매 목 `room()`이 받는 줄 모양 + 표의 이름표 */
export interface StatsFixtureLine {
  /** 표의 행(F1 …). 결과 줄은 출처 행 + "→" */
  f: string;
  sender: ChatMessage["sender"];
  kind: ChatMessage["kind"];
  body: string;
  sentAt: string;
  inquiry: ChatMessage["inquiry"];
  autoReply: ChatMessage["autoReply"];
  handoff: ChatMessage["handoff"];
}

export interface StatsFixtureRoom {
  roomId: number;
  wholesalerId: number;
  /** 도매 목 소매처 번호(1 = 봄봄상회) */
  retailerId: number;
  /** true 면 `reset {seed: "stats-v1"}`에 안 넣는다 */
  unitOnly: boolean;
  lines: readonly StatsFixtureLine[];
}

export const STATS_SEED_NAME = "stats-v1";
export const STATS_ME_WHOLESALER_ID = 101;
export const STATS_OTHER_WHOLESALER_ID = 102;

/** `2026-10-28 13:00`(KST) → ISO */
function kst(local: string): string {
  return new Date(
    Date.parse(`${local.replace(" ", "T")}:00+09:00`),
  ).toISOString();
}

function retail(
  f: string,
  local: string,
  body: string,
  intent: ChatIntent | null = null,
): StatsFixtureLine {
  return {
    f,
    sender: "RETAILER",
    kind: "TEXT",
    body,
    sentAt: kst(local),
    inquiry:
      intent === null
        ? null
        : {
            intent,
            listingId: null,
            variantId: null,
            backorderId: null,
            label: null,
          },
    autoReply: null,
    handoff: null,
  };
}

function reply(
  f: string,
  kind: "AUTO_REPLY" | "CLARIFY",
  local: string,
  intent: ChatIntent,
  replyToSequence: number,
  body: string,
): StatsFixtureLine {
  const sentAt = kst(local);
  return {
    f,
    sender: "WHOLESALER",
    kind,
    body,
    sentAt,
    inquiry: null,
    autoReply: {
      intent,
      replyToSequence,
      generatedBy: "RULE",
      checkedAt: sentAt,
      subject: {
        listingId: null,
        variantId: null,
        backorderId: null,
        label: null,
      },
      // 집계는 facts 를 안 읽는다. 지어낸 숫자를 싣지 않으려고 비운다
      facts: { stock: null, backorder: null, receivable: null },
    },
    handoff: null,
  };
}

function handoff(
  f: string,
  local: string,
  reason: ChatHandoffReason,
  intent: ChatIntent | null,
  sourceSequence: number,
): StatsFixtureLine {
  return {
    f,
    sender: "SYSTEM",
    kind: "HANDOFF",
    body: "자동 답변이 답하지 못했어요. 직접 답해 주세요",
    sentAt: kst(local),
    inquiry: null,
    autoReply: null,
    handoff: { reason, intent, sourceSequence },
  };
}

/**
 * 표(§5-4 2)를 방으로 옮긴 것. 줄 왼쪽 숫자가 sequence.
 * 방 1 = 도매처 101 x 봄봄상회. F2의 넘김(재고 0)이 열린 채 F3~F6이 온다 — 같은 이유(F4)는 줄이 안 생기고,
 * 다른 이유(F3, F6)는 새 줄, 자동 답(F5)은 열린 넘김과 무관하게 붙는다(07 §4-2 3, D38④)
 */
export const STATS_FIXTURE_ROOMS: readonly StatsFixtureRoom[] = [
  {
    roomId: 1,
    wholesalerId: STATS_ME_WHOLESALER_ID,
    retailerId: 1,
    unitOnly: false,
    lines: [
      /* 1 */ retail(
        "F16",
        "2026-10-28 11:59",
        "플라워 셔츠 몇 장 남았어요?",
        "STOCK",
      ),
      /* 2 */ reply(
        "F16→",
        "AUTO_REPLY",
        "2026-10-28 11:59",
        "STOCK",
        1,
        "10~49장 있어요",
      ),
      /* 3 */ retail(
        "F1",
        "2026-10-28 13:00",
        "코튼 셔츠 화이트 M 있어요?",
        "STOCK",
      ),
      /* 4 */ reply(
        "F1→",
        "AUTO_REPLY",
        "2026-10-28 13:00",
        "STOCK",
        3,
        "10~49장 있어요",
      ),
      /* 5 */ retail("F2", "2026-10-28 13:05", "블랙 L도 있어요?", "STOCK"),
      /* 6 */ reply(
        "F2→",
        "AUTO_REPLY",
        "2026-10-28 13:05",
        "STOCK",
        5,
        "지금은 없어요",
      ),
      /* 7 */ handoff("F2→", "2026-10-28 13:05", "STOCK_ZERO", "STOCK", 5),
      /* 8 */ retail("F3", "2026-10-28 13:10", "조금 깎아 주세요"),
      /* 9 */ handoff("F3→", "2026-10-28 13:10", "NEGOTIATION", null, 8),
      /* 10 */ retail("F4", "2026-10-28 13:20", "만 원만 더 깎아 주세요"),
      /* 11 */ retail(
        "F5",
        "2026-10-28 13:25",
        "제 미수 얼마예요?",
        "RECEIVABLE",
      ),
      /* 12 */ reply(
        "F5→",
        "AUTO_REPLY",
        "2026-10-28 13:25",
        "RECEIVABLE",
        11,
        "지금 갚을 돈은 없어요",
      ),
      /* 13 */ retail(
        "F6",
        "2026-10-28 13:30",
        "재고랑 미송 둘 다 알려 주세요",
      ),
      /* 14 */ handoff("F6→", "2026-10-28 13:30", "MULTI_INTENT", null, 13),
      /* 15 */ retail("F7", "2026-10-28 14:00", "이 셔츠 남았어요?", "STOCK"),
      /* 16 */ reply(
        "F7→",
        "CLARIFY",
        "2026-10-28 14:00",
        "STOCK",
        15,
        "어떤 색상, 사이즈요?",
      ),
      /* 17 */ retail("F8", "2026-10-28 14:01", "레드 / M", "STOCK"),
      /* 18 */ reply(
        "F8→",
        "AUTO_REPLY",
        "2026-10-28 14:01",
        "STOCK",
        17,
        "레드 M은 10~49장 있어요",
      ),
      /* 19 */ retail("F9", "2026-10-28 15:00", "이거 있어요?", "STOCK"),
      /* 20 */ reply(
        "F9→",
        "CLARIFY",
        "2026-10-28 15:00",
        "STOCK",
        19,
        "어떤 색상, 사이즈요?",
      ),
      /* 21 */ retail("F10", "2026-10-28 15:10", "셔츠 있어요?", "STOCK"),
      /* 22 */ reply(
        "F10→",
        "CLARIFY",
        "2026-10-28 15:10",
        "STOCK",
        21,
        "어떤 색상, 사이즈요?",
      ),
      /* 23 */ retail(
        "F11",
        "2026-10-28 15:12",
        "아니 미송 언제 와요?",
        "BACKORDER",
      ),
      /* 24 */ reply(
        "F11→",
        "AUTO_REPLY",
        "2026-10-28 15:12",
        "BACKORDER",
        23,
        "미송 20장은 11월 3일 입고 예정이에요",
      ),
      /* 25 */ {
        f: "F15",
        sender: "WHOLESALER",
        kind: "TEXT",
        body: "네 확인해 볼게요",
        sentAt: kst("2026-10-28 16:00"),
        inquiry: null,
        autoReply: null,
        handoff: null,
      },
      /* 26 */ retail(
        "F12",
        "2026-10-29 11:59",
        "플라워 셔츠 블루 S 있어요?",
        "STOCK",
      ),
      /* 27 */ reply(
        "F12→",
        "AUTO_REPLY",
        "2026-10-29 11:59",
        "STOCK",
        26,
        "10~49장 있어요",
      ),
    ],
  },
  {
    // 남의 도매처(102) 방. 도매처 필터를 빼면 retailMessages, autoReplied, STOCK 이 1씩 는다(변이 3)
    roomId: 2,
    wholesalerId: STATS_OTHER_WHOLESALER_ID,
    retailerId: 1,
    unitOnly: false,
    lines: [
      /* 1 */ retail("F14", "2026-10-28 16:00", "블랙 L 재고 있어요?", "STOCK"),
      /* 2 */ reply(
        "F14→",
        "AUTO_REPLY",
        "2026-10-28 16:00",
        "STOCK",
        1,
        "10~49장 있어요",
      ),
    ],
  },
  {
    // 10/29 영업일 첫 순간(경계 포함). 11:59 의 F12 는 10/28 이다
    roomId: 3,
    wholesalerId: STATS_ME_WHOLESALER_ID,
    retailerId: 2,
    unitOnly: true,
    lines: [
      /* 1 */ retail(
        "F13",
        "2026-10-29 12:00",
        "니트 조끼 몇 장 있어요?",
        "STOCK",
      ),
      /* 2 */ reply(
        "F13→",
        "AUTO_REPLY",
        "2026-10-29 12:00",
        "STOCK",
        1,
        "10~49장 있어요",
      ),
    ],
  },
  {
    // 결과 줄이 2분 늦게 붙는다. asOf 16:31 이면 결과 없음, 16:33 이면 자동 답
    roomId: 4,
    wholesalerId: STATS_ME_WHOLESALER_ID,
    retailerId: 3,
    unitOnly: true,
    lines: [
      /* 1 */ retail("F17", "2026-10-28 16:30", "린넨 팬츠 있어요?", "STOCK"),
      /* 2 */ reply(
        "F17→",
        "AUTO_REPLY",
        "2026-10-28 16:32",
        "STOCK",
        1,
        "10~49장 있어요",
      ),
    ],
  },
];

/** fixture 방 → 집계 입력. sequence 는 줄 순서(1부터) */
export function statsRoomsOf(rooms: readonly StatsFixtureRoom[]): StatsRoom[] {
  return rooms.map((room) => ({
    wholesalerId: room.wholesalerId,
    messages: room.lines.map((line, i): StatsMessage => ({
      sequence: i + 1,
      sender: line.sender,
      kind: line.kind,
      sentAt: line.sentAt,
      autoReply: line.autoReply,
      handoff: line.handoff,
    })),
  }));
}
