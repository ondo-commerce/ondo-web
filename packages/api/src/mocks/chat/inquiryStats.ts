import type { WholesaleSchema } from "../../wholesale";
import { addDays, seoulDate } from "./backorderCandidates";

/**
 * 문의 지표 집계(loop-08 §4-1, 초안 op `inquiryStats`). **BE 규칙 원본이다** — BE는 같은 fixture
 * (`./inquiryStats.fixture.ts`)와 같은 기대값으로 자기 테스트를 맞춘다(§5-3 2).
 *
 * 순수 함수. 시각은 전부 인자로 받는다(`asOf`). 목 핸들러가 `Date.now()`를 넣고, 테스트는 손으로 정한 시각을 넣는다.
 *
 * 세는 단위는 "소매 TEXT 메시지 1개 = 결과 1개"다(Q2 ①). 결과는 그 메시지를 출처로 가리키는 줄로 정한다:
 * AUTO_REPLY·CLARIFY 의 `autoReply.replyToSequence`, HANDOFF 의 `handoff.sourceSequence`. 되묻기 묶음을 잇지 않는다 —
 * 되묻기 뒤 칩 답은 칩 답 메시지가 자기 결과로 따로 한 번 세지므로, 한 문의가 두 번 세지지 않는다.
 */

type InquiryStats = WholesaleSchema<"InquiryStats">;
type InquiryCounts = WholesaleSchema<"InquiryCounts">;
type ChatMessage = WholesaleSchema<"ChatMessage">;
type IntentKey = keyof InquiryCounts["byIntent"];

/** 집계가 읽는 칸만. 저장소 메시지(`ChatMessage`)를 그대로 넘겨도 된다 */
export type StatsMessage = Pick<
  ChatMessage,
  "sequence" | "sender" | "kind" | "sentAt" | "autoReply" | "handoff"
>;

/** 방 하나. 도매처 필터에 `wholesalerId`가 필요해서 메시지만이 아니라 방 단위로 받는다 */
export interface StatsRoom {
  wholesalerId: number;
  messages: readonly StatsMessage[];
}

export interface InquiryStatsInput {
  wholesalerId: number;
  /** 첫 영업일 `YYYY-MM-DD` */
  from: string;
  /** 마지막 영업일(포함) */
  to: string;
  /** 집계 시각(ms). 이 뒤에 쓰인 줄은 결과 줄이든 출처 메시지든 없는 것으로 본다 */
  asOf: number;
}

/** 소매 메시지 하나의 결과. 우선순위 자동 답 > 넘김 > 되묻기 > 결과 없음 */
export type InquiryOutcome =
  | "autoReplied"
  | "autoRepliedWithHandoff"
  | "handedOff"
  | "clarified"
  | "noResult";

const HOUR_MS = 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * HOUR_MS;

/** 영업일 D의 시작(ms) = D 12:00 KST. 대시보드 목 `businessDayStart`와 같은 경계다 */
export function businessDayStartMs(date: string): number {
  return Date.parse(`${date}T12:00:00+09:00`);
}

/** 그 시각이 속한 영업일. 낮 12시 전이면 전날이다 */
export function businessDateOf(ms: number): string {
  const calendar = seoulDate(ms);
  return ms >= businessDayStartMs(calendar) ? calendar : addDays(calendar, -1);
}

/** 보고서에 옮겨 적기 좋게 KST 오프셋을 붙인 ISO 8601(`2026-10-28T12:00:00+09:00`) */
export function kstIso(ms: number): string {
  return new Date(ms + KST_OFFSET_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "+09:00");
}

/** from ~ to(포함) 날짜 목록. from > to 면 빈 배열(검사는 핸들러가 한다) */
export function businessDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/**
 * 출처 메시지 하나의 결과와 의도. `lines`는 같은 방의 줄 전부(asOf 거르기 전).
 * 의도: 자동 답(답+확인 포함)이면 AUTO_REPLY 의 intent, 넘김만이면 HANDOFF 의 intent, null 은 UNCLASSIFIED.
 * 되묻기와 결과 없음은 판정 끝남이 아니라 의도가 없다(null)
 */
export function outcomeOf(
  source: StatsMessage,
  lines: readonly StatsMessage[],
  asOf: number,
): { outcome: InquiryOutcome; intent: IntentKey | null } {
  let auto: StatsMessage | undefined;
  let handoff: StatsMessage | undefined;
  let clarify = false;
  for (const line of lines) {
    if (Date.parse(line.sentAt) > asOf) continue;
    if (line.kind === "HANDOFF") {
      if (
        handoff === undefined &&
        line.handoff?.sourceSequence === source.sequence
      )
        handoff = line;
    } else if (line.autoReply?.replyToSequence === source.sequence) {
      if (line.kind === "AUTO_REPLY") auto ??= line;
      else if (line.kind === "CLARIFY") clarify = true;
    }
  }
  if (auto !== undefined)
    return {
      outcome: handoff === undefined ? "autoReplied" : "autoRepliedWithHandoff",
      intent: auto.autoReply?.intent ?? "UNCLASSIFIED",
    };
  if (handoff !== undefined)
    return {
      outcome: "handedOff",
      intent: handoff.handoff?.intent ?? "UNCLASSIFIED",
    };
  return { outcome: clarify ? "clarified" : "noResult", intent: null };
}

export function emptyCounts(): InquiryCounts {
  const zero = () => ({ judged: 0, autoReplied: 0 });
  return {
    retailMessages: 0,
    autoReplied: 0,
    autoRepliedWithHandoff: 0,
    handedOff: 0,
    clarified: 0,
    noResult: 0,
    byIntent: {
      STOCK: zero(),
      BACKORDER: zero(),
      RECEIVABLE: zero(),
      OTHER: zero(),
      UNCLASSIFIED: zero(),
    },
  };
}

function add(
  counts: InquiryCounts,
  { outcome, intent }: ReturnType<typeof outcomeOf>,
) {
  counts.retailMessages += 1;
  counts[outcome] += 1;
  if (intent === null) return;
  counts.byIntent[intent].judged += 1;
  if (outcome === "autoReplied") counts.byIntent[intent].autoReplied += 1;
}

/** 센다: 내 도매처 방의 소매 TEXT. 도매 TEXT, 자동 줄, SYSTEM 줄은 출처가 아니다 */
function isSource(m: StatsMessage): boolean {
  return m.sender === "RETAILER" && m.kind === "TEXT";
}

/**
 * [from 12:00, to 다음날 12:00) KST 구간의 지표. 날은 출처 메시지 `sentAt`으로 정한다(결과 줄 시각이 아니다).
 * `days`는 0인 날까지 전부, 오름차순. 응답 모양 그대로 돌려준다(목 핸들러는 `{data}`로 감싸기만 한다)
 */
export function inquiryStats(
  rooms: readonly StatsRoom[],
  { wholesalerId, from, to, asOf }: InquiryStatsInput,
): InquiryStats {
  const dates = businessDates(from, to);
  const byDate = new Map(dates.map((d) => [d, emptyCounts()]));
  const total = emptyCounts();
  const startAt = businessDayStartMs(from);
  const endAt = businessDayStartMs(addDays(to, 1));

  for (const room of rooms) {
    if (room.wholesalerId !== wholesalerId) continue;
    for (const m of room.messages) {
      if (!isSource(m)) continue;
      const sentMs = Date.parse(m.sentAt);
      // asOf 뒤에 보낸 메시지는 그 시각엔 없었다. 실서버에선 생길 수 없고 fixture 에서만 의미가 있다
      if (sentMs < startAt || sentMs >= endAt || sentMs > asOf) continue;
      const result = outcomeOf(m, room.messages, asOf);
      add(total, result);
      const day = byDate.get(businessDateOf(sentMs));
      if (day !== undefined) add(day, result);
    }
  }

  return {
    from,
    to,
    startAt: kstIso(startAt),
    endAt: kstIso(endAt),
    asOf: kstIso(asOf),
    total,
    days: dates.map((date) => ({
      date,
      counts: byDate.get(date) ?? emptyCounts(),
    })),
  };
}
