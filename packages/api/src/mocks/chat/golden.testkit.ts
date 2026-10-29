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
  QTY_NOTE,
  type GeneratedLine,
  type InquiryCatalog,
  type InquiryDecision,
  type InquiryListing,
} from "./inquiry";

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
  group: "required" | "stock" | "handoff" | "backorder";
  room: {
    wholesalerId: number;
    /** 없으면 1(봄봄상회) */
    retailerId?: number;
    context: { listingId: number; ageMinutes: number } | null;
    autoReply: boolean;
    intents?: WholesaleSchema<"AutoReplyIntentSettings">;
    /** 첫 단계 시각 = rules.t0 + n일 */
    afterDays?: number;
  };
  steps: GoldenStep[];
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
