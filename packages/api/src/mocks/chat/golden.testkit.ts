import golden from "../../../openapi/golden/inquiry-golden.json";
import type { WholesaleSchema } from "../../wholesale";
import {
  QTY_NOTE,
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

export interface GoldenInquiry {
  intent: WholesaleSchema<"ChatIntent">;
  listingId: number | null;
  variantId: number | null;
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
  group: "required" | "stock" | "handoff";
  room: {
    wholesalerId: number;
    context: { listingId: number; ageMinutes: number } | null;
    autoReply: boolean;
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
  rules: { contextMinutes: number; bands: number[] };
  normalization: { rule: string; cases: GoldenCase[] }[];
  stock: GoldenStockRow[];
  scenarios: GoldenScenario[];
}

export const GOLDEN = golden as unknown as GoldenDoc;

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

export function fullInquiry(i: GoldenInquiry | null) {
  return i === null
    ? null
    : {
        intent: i.intent,
        listingId: i.listingId,
        variantId: i.variantId,
        backorderId: null,
        label: null,
      };
}

/** 판정 → 골든셋 투영 */
export function projectDecision(d: InquiryDecision): GoldenExpect {
  if (d.kind === "HANDOFF") return { kind: "HANDOFF", reason: d.reason };
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

/**
 * HTTP 응답의 `generatedMessages` → 골든셋 투영. HANDOFF의 reason은 API 칸이 아니라서 빼고 비교한다.
 * 소매 응답이면 `facts.stock.orderable`이, 도매면 없다(그때는 orderable을 빼고 본다).
 */
export function projectMessages(
  messages: readonly Pick<ChatMessage, "kind" | "body">[],
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

/** HTTP 비교용: 골든셋 기대에서 API로 볼 수 없는 칸(reason)을 뺀다 */
export function visibleExpect(e: GoldenExpect): GoldenExpect {
  const rest = { ...e };
  delete rest.reason;
  return rest;
}
