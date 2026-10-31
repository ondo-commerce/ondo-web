import golden from "../../../openapi/golden/inquiry-golden.json";
import type { WholesaleSchema } from "../../wholesale";
import {
  addDays,
  daysBetween,
  seoulDate,
  type InquiryBackorder,
  type InquiryBackorderSource,
} from "./backorderCandidates";
import {
  DEFAULT_AUTO_REPLY_SETTINGS,
  QTY_NOTE,
  decideInquiry,
  generatedLines,
  linesToAppend,
  openHandoffOf,
  type GeneratedLine,
  type InquiryCatalog,
  type InquiryDecision,
  type InquiryHistoryItem,
  type InquiryListing,
} from "./inquiry";
import {
  receivableOf,
  type InquiryReceivable,
  type InquiryReceivableSource,
} from "./receivable";

/**
 * 골든셋(`openapi/golden/inquiry-golden.json`)을 읽는 테스트 도구. 판정 unit(`inquiry.test.ts`)과
 * 소매 목 HTTP 테스트(`../retail/chat.test.ts`)가 같이 쓴다. **테스트 밖에서 import 하지 않는다** —
 * 골든셋 글자가 앱 번들에 실리면 안 된다(S7-14).
 */

type ChatMessage = WholesaleSchema<"ChatMessage">;
type Size = WholesaleSchema<"VariantResponse">["size"];

export interface GoldenStockRow {
  listingId: number;
  wholesalerId: number;
  listingTitle: string;
  listingPublished: boolean;
  variantId: number;
  color: string;
  size: string;
  availableQty: number;
  orderLimit: number;
  variantPublished: boolean;
  source: string;
}

/** 미송 표 한 줄. 날짜는 `D±n`(rules.t0 서울 날짜 기준) 또는 null. `qty`(원래 수량)는 비교용이고 판정에는 안 넘긴다 */
export interface GoldenBackorderRow {
  backorderId: number;
  orderId: number;
  wholesalerId: number;
  retailerId: number;
  variantId: number;
  title: string;
  color: string;
  size: string;
  qty: number;
  remainingQty: number;
  orderedAt: string;
  expectedInboundDate: string | null;
  expectedInboundReason: string | null;
  status: "OPEN" | "RESOLVED";
  source: string;
}

export interface GoldenInquiry {
  intent: WholesaleSchema<"ChatIntent">;
  listingId: number | null;
  variantId: number | null;
  backorderId?: number | null;
  notListed?: boolean;
}

/** 판정 투영. 골든셋 `expect`와 같은 모양이다 */
export type GoldenExpect = Record<string, unknown>;

export interface GoldenStep {
  /** 없으면 소매. WHOLESALER 는 사장이 직접 쓴 TEXT(판정 안 함, expect 는 `{openHandoff}`, v4) */
  sender?: "WHOLESALER";
  text: string;
  inquiry: GoldenInquiry | null;
  afterMinutes?: number;
  enter?: { listingId: number | null };
  expect: GoldenExpect;
}

export interface GoldenScenario {
  id: string;
  title: string;
  required: boolean;
  group: "required" | "stock" | "handoff" | "backorder" | "receivable";
  /** 4 이상이면 expect 가 방에 들어간 줄 투영(`{lines}`)이다(loop-07). 없으면 판정 투영(v3까지) */
  since?: number;
  room: {
    wholesalerId: number;
    /** 없으면 1(봄봄상회) */
    retailerId?: number;
    context: { listingId: number; ageMinutes: number } | null;
    autoReply: boolean;
    intents?: WholesaleSchema<"AutoReplyIntentSettings">;
    /** 첫 단계 시각 = rules.t0 + n일 */
    afterDays?: number;
    /** 미수 원본 조회가 이 횟수만큼 던진다(LOOKUP_FAILED, R16) */
    receivableFailTimes?: number;
  };
  steps: GoldenStep[];
}

/** 미수 표 한 줄 = 판정 원본 한 줄 + 출처, 메모. `asOf`는 ISO(오프셋 포함) */
export type GoldenReceivableRow = InquiryReceivable & {
  source: "settlement.ts seed" | "extraReceivables.ts" | "golden only";
  note: string;
};

/** 이상값 한 줄. 숫자 칸에 "NaN" 글자가 오면 NaN(JSON에 NaN이 없다) */
export interface GoldenAnomalyCase {
  anomaly: string;
  rule: string;
  row: {
    balance: number | "NaN";
    unpaid: number | "NaN";
    prepaid: number | "NaN";
    overdue: {
      amount: number | "NaN";
      count: number | "NaN";
      maxDays: number | "NaN";
    };
    exact: boolean;
  };
}

export interface GoldenCase {
  text: string;
  afterClarify?: boolean;
  expect: GoldenExpect;
}

export interface GoldenDoc {
  version: number;
  rules: {
    contextMinutes: number;
    bands: number[];
    t0: string;
    today: string;
    backorderChoiceMax: number;
  };
  normalization: { rule: string; cases: GoldenCase[] }[];
  stock: GoldenStockRow[];
  backorders: GoldenBackorderRow[];
  receivables: GoldenReceivableRow[];
  receivableAnomalies: GoldenAnomalyCase[];
  scenarios: GoldenScenario[];
}

export const GOLDEN = golden as unknown as GoldenDoc;

/** rules.t0(ms)와 그 서울 날짜(D+0) */
export const GOLDEN_T0 = Date.parse(GOLDEN.rules.t0);
export const GOLDEN_D0 = seoulDate(GOLDEN_T0);

/** "D+7" → 날짜. null은 그대로 */
export function resolveRelDate(rel: string | null, base = GOLDEN_D0) {
  if (rel === null) return null;
  const m = /^D([+-]\d+)$/.exec(rel);
  if (m === null) throw new Error(`골든셋 날짜 ${rel}`);
  return addDays(base, Number(m[1]));
}

/** 날짜 → "D+7". null은 그대로 */
export function relDate(date: string | null, base = GOLDEN_D0) {
  if (date === null) return null;
  const n = daysBetween(base, date);
  return `D${n >= 0 ? "+" : ""}${n}`;
}

/** `stock` 표 → 판정이 읽는 상품. 행 순서 = 등록 순서다 */
export function goldenCatalog(rows: readonly GoldenStockRow[]): InquiryCatalog {
  const byListing = new Map<number, InquiryListing>();
  for (const r of rows) {
    const listing = byListing.get(r.listingId) ?? {
      listingId: r.listingId,
      wholesalerId: r.wholesalerId,
      title: r.listingTitle,
      published: r.listingPublished,
      variants: [],
    };
    byListing.set(r.listingId, {
      ...listing,
      variants: [
        ...listing.variants,
        {
          variantId: r.variantId,
          color: r.color,
          size: r.size as Size,
          availableQty: r.availableQty,
          orderLimit: r.orderLimit,
          published: r.variantPublished,
        },
      ],
    });
  }
  return (id) => byListing.get(id) ?? null;
}

/** `backorders` 표 → 판정 후보 원본(거르지 않은 전부). 원래 수량, 상태, 출처 칸은 넘기지 않는다 */
export function goldenBackorderRows(
  rows: readonly GoldenBackorderRow[],
  base = GOLDEN_D0,
): InquiryBackorder[] {
  return rows.map((r) => ({
    backorderId: r.backorderId,
    orderId: r.orderId,
    wholesalerId: r.wholesalerId,
    retailerId: r.retailerId,
    variantId: r.variantId,
    title: r.title,
    color: r.color,
    size: r.size as Size,
    remainingQty: r.remainingQty,
    orderedAt: r.orderedAt,
    expectedInboundDate: resolveRelDate(r.expectedInboundDate, base),
    expectedInboundReason: r.expectedInboundReason,
  }));
}

export function goldenBackorders(
  rows: readonly GoldenBackorderRow[],
): InquiryBackorderSource {
  const list = goldenBackorderRows(rows);
  return () => list;
}

/** `receivables` 표 → 판정 원본(거르지 않은 전부). 출처, 메모 칸은 넘기지 않는다 */
export function goldenReceivableRows(
  rows: readonly GoldenReceivableRow[] = GOLDEN.receivables,
): InquiryReceivable[] {
  return rows.map((r) => ({
    wholesalerId: r.wholesalerId,
    retailerId: r.retailerId,
    balance: r.balance,
    unpaid: r.unpaid,
    prepaid: r.prepaid,
    overdue: { ...r.overdue },
    exact: r.exact,
    asOf: r.asOf,
  }));
}

const num = (n: number | "NaN") => (n === "NaN" ? Number.NaN : n);

/** 이상값 표 한 줄 → 판정 원본. 쌍은 (101, 1), asOf 는 rules.t0 */
export function anomalyRow(c: GoldenAnomalyCase): InquiryReceivable {
  return {
    wholesalerId: 101,
    retailerId: 1,
    balance: num(c.row.balance),
    unpaid: num(c.row.unpaid),
    prepaid: num(c.row.prepaid),
    overdue: {
      amount: num(c.row.overdue.amount),
      count: num(c.row.overdue.count),
      maxDays: num(c.row.overdue.maxDays),
    },
    exact: c.row.exact,
    asOf: GOLDEN.rules.t0,
  };
}

/** v4 줄 투영이 읽는 모양. 판정 unit의 `GeneratedLine`, 도매 HTTP 메시지, 소매 HTTP 메시지(`handoff` 칸 없음)가 다 맞는다 */
interface V4Line {
  kind: string;
  body: string;
  handoff?: {
    reason: string;
    intent: string | null;
    sourceSequence: number;
  } | null;
  autoReply: {
    intent: string;
    checkedAt: string;
    subject: { variantId: number | null; backorderId: number | null };
    choices?: { variantId: number }[] | null;
    facts: {
      receivable: {
        outstandingAmount: number;
        prepaidAmount: number;
        overdue: { count: number; amount: number; maxDaysOverdue: number };
      } | null;
    };
  } | null;
}

/**
 * v4 투영(loop-07): 방에 **들어간** 줄 전부. 넘김 줄 억제가 규칙이라 판정이 아니라 줄을 본다(H21 줄 0).
 * - `self`: 그 단계 소매 메시지 sequence. sourceSequence 가 같으면 "self"(방마다 시드 길이가 달라 번호를 박지 않는다)
 * - `asOf`: 그 방 원본 행의 조회 시각. checkedAt 이 같으면 "asOf", 단계 시각이면 "now"
 * 소매 응답에는 `handoff` 칸이 없다 — 그때 HANDOFF 줄은 `{kind}`뿐이다({@link visibleV4Expect}가 기대를 맞춘다)
 */
export function projectV4Lines(
  lines: readonly V4Line[],
  ctx: { self: number; nowMs: number; asOf: string | null },
): GoldenExpect {
  const at = (iso: string) => {
    const ms = Date.parse(iso);
    if (ctx.asOf !== null && ms === Date.parse(ctx.asOf)) return "asOf";
    return ms === ctx.nowMs ? "now" : iso;
  };
  return {
    lines: lines.map((l) => {
      if (l.kind === "HANDOFF")
        return l.handoff === undefined
          ? { kind: l.kind }
          : {
              kind: l.kind,
              reason: l.handoff?.reason ?? null,
              intent: l.handoff?.intent ?? null,
              sourceSequence:
                l.handoff?.sourceSequence === ctx.self
                  ? "self"
                  : (l.handoff?.sourceSequence ?? null),
            };
      const a = l.autoReply;
      if (l.kind === "CLARIFY")
        return {
          kind: l.kind,
          intent: a?.intent,
          choices: (a?.choices ?? []).map((c) => c.variantId),
        };
      const r = a?.facts.receivable ?? null;
      if (a?.intent === "RECEIVABLE" && r !== null)
        return {
          kind: l.kind,
          intent: a.intent,
          outstanding: r.outstandingAmount,
          prepaid: r.prepaidAmount,
          overdue: {
            count: r.overdue.count,
            amount: r.overdue.amount,
            maxDaysOverdue: r.overdue.maxDaysOverdue,
          },
          body: l.body,
          checkedAt: at(a.checkedAt),
        };
      return {
        kind: l.kind,
        intent: a?.intent,
        target: a?.subject.backorderId ?? a?.subject.variantId ?? null,
        body: l.body,
      };
    }),
  };
}

/** 소매 HTTP 비교용 v4 기대: HANDOFF 줄은 `{kind}`만(이유, 의도, 원인 메시지는 도매 응답에만 있다) */
export function visibleV4Expect(e: GoldenExpect): GoldenExpect {
  if (!Array.isArray(e.lines)) return e;
  return {
    ...e,
    lines: (e.lines as Record<string, unknown>[]).map((l) =>
      l.kind === "HANDOFF" ? { kind: l.kind } : l,
    ),
  };
}

export function fullInquiry(i: GoldenInquiry | null) {
  return i === null
    ? null
    : {
        intent: i.intent,
        listingId: i.listingId,
        variantId: i.variantId,
        backorderId: i.backorderId ?? null,
        label: null,
        ...(i.notListed === undefined ? {} : { notListed: i.notListed }),
      };
}

/** 판정 → 골든셋 투영(재고). 미송은 {@link projectStep}이 줄에서 읽는다 */
export function projectDecision(d: InquiryDecision): GoldenExpect {
  if (d.kind === "HANDOFF") return { kind: "HANDOFF", reason: d.reason };
  if (d.intent === "BACKORDER")
    throw new Error("미송 판정은 projectStep 으로 투영한다");
  if (d.intent === "RECEIVABLE")
    throw new Error("미수 판정은 projectV4Lines 로 투영한다");
  if (d.kind === "CLARIFY")
    return {
      kind: "CLARIFY",
      intent: d.intent,
      choices: d.choices.map((v) => v.variantId),
    };
  const auto = {
    intent: d.intent,
    target: d.variant.variantId,
    band: d.band,
    orderable: d.orderable,
    orderLimit: d.orderLimit,
    qtyNote: d.qtyNote,
  };
  return d.band === "NONE"
    ? { kinds: ["AUTO_REPLY", "HANDOFF"], ...auto }
    : { kind: "AUTO_REPLY", ...auto };
}

/** 줄 모양. 판정 unit의 `GeneratedLine`과 HTTP 응답 메시지가 둘 다 맞는다 */
interface LineLike {
  kind: string;
  body: string;
  autoReply: {
    intent: string;
    checkedAt: string;
    subject: { variantId: number | null; backorderId: number | null };
    choices?:
      | {
          variantId: number;
          label: string;
          kind?: string;
          backorderId?: number | null;
        }[]
      | null;
    facts: {
      backorder: {
        qty: number;
        expectedInboundDate: string | null;
        expectedInboundReason: string | null;
      } | null;
    };
  } | null;
}

/**
 * 미송 줄 → 투영. 입고 상태(state)는 **본문 문장**으로 읽는다 — 날짜 칸만 보면 문장이 틀려도 통과한다.
 * remainingQty는 `facts.backorder.qty`(소매에게 나가는 값)다. 원래 수량을 쓰면 여기서 갈린다(B21).
 */
export function projectBackorderLines(
  lines: readonly LineLike[],
  nowIso: string,
): GoldenExpect {
  const first = lines[0];
  if (first === undefined) return { kind: null };
  const kinds = lines.map((l) => l.kind);
  if (first.kind === "HANDOFF" && kinds.length === 1)
    return { kind: "HANDOFF" };
  const a = first.autoReply;
  if (first.kind === "CLARIFY") {
    const choices = a?.choices ?? [];
    return {
      kind: "CLARIFY",
      intent: a?.intent,
      choices: choices.map((c) => ({
        kind: c.kind ?? "VARIANT",
        backorderId: c.backorderId ?? null,
      })),
      labels: choices.map((c) => c.label),
    };
  }
  const facts = a?.facts.backorder ?? null;
  const state = first.body.includes("지났어요")
    ? "PAST"
    : first.body.includes("정해지지 않았어요")
      ? "NONE"
      : first.body.includes(" 오늘 도매 입고")
        ? "TODAY"
        : "FUTURE";
  const auto = {
    intent: a?.intent,
    target: a?.subject.backorderId,
    remainingQty: facts?.qty,
    eta: { date: relDate(facts?.expectedInboundDate ?? null), state },
    reason: facts?.expectedInboundReason ?? null,
    checkedAt: a?.checkedAt === nowIso ? "now" : a?.checkedAt,
  };
  return kinds.length > 1 ? { kinds, ...auto } : { kind: first.kind, ...auto };
}

/** 판정 unit 한 단계의 투영. 넘김은 reason까지, 미송 답은 생성 줄에서, 재고는 판정에서 읽는다 */
export function projectStep(
  d: InquiryDecision,
  lines: readonly GeneratedLine[],
  now: number,
): GoldenExpect {
  if (d.kind === "HANDOFF") return { kind: "HANDOFF", reason: d.reason };
  if (d.intent === "BACKORDER")
    return projectBackorderLines(lines, new Date(now).toISOString());
  return projectDecision(d);
}

/**
 * HTTP 응답의 `generatedMessages` → 골든셋 투영. HANDOFF의 reason은 API 칸이 아니라서 빼고 비교한다.
 * 소매 응답이면 `facts.stock.orderable`이, 도매면 없다(그때는 orderable을 빼고 본다).
 * 미송 줄이면 {@link projectBackorderLines}(`nowIso` = 그 요청 시각)
 */
export function projectMessages(
  messages: readonly Pick<ChatMessage, "kind" | "body">[],
  nowIso?: string,
): GoldenExpect {
  const kinds = messages.map((m) => m.kind);
  const first = messages[0] as
    | {
        kind: string;
        body: string;
        autoReply: {
          intent: string;
          subject: { variantId: number | null };
          choices?: { variantId: number }[] | null;
          facts: {
            stock: {
              band: string;
              orderLimit: number | null;
              orderable?: boolean;
            } | null;
          };
        } | null;
      }
    | undefined;
  if (first === undefined) return { kind: null };
  if (first.kind === "HANDOFF" && kinds.length === 1)
    return { kind: "HANDOFF" };
  const a = first.autoReply;
  if (a?.intent === "BACKORDER")
    return projectBackorderLines(
      messages as unknown as LineLike[],
      nowIso ?? "",
    );
  if (first.kind === "CLARIFY")
    return {
      kind: "CLARIFY",
      intent: a?.intent,
      choices: (a?.choices ?? []).map((c) => c.variantId),
    };
  const stock = a?.facts.stock;
  const auto = {
    intent: a?.intent,
    target: a?.subject.variantId,
    band: stock?.band,
    ...(stock?.orderable === undefined ? {} : { orderable: stock.orderable }),
    orderLimit: stock?.orderLimit,
    qtyNote: first.body.endsWith(QTY_NOTE),
  };
  return kinds.length > 1 ? { kinds, ...auto } : { kind: first.kind, ...auto };
}

/** HTTP 비교용: 골든셋 기대에서 API로 볼 수 없는 칸(reason)을 뺀다. 미송 답의 reason(사유)은 API 칸이라 남긴다 */
export function visibleExpect(e: GoldenExpect): GoldenExpect {
  const rest = { ...e };
  if (rest.kind === "HANDOFF") delete rest.reason;
  return rest;
}

/**
 * 한 단계의 판정 결과. `sender`를 칸으로 둔다 — 없으면 사장 글을 기대값 모양(`{openHandoff}`)으로만
 * 알아봐야 하고, 그러면 기대값을 잘못 쓴 소매 단계가 점수 분모에서 조용히 빠진다(loop-08b S2-6).
 */
export interface StepResult {
  scenario: string;
  required: boolean;
  sender: "RETAILER" | "WHOLESALER";
  expect: GoldenExpect;
  actual: GoldenExpect;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const DEFAULT_CATALOG = goldenCatalog(GOLDEN.stock);
const DEFAULT_BACKORDERS = goldenBackorders(GOLDEN.backorders);
const DEFAULT_RECEIVABLE_ROWS = goldenReceivableRows();

/**
 * 시나리오 하나를 한 방에서 차례로 돈다. 각 단계의 소매 메시지와 **방에 들어간** 줄(`linesToAppend`)을 history에
 * 쌓는다. v4(since 4)는 그 줄을 투영하고, v3까지는 판정을 투영한다(기대값 모양이 그때 정해졌다).
 * 판정 unit과 골든 점수가 같은 결과를 보도록 여기 둔다(loop-08b S2).
 */
export function runScenario(
  s: GoldenScenario,
  backorders: InquiryBackorderSource = DEFAULT_BACKORDERS,
  rows: readonly InquiryReceivable[] = DEFAULT_RECEIVABLE_ROWS,
  catalog: InquiryCatalog = DEFAULT_CATALOG,
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
  let now = GOLDEN_T0 + (s.room.afterDays ?? 0) * DAY;
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
  return s.steps.map((step): StepResult => {
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
        sender: "WHOLESALER",
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
      catalog,
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
      sender: "RETAILER",
      expect: step.expect,
      actual:
        (s.since ?? 0) >= 4
          ? projectV4Lines(kept, { self: mine, nowMs: now, asOf: rowAsOf })
          : projectStep(decision, lines, now),
    };
  });
}

/** v4 줄 투영 `{lines}`의 kind 들. v3 판정 투영은 kind 하나 또는 kinds */
export const kindsOf = (e: GoldenExpect): unknown[] =>
  Array.isArray(e.lines)
    ? (e.lines as { kind: unknown }[]).map((l) => l.kind)
    : Array.isArray(e.kinds)
      ? e.kinds
      : [e.kind];
export const isAuto = (e: GoldenExpect) => kindsOf(e).includes("AUTO_REPLY");
export const isHandoff = (e: GoldenExpect) => kindsOf(e).includes("HANDOFF");

/**
 * 키 순서와 무관한 JSON. 같은 답 판정이 투영을 만든 코드의 키 순서에 기대지 않게 한다.
 * undefined 칸은 JSON.stringify 처럼 빠진다(기존 정확 일치 단언과 같은 규칙)
 */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : value,
  );
}

/** 같은 답 = 기대 투영 전체 일치. 재고의 intent, orderLimit, qtyNote 와 답+넘김의 kinds 까지 본다 */
export const sameProjection = (a: GoldenExpect, e: GoldenExpect) =>
  canonical(a) === canonical(e);

/** 단계 라벨. 기대값 기준이다 — 실제가 틀려도 분모는 흔들리지 않는다 */
export type GoldenLabel = "AUTO" | "HANDOFF" | "CLARIFY" | "NONE" | "OWNER";

export function goldenLabel(r: StepResult): GoldenLabel {
  if (r.sender === "WHOLESALER") return "OWNER";
  const kinds = kindsOf(r.expect);
  if (kinds.includes("AUTO_REPLY")) return "AUTO";
  if (kinds.includes("CLARIFY")) return "CLARIFY";
  if (kinds.includes("HANDOFF")) return "HANDOFF";
  // v4 `lines: []`(줄 0, H21) 또는 v3 미송 투영 `{kind: null}`
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === null))
    return "NONE";
  throw new Error(
    `골든 점수: ${r.scenario} 기대값 모양을 모른다 ${JSON.stringify(r.expect)}`,
  );
}

export interface GoldenScore {
  version: number;
  scenarios: number;
  steps: number;
  retailSteps: number;
  exact: number;
  autoSent: number;
  autoWrong: number;
  autoExpected: number;
  autoRight: number;
  handoffExpected: number;
  handoffSafe: number;
  clarifyExpected: number;
  clarifyRight: number;
  noneExpected: number;
  noneRight: number;
  /** 반올림하지 않은 비율. 분모 0이면 null(보고서엔 "측정 불가") */
  rates: {
    exact: number | null;
    autoWrong: number | null;
    autoRight: number | null;
    handoffSafe: number | null;
    clarifyRight: number | null;
  };
}

const rate = (n: number, d: number) => (d === 0 ? null : n / d);

/**
 * 골든셋 점수(loop-08b S2). 단계 단위, 라벨은 기대값 기준. 사장 글(sender WHOLESALER)은 steps 와 exact 에만 들어간다.
 * - autoWrong: 자동 답을 냈는데 기대가 자동 답이 아니거나 투영이 다르다(분모 autoSent)
 * - autoRight: 기대가 자동 답이고 투영 전체가 같다(분모 autoExpected)
 * - handoffSafe: 기대가 넘김만이고 실제도 자동 답 없이 넘겼다(분모 handoffExpected)
 * 목 판정 함수(`decideInquiry`) 대상 숫자다. 실사용 지표가 아니다(D1).
 */
export function goldenScore(
  results: readonly StepResult[],
  set: { version: number; scenarios: readonly unknown[] },
): GoldenScore {
  // 타입을 피해 들어온 sender 없는 결과도 막는다. 조용히 분모에서 빠지면 점수가 좋아 보인다
  for (const r of results)
    if (r.sender !== "RETAILER" && r.sender !== "WHOLESALER")
      throw new Error(`골든 점수: ${r.scenario} sender 없음`);
  const retail = results.filter((r) => r.sender === "RETAILER");
  const labelled = retail.map((r) => ({
    r,
    label: goldenLabel(r),
    same: sameProjection(r.actual, r.expect),
  }));
  const count = (pred: (x: (typeof labelled)[number]) => boolean) =>
    labelled.filter(pred).length;
  const exact = results.filter((r) =>
    sameProjection(r.actual, r.expect),
  ).length;
  const autoSent = count((x) => isAuto(x.r.actual));
  const autoWrong = count(
    (x) => isAuto(x.r.actual) && (x.label !== "AUTO" || !x.same),
  );
  const autoExpected = count((x) => x.label === "AUTO");
  const autoRight = count((x) => x.label === "AUTO" && x.same);
  const handoffExpected = count((x) => x.label === "HANDOFF");
  const handoffSafe = count(
    (x) =>
      x.label === "HANDOFF" && isHandoff(x.r.actual) && !isAuto(x.r.actual),
  );
  const clarifyExpected = count((x) => x.label === "CLARIFY");
  const clarifyRight = count((x) => x.label === "CLARIFY" && x.same);
  const noneExpected = count((x) => x.label === "NONE");
  const noneRight = count((x) => x.label === "NONE" && x.same);
  return {
    version: set.version,
    scenarios: set.scenarios.length,
    steps: results.length,
    retailSteps: retail.length,
    exact,
    autoSent,
    autoWrong,
    autoExpected,
    autoRight,
    handoffExpected,
    handoffSafe,
    clarifyExpected,
    clarifyRight,
    noneExpected,
    noneRight,
    rates: {
      exact: rate(exact, results.length),
      autoWrong: rate(autoWrong, autoSent),
      autoRight: rate(autoRight, autoExpected),
      handoffSafe: rate(handoffSafe, handoffExpected),
      clarifyRight: rate(clarifyRight, clarifyExpected),
    },
  };
}
