import type { WholesaleSchema } from "../../wholesale";
import {
  backorderChoiceLabel,
  candidatesOf,
  etaState,
  koreanDate,
  narrowBackorders,
  type EtaState,
  type InquiryBackorder,
  type InquiryBackorderSource,
} from "./backorderCandidates";

/**
 * 재고, 미송 문의 판정 규칙과 자동 답 문장(loop-05b `01-plan.md` §4-2, §5-4, 미송은 loop-06 §4-2). **목 규칙 = BE 규칙**이다.
 *
 * 순수 함수만 둔다 — msw도, 저장소도, 시계도 모른다. 부르는 쪽이 지금 시각, 방의 지난 메시지,
 * 상품 조회 함수를 넘긴다. 그래서 같은 함수를 세 곳이 쓴다:
 *  1. 소매 목 보내기(`../retail/chat.ts`)  2. 도매 목 `incoming` 주입(`../wholesale/chat.ts`)
 *  3. 골든셋 unit(`inquiry.test.ts`, `openapi/golden/inquiry-golden.json`). BE도 같은 골든셋을 통과해야 한다
 *
 * 지키는 것 하나: **틀린 숫자를 말하느니 사람에게 넘긴다.** 애매하면 전부 HANDOFF다.
 * 소매에게 나가는 글(본문, label, choices)에는 정확 수량을 쓰지 않는다(D31②). 정확 수량은 도매 facts에만.
 */

type ChatIntent = WholesaleSchema<"ChatIntent">;
type ChatInquiry = WholesaleSchema<"ChatInquiry">;
type ChatMessage = WholesaleSchema<"ChatMessage">;
type ChatAutoReply = NonNullable<ChatMessage["autoReply"]>;
type StockBand = WholesaleSchema<"StockBand">;
type Size = WholesaleSchema<"VariantResponse">["size"];
export type AutoReplySettings = WholesaleSchema<"AutoReplySettings">;

/* --- 입력 모양 ------------------------------------------------------------ */

/** 판정이 읽는 옵션 하나. 목은 상품 목 시드에서, 골든셋은 `stock` 표에서 만든다 */
export interface InquiryVariant {
  variantId: number;
  color: string;
  size: Size;
  /** 판매가능 = 재고 − 주문처리중 − 미송. **음수 그대로** 받는다(0으로 접는 건 여기서) */
  availableQty: number;
  /** 1회 주문 한도 원값. 0은 한도 없음 */
  orderLimit: number;
  /** 게시글에 올린 옵션인지(`listing_variant`) */
  published: boolean;
}

export interface InquiryListing {
  listingId: number;
  wholesalerId: number;
  title: string;
  /** 게시 중(ON_SALE)인지. 시즌 종료면 false — 답은 하되 주문 가능이 false 다 */
  published: boolean;
  /** 등록 순서(variantNumber 순). 되묻기 보기 순서가 여기서 나온다 */
  variants: readonly InquiryVariant[];
}

export type InquiryCatalog = (listingId: number) => InquiryListing | null;

/** 판정에 필요한 지난 메시지의 모양. 목의 `ChatMessage`가 그대로 맞는다 */
export interface InquiryHistoryItem {
  sequence: number;
  sender: ChatMessage["sender"];
  kind: ChatMessage["kind"];
  sentAt: string;
  autoReply: Pick<ChatAutoReply, "intent" | "subject" | "choices"> | null;
}

export interface InquiryInput {
  body: string;
  inquiry: ChatInquiry | null;
  /** 판정 시각(ms). 문맥 30분, 되묻기 30분을 이 값으로 잰다 */
  now: number;
  /** 이 방의 도매처 */
  wholesalerId: number;
  settings: AutoReplySettings;
  /** 방의 상품 문맥. `createChatRoom`의 listingId와 그 시각 */
  context: { listingId: number; at: number } | null;
  /** 이번 메시지보다 **앞** 메시지들(sequence 오름차순). 이번 메시지는 넣지 않는다 */
  history: readonly InquiryHistoryItem[];
  catalog: InquiryCatalog;
  /** 이 방의 소매처. 미송 후보를 이 값과 `wholesalerId`로 고른다(화면이 보낸 값이 아니라 방의 값) */
  retailerId: number;
  /** 서울 날짜 `YYYY-MM-DD`. 입고일이 오늘인지, 지났는지를 이 값으로 잰다. `now`에서 만들지 않고 받는다(골든셋, 경계 unit) */
  today: string;
  /** 미송 원본 전체(거르지 않은 것). 고르는 건 판정이 한다 */
  backorders: InquiryBackorderSource;
}

/* --- 규칙 상수 ------------------------------------------------------------ */

/** 상품 문맥, 되묻기가 살아 있는 시간(분). 골든셋 `rules.contextMinutes`와 같아야 한다 */
export const INQUIRY_CONTEXT_MINUTES = 30;
const MINUTE_MS = 60_000;

/** 구간 경계. 골든셋 `rules.bands`와 같아야 한다: 0 이하 NONE / 1~9 / 10~49 / 50 이상 */
export const INQUIRY_BAND_EDGES = [0, 10, 50] as const;

export const DEFAULT_AUTO_REPLY_SETTINGS: AutoReplySettings = {
  enabled: true,
  intents: { STOCK: true, BACKORDER: true, RECEIVABLE: true },
};

/** 협상어. 하나라도 있으면 inquiry가 있어도 넘긴다(판정 1) */
const NEGOTIATION_WORDS = ["깎", "할인", "네고", "교환", "반품", "환불"];

/** 의도 키워드. 공백을 지운 본문에서 찾는다. 재고의 `있어요` 무리는 옵션어가 같이 있을 때만 */
const STOCK_WORDS = ["몇장", "남았", "재고", "수량", "품절"];
const STOCK_WORDS_WITH_OPTION = ["있어요", "있나요", "되나요"];
const BACKORDER_WORDS = ["미송", "언제와", "입고", "언제들어"];
const RECEIVABLE_WORDS = ["미수", "외상", "잔금", "갚을"];
/**
 * 배송어. 미송 의도여도 이 말이 있으면 넘긴다 — 미송 답은 "도매 입고 예정"만 말한다. 출고, 배송, 수령은 다른
 * 업무 단계라 같은 날짜로 답하면 틀린다(Codex 7). "언제받", "아직안왔"도 수령 질문이라 미송 키워드에 안 넣었다
 */
const DELIVERY_WORDS = ["출고", "배송", "택배", "도착", "보내", "받"];

/** 미송 되묻기 보기 상한(D34⑤). 넘치면 오래된 것부터 이만큼 */
export const BACKORDER_CHOICE_MAX = 8;

/** 오타 사전. **목록에 있는 것만** 고친다 — 넓히면 엉뚱한 말이 재고 문의가 된다 */
const TYPO_FIXES: readonly [from: string, to: string][] = [
  ["남앗", "남았"],
  ["잇어요", "있어요"],
  ["몇쟝", "몇 장"],
];

const SIZE_TOKEN = /(?<![A-Z0-9])(2XL|XS|XL|S|M|L|FREE)(?![A-Z0-9])/g;
const SIZE_ORDER: readonly Size[] = ["XS", "S", "M", "L", "XL", "2XL", "FREE"];
const QTY_IN_TEXT = /\d+\s*장/;

/* --- 정규화 --------------------------------------------------------------- */

/**
 * 판정 입력. 정규화 표(§5-4) 6행: 공백 접기, 문장부호와 이모지 제거, 사이즈 대문자, 오타 사전.
 * 색상 별칭("빨강")과 한글 수사("열 장")는 **받지 않는다** — 고르지 못하면 되묻거나 넘긴다.
 */
export function normalizeInquiryText(text: string): string {
  let t = text.normalize("NFKC");
  t = t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "");
  // "레드/M" → "레드 M". 문장부호는 지우지 않고 공백으로 — 붙어 있던 두 낱말이 하나가 되지 않게
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  t = t.toUpperCase();
  for (const [from, to] of TYPO_FIXES) t = t.split(from).join(to);
  return t.replace(/\s+/g, " ").trim();
}

function compact(normalized: string): string {
  return normalized.replace(/\s/g, "");
}

/* --- 구간과 한도 ----------------------------------------------------------- */

export function stockBand(availableQty: number): StockBand {
  const [none, ten, fifty] = INQUIRY_BAND_EDGES;
  if (availableQty <= none) return "NONE";
  if (availableQty < ten) return "UNDER_10";
  if (availableQty < fifty) return "UNDER_50";
  return "FIFTY_PLUS";
}

/** 한도 0 = 없음 = null. 음수는 시드에 없지만 들어오면 없음으로 본다 */
export function orderLimitOf(raw: number): number | null {
  return raw > 0 ? raw : null;
}

export function optionLabel(v: Pick<InquiryVariant, "color" | "size">) {
  return `${v.color} / ${v.size}`;
}

/** 되묻기 보기 순서: 색상(처음 등록된 순서) → 사이즈. 게시된 옵션만 */
export function choiceOrder(listing: InquiryListing): InquiryVariant[] {
  const published = listing.variants.filter((v) => v.published);
  const colors = [...new Set(published.map((v) => v.color))];
  return [...published].sort(
    (a, b) =>
      colors.indexOf(a.color) - colors.indexOf(b.color) ||
      SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size),
  );
}

/* --- 판정 ----------------------------------------------------------------- */

export type HandoffReason =
  /** 판정 0. 자동 답이 꺼졌거나 그 의도가 꺼졌다 */
  | "OFF"
  /** 판정 1. 협상어 */
  | "NEGOTIATION"
  /** 판정 1. 의도 키워드가 둘 이상 */
  | "MULTI_INTENT"
  /** 판정 5. 의도를 못 찾았다 */
  | "NO_INTENT"
  /** 판정 5. 미수(loop-07 전까지), OTHER, 미송 질문에 배송어가 섞임 */
  | "NOT_SUPPORTED"
  /** 판정 6. 상품 문맥이 없거나 30분 지났다 */
  | "NO_CONTEXT"
  /** 판정 7. 게시된 옵션이 0개 */
  | "NO_OPTIONS"
  /** 판정 8. 남의 도매처 상품, 없는 상품, 게시 안 된 옵션 */
  | "INVALID_TARGET"
  /** 판정 3. 되묻기 뒤 또 옵션 불명 — 두 번 묻지 않는다(Q1). 미송도 같다(D34①) */
  | "CLARIFY_AGAIN"
  /** 미송. `다른 주문이에요` 보기(inquiry.notListed) */
  | "NOT_LISTED"
  /** 미송. 이 방 도매처에 이 소매처의 열린 미송이 0개(Q1 ②) */
  | "NO_BACKORDER"
  /** 미송. 본문에 나온 상품명, 색상, 사이즈를 다 만족하는 미송이 0개("블랙 셔츠"인데 셔츠 미송이 화이트뿐) */
  | "NO_MATCH";

export type InquiryDecision =
  | { kind: "HANDOFF"; reason: HandoffReason; intent: ChatIntent | null }
  | {
      kind: "CLARIFY";
      intent: "STOCK";
      listing: InquiryListing;
      choices: InquiryVariant[];
    }
  | {
      kind: "AUTO_REPLY";
      intent: "STOCK";
      listing: InquiryListing;
      variant: InquiryVariant;
      band: StockBand;
      orderable: boolean;
      orderLimit: number | null;
      /** 문장에 "10장" 같은 수량이 있었다 → 답 끝에 "수량은 주문서에서 확인돼요" */
      qtyNote: boolean;
    }
  | {
      kind: "CLARIFY";
      intent: "BACKORDER";
      /** 보기에 싣는 미송(오래된 순, 최대 8). 끝의 NOT_LISTED 보기는 문장 단계가 붙인다 */
      choices: InquiryBackorder[];
      /** 후보가 8개를 넘어 잘랐다 → 되묻기 끝에 "오래된 8개만 보여요" */
      truncated: boolean;
      today: string;
    }
  | {
      kind: "AUTO_REPLY";
      intent: "BACKORDER";
      backorder: InquiryBackorder;
      eta: EtaState;
      today: string;
    };

/** 직전 유효 되묻기: 30분 안, 그 뒤 소매 메시지도 도매 사람 답(TEXT)도 없다 */
interface OpenClarify {
  intent: ChatIntent;
  /** 재고 되묻기의 상품. 미송 되묻기는 null */
  listingId: number | null;
  variantIds: number[];
  /** 미송 되묻기 보기의 backorderId(NOT_LISTED 제외). 재고 되묻기는 빈 배열 — 두 목록을 섞지 않는다(C1) */
  backorderIds: number[];
}

function clarifyOf(m: InquiryHistoryItem): OpenClarify | null {
  if (m.autoReply === null) return null;
  const choices = m.autoReply.choices ?? [];
  if (m.autoReply.intent === "BACKORDER")
    return {
      intent: "BACKORDER",
      listingId: null,
      variantIds: [],
      backorderIds: choices.flatMap((c) =>
        c.kind === "BACKORDER" && c.backorderId != null ? [c.backorderId] : [],
      ),
    };
  const listingId = m.autoReply.subject.listingId;
  if (listingId === null) return null;
  return {
    intent: m.autoReply.intent,
    listingId,
    variantIds: choices.map((c) => c.variantId),
    backorderIds: [],
  };
}

const expired = (m: InquiryHistoryItem, now: number) =>
  now - Date.parse(m.sentAt) > INQUIRY_CONTEXT_MINUTES * MINUTE_MS;

/**
 * 칩 검증용(§4-2 2): 이 방에서 30분 안에 연 **가장 최근** 미송 되묻기의 보기. 그 뒤에 소매가 다른 글을
 * 썼어도 칩은 그 보기에서 고른 것이라 본다(열린 되묻기만 보는 계승과 다르다)
 */
function latestBackorderClarify(
  history: readonly InquiryHistoryItem[],
  now: number,
): number[] | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m === undefined) continue;
    if (m.kind === "CLARIFY" && m.autoReply?.intent === "BACKORDER")
      return expired(m, now) ? null : (clarifyOf(m)?.backorderIds ?? null);
  }
  return null;
}

function openClarify(
  history: readonly InquiryHistoryItem[],
  now: number,
): OpenClarify | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m === undefined) continue;
    if (m.kind === "CLARIFY") {
      if (expired(m, now)) return null;
      return clarifyOf(m);
    }
    // 되묻기보다 뒤에 온 소매 메시지나 사장이 직접 쓴 답이 있으면 그 되묻기는 끝났다
    if (m.sender === "RETAILER") return null;
    if (m.sender === "WHOLESALER" && m.kind === "TEXT") return null;
  }
  return null;
}

/**
 * 본문의 색상 **과** 사이즈가 가리키는 옵션이 **하나**면 그것. 그 밖엔 null.
 *
 * 한쪽만으로 좁히지 않는다(§4-2 2, 7) — "빨강 L"(빨강은 옵션어가 아님)이 "L"로만 읽혀 후보 하나에
 * 맞으면, 소매가 말하지 않은 색의 재고를 답하게 된다. 잘못된 자동 답 0이 목표라 되묻기나 넘김이 낫다.
 * 예외 하나: 보기 전체에서 값이 하나뿐인 칸(전부 FREE인 상품의 사이즈)은 말하지 않아도 읽은 것으로
 * 친다. 고를 게 없는 칸이라 틀릴 수 없다("베이지 몇 장", 골든셋 S13).
 * 게시 옵션이 1개뿐인 상품은 이 함수가 아니라 판정 7의 "게시 옵션 1개면 그것"이 받는다.
 */
function matchVariant(
  normalized: string,
  variants: readonly InquiryVariant[],
): InquiryVariant | null {
  const flat = compact(normalized);
  const allColors = [...new Set(variants.map((v) => v.color))];
  const allSizes = [...new Set(variants.map((v) => v.size))];
  const saidColors = allColors.filter((c) => flat.includes(c));
  const saidSizes = [...normalized.matchAll(SIZE_TOKEN)]
    .map((m) => m[1] as Size)
    .filter((s) => allSizes.includes(s));
  // 둘 다 말하지 않았으면 옵션어가 없는 문장이다 — 값이 하나뿐인 칸으로 채우지 않는다
  if (saidColors.length === 0 && saidSizes.length === 0) return null;
  const colors =
    saidColors.length > 0
      ? saidColors
      : allColors.length === 1
        ? allColors
        : [];
  const sizes =
    saidSizes.length > 0 ? saidSizes : allSizes.length === 1 ? allSizes : [];
  const hits = variants.filter(
    (v) => colors.includes(v.color) && sizes.includes(v.size),
  );
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

function hasOptionWord(
  normalized: string,
  listing: InquiryListing | null,
): boolean {
  if (listing === null) return false;
  const flat = compact(normalized);
  return listing.variants.some(
    (v) =>
      flat.includes(v.color) ||
      [...normalized.matchAll(SIZE_TOKEN)].some((m) => m[1] === v.size),
  );
}

function keywordIntents(
  normalized: string,
  listing: InquiryListing | null,
): Set<Exclude<ChatIntent, "OTHER">> {
  const flat = compact(normalized);
  const found = new Set<Exclude<ChatIntent, "OTHER">>();
  if (
    STOCK_WORDS.some((w) => flat.includes(w)) ||
    (STOCK_WORDS_WITH_OPTION.some((w) => flat.includes(w)) &&
      hasOptionWord(normalized, listing))
  )
    found.add("STOCK");
  if (BACKORDER_WORDS.some((w) => flat.includes(w))) found.add("BACKORDER");
  if (RECEIVABLE_WORDS.some((w) => flat.includes(w))) found.add("RECEIVABLE");
  return found;
}

function intentOn(settings: AutoReplySettings, intent: ChatIntent): boolean {
  if (intent === "OTHER") return false;
  return settings.intents[intent];
}

function handoff(
  reason: HandoffReason,
  intent: ChatIntent | null = null,
): InquiryDecision {
  return { kind: "HANDOFF", reason, intent };
}

/** 판정 8, 9. 대상이 정해진 뒤의 검증과 답 */
function answer(
  listing: InquiryListing,
  variant: InquiryVariant | undefined,
  normalized: string,
): InquiryDecision {
  if (variant === undefined || !variant.published)
    return handoff("INVALID_TARGET", "STOCK");
  return {
    kind: "AUTO_REPLY",
    intent: "STOCK",
    listing,
    variant,
    band: stockBand(variant.availableQty),
    // 수량과 무관하다. 재고 0 주문 허용 여부는 BE 미확인(Q2) — 그래서 NONE이면 화면이 담기를 막고 넘긴다
    orderable: listing.published && variant.published,
    orderLimit: orderLimitOf(variant.orderLimit),
    qtyNote: QTY_IN_TEXT.test(normalized),
  };
}

/** 이 방 도매처의 상품인지까지 본다. 아니면 null(→ INVALID_TARGET) */
function ownListing(input: InquiryInput, listingId: number) {
  const listing = input.catalog(listingId);
  return listing !== null && listing.wholesalerId === input.wholesalerId
    ? listing
    : null;
}

function backorderAnswer(b: InquiryBackorder, today: string): InquiryDecision {
  return {
    kind: "AUTO_REPLY",
    intent: "BACKORDER",
    backorder: b,
    eta: etaState(b.expectedInboundDate, today),
    today,
  };
}

/**
 * 미송 가지(loop-06 §4-2 1~6). 의도가 미송으로 정해지고 미송 설정이 켜진 뒤에 온다. 위에서부터:
 *  a. `다른 주문이에요`(notListed) → NOT_LISTED. 본문은 안 본다
 *  b. 칩(backorderId) → 30분 안 가장 최근 미송 되묻기의 보기 안이고 지금도 후보면 답, 아니면 INVALID_TARGET.
 *     계승도 본문도 안 본다
 *  c. 배송어 → NOT_SUPPORTED
 *  d. 열린 미송 되묻기 계승 → 그 보기 안에서 본문이 확정하면 답, 아니면 CLARIFY_AGAIN(되묻기 1회)
 *  e. 후보 0 → NO_BACKORDER
 *  f. 본문 좁히기: 말했는데 0개 → NO_MATCH, 확정 → 답, 그 밖 → 되묻기(1개여도 칩 1개로 묻는다, Codex 1)
 */
function decideBackorder(
  input: InquiryInput,
  text: string,
  prev: OpenClarify | null,
): InquiryDecision {
  const { inquiry, today } = input;
  if (inquiry?.notListed === true) return handoff("NOT_LISTED", "BACKORDER");
  const all = candidatesOf(
    input.backorders,
    input.wholesalerId,
    input.retailerId,
  );

  if (inquiry?.backorderId != null) {
    const shown = latestBackorderClarify(input.history, input.now);
    const target = shown?.includes(inquiry.backorderId)
      ? all.find((b) => b.backorderId === inquiry.backorderId)
      : undefined;
    return target === undefined
      ? handoff("INVALID_TARGET", "BACKORDER")
      : backorderAnswer(target, today);
  }

  if (DELIVERY_WORDS.some((w) => compact(text).includes(w)))
    return handoff("NOT_SUPPORTED", "BACKORDER");

  if (prev !== null) {
    const pool = all.filter((b) => prev.backorderIds.includes(b.backorderId));
    const { confirmed } = narrowBackorders(text, pool);
    return confirmed === null
      ? handoff("CLARIFY_AGAIN", "BACKORDER")
      : backorderAnswer(confirmed, today);
  }

  if (all.length === 0) return handoff("NO_BACKORDER", "BACKORDER");
  const { said, left, confirmed } = narrowBackorders(text, all);
  if (said && left.length === 0) return handoff("NO_MATCH", "BACKORDER");
  if (confirmed !== null) return backorderAnswer(confirmed, today);
  return {
    kind: "CLARIFY",
    intent: "BACKORDER",
    choices: left.slice(0, BACKORDER_CHOICE_MAX),
    truncated: left.length > BACKORDER_CHOICE_MAX,
    today,
  };
}

/**
 * 판정 순서 0~9(§4-2). 위에서부터 처음 걸린 것으로 정한다.
 *
 * 순서가 규칙이다 — 특히 협상어(1)가 inquiry(4)보다 먼저다. 칩을 눌러도 본문이 협상이면 넘긴다.
 */
export function decideInquiry(input: InquiryInput): InquiryDecision {
  const { settings, inquiry, now } = input;
  const text = normalizeInquiryText(input.body);
  const flat = compact(text);

  // 0. 꺼짐(전체). 의도별 꺼짐은 의도를 안 뒤에 본다
  if (!settings.enabled) return handoff("OFF");

  // 1. 협상어, 의도 둘 이상
  if (NEGOTIATION_WORDS.some((w) => flat.includes(w)))
    return handoff("NEGOTIATION");
  const open = openClarify(input.history, now);
  // 재고 계승(2, 3, 7)은 재고 되묻기만 본다. 미송 되묻기는 아래 미송 가지가 따로 본다
  const prev = open?.intent === "STOCK" ? open : null;
  const freshContext =
    input.context !== null &&
    now - input.context.at <= INQUIRY_CONTEXT_MINUTES * MINUTE_MS
      ? input.context.listingId
      : null;
  const wordListingId =
    inquiry?.listingId ?? prev?.listingId ?? freshContext ?? null;
  const intents = keywordIntents(
    text,
    wordListingId === null ? null : input.catalog(wordListingId),
  );
  if (intents.size >= 2) return handoff("MULTI_INTENT");
  const saidIntent = (i: ChatIntent) => i !== "OTHER" && intents.has(i);
  // 칩 의도와 본문 의도가 다르면 의도 둘로 본다. 칩만 믿으면 미송 질문에 재고 숫자가 나간다(C1)
  if (inquiry !== null && intents.size === 1 && !saidIntent(inquiry.intent))
    return handoff("MULTI_INTENT");

  // 2. 되묻기 계승: 같은 의도, 같은 상품일 때만. 칩이면 variantId가 보기 안, 아니면 본문이 보기 하나
  if (prev !== null && prev.listingId !== null) {
    const listing = ownListing(input, prev.listingId);
    const sameIntent =
      (intents.size === 0 || saidIntent(prev.intent)) &&
      (inquiry === null || inquiry.intent === prev.intent);
    const sameListing =
      inquiry?.listingId == null || inquiry.listingId === prev.listingId;
    if (listing !== null && sameIntent && sameListing) {
      const choices = listing.variants.filter((v) =>
        prev.variantIds.includes(v.variantId),
      );
      // 칩의 variantId가 보기 밖이면 본문으로 다시 고르지 않는다 — 소매가 고른 건 그 옵션이다(→ 7에서 넘김)
      const picked =
        inquiry?.variantId != null
          ? choices.find((v) => v.variantId === inquiry.variantId)
          : (matchVariant(text, choices) ?? undefined);
      if (picked !== undefined) {
        if (!intentOn(settings, prev.intent))
          return handoff("OFF", prev.intent);
        return answer(listing, picked, text);
      }
    }
    // 3. 계승 안 됨 → 끊고 4부터 새로. 끝이 같은 상품 옵션 불명이면 또 묻지 않는다(아래 7)
  }

  // 미송 되묻기 계승(§4-2 3): 이번 의도가 없거나 미송일 때만. 재고 질문이면 끊고 새로 판정한다(B20)
  const backorderPrev =
    open?.intent === "BACKORDER" &&
    (intents.size === 0 || saidIntent("BACKORDER")) &&
    (inquiry === null || inquiry.intent === "BACKORDER")
      ? open
      : null;

  // 4, 5. 의도
  const [keyword] = [...intents];
  const intent: ChatIntent | null =
    backorderPrev !== null ? "BACKORDER" : (inquiry?.intent ?? keyword ?? null);
  if (intent === null) return handoff("NO_INTENT");
  if (!intentOn(settings, intent))
    return handoff(intent === "OTHER" ? "NOT_SUPPORTED" : "OFF", intent);
  if (intent === "BACKORDER")
    return decideBackorder(input, text, backorderPrev);
  if (intent !== "STOCK") return handoff("NOT_SUPPORTED", intent);

  // 6. 상품 문맥: inquiry.listingId > 방 문맥(30분 안)
  const listingId = inquiry?.listingId ?? freshContext;
  if (listingId === null) return handoff("NO_CONTEXT", "STOCK");
  // 8(앞부분). 남의 도매처, 없는 상품은 되묻기 전에 넘긴다 — 남의 옵션을 칩으로 보여 주지 않는다
  const listing = ownListing(input, listingId);
  if (listing === null) return handoff("INVALID_TARGET", "STOCK");

  // 7. 대상: inquiry.variantId > 본문 옵션어 > 게시 옵션 1개 > 0개면 넘김 > 되묻기
  if (inquiry?.variantId != null)
    return answer(
      listing,
      listing.variants.find((v) => v.variantId === inquiry.variantId),
      text,
    );
  const published = choiceOrder(listing);
  const byText = matchVariant(text, published);
  if (byText !== null) return answer(listing, byText, text);
  if (published.length === 1) return answer(listing, published[0], text);
  if (published.length === 0) return handoff("NO_OPTIONS", "STOCK");
  if (prev !== null && prev.listingId === listing.listingId)
    return handoff("CLARIFY_AGAIN", "STOCK");
  return { kind: "CLARIFY", intent: "STOCK", listing, choices: published };
}

/* --- 문장 ----------------------------------------------------------------- */

export const CLARIFY_BODY = "어떤 색상, 사이즈요?";
export const HANDOFF_BODY = "자동 답변이 답하지 못했어요. 직접 답해 주세요";
export const QTY_NOTE = "수량은 주문서에서 확인돼요";

/** "레드 M은", "네이비 S는". 사이즈를 읽는 소리의 받침으로 고른다(에스, 프리는 받침 없음) */
function topicOf(v: InquiryVariant): string {
  const particle =
    v.size === "S" || v.size === "XS" || v.size === "FREE" ? "는" : "은";
  return `${v.color} ${v.size}${particle}`;
}

const BAND_TEXT: Record<Exclude<StockBand, "NONE">, string> = {
  UNDER_10: "1~9장",
  UNDER_50: "10~49장",
  FIFTY_PLUS: "50장 이상",
};

export const BACKORDER_CLARIFY_BODY = "어느 주문이요?";
export const BACKORDER_TRUNCATED_NOTE = "오래된 8개만 보여요";
export const NOT_LISTED_LABEL = "다른 주문이에요";

type StockAuto = Extract<
  InquiryDecision,
  { kind: "AUTO_REPLY"; intent: "STOCK" }
>;
type BackorderAuto = Extract<
  InquiryDecision,
  { kind: "AUTO_REPLY"; intent: "BACKORDER" }
>;

/**
 * 미송 답 본문(§4-2 7). 수량은 그 소매처 자기 미송의 **남은** 수량뿐이다. "도매 입고"를 박아 출고, 도착일로
 * 읽히지 않게 한다. 지난 날짜는 "지연"이라 쓰지 않는다(입고됐는데 날짜를 안 고쳤을 수 있다, Q2).
 * 사유는 예정, 오늘일 때만 붙인다(미정, 지남은 넘김 줄이 따라온다. 디자인 결정 40)
 */
export function backorderReplyBody(d: BackorderAuto): string {
  const b = d.backorder;
  const head = `${b.title} ${b.color} ${b.size} 남은 미송 ${b.remainingQty}장은`;
  const reason =
    b.expectedInboundReason === null || b.expectedInboundReason === ""
      ? ""
      : `(${b.expectedInboundReason})`;
  const date = b.expectedInboundDate;
  if (d.eta === "NONE" || date === null)
    return `${head} 아직 도매 입고일이 정해지지 않았어요`;
  if (d.eta === "PAST")
    return `${head} 등록된 입고 예정일 ${koreanDate(date, d.today)}이 지났어요`;
  const when = d.eta === "TODAY" ? "오늘" : koreanDate(date, d.today);
  return `${head} ${when} 도매 입고 예정이에요${reason}`;
}

/** 자동 답 본문. **구간만** 쓴다 — 이 글이 소매에게 그대로 간다 */
export function stockReplyBody(d: StockAuto): string {
  let body: string;
  if (d.band === "NONE") body = `${topicOf(d.variant)} 지금은 재고가 없어요`;
  else if (!d.orderable)
    body = `${topicOf(d.variant)} ${BAND_TEXT[d.band]} 있어요. 지금은 주문할 수 없어요`;
  else
    body =
      `${topicOf(d.variant)} ${BAND_TEXT[d.band]} 있어요. 지금 주문할 수 있어요` +
      (d.orderLimit === null ? "" : `(한 번에 최대 ${d.orderLimit}장)`);
  return d.qtyNote ? `${body}. ${QTY_NOTE}` : body;
}

/** 저장소에 넣을 줄. id, sequence, roomId는 저장소가 채운다 */
export interface GeneratedLine {
  sender: "WHOLESALER" | "SYSTEM";
  kind: "AUTO_REPLY" | "CLARIFY" | "HANDOFF";
  body: string;
  autoReply: ChatAutoReply | null;
}

/**
 * 판정 → 메시지 줄. 재고 0이면 AUTO_REPLY + HANDOFF 두 줄(Q2). `checkedAt`은 `now`.
 * facts는 **도매 모양**(정확 수량 포함)이다. 소매 응답으로 바꾸는 건 소매 목의 `toRetailFacts`가 한다.
 */
export function generatedLines(
  d: InquiryDecision,
  replyToSequence: number,
  now: number,
): GeneratedLine[] {
  const checkedAt = new Date(now).toISOString();
  const handoffLine: GeneratedLine = {
    sender: "SYSTEM",
    kind: "HANDOFF",
    body: HANDOFF_BODY,
    autoReply: null,
  };
  if (d.kind === "HANDOFF") return [handoffLine];
  if (d.intent === "BACKORDER")
    return backorderLines(d, replyToSequence, checkedAt, handoffLine);
  if (d.kind === "CLARIFY")
    return [
      {
        sender: "WHOLESALER",
        kind: "CLARIFY",
        body: CLARIFY_BODY,
        autoReply: {
          intent: "STOCK",
          replyToSequence,
          generatedBy: "RULE",
          checkedAt,
          subject: {
            listingId: d.listing.listingId,
            variantId: null,
            backorderId: null,
            label: d.listing.title,
          },
          facts: { stock: null, backorder: null, receivable: null },
          choices: d.choices.map((v) => ({
            variantId: v.variantId,
            label: optionLabel(v),
            orderable: d.listing.published && v.published,
          })),
        },
      },
    ];
  const reply: GeneratedLine = {
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: stockReplyBody(d),
    autoReply: {
      intent: "STOCK",
      replyToSequence,
      generatedBy: "RULE",
      checkedAt,
      subject: {
        listingId: d.listing.listingId,
        variantId: d.variant.variantId,
        backorderId: null,
        label: `${d.listing.title} ${optionLabel(d.variant)}`,
      },
      facts: {
        stock: {
          availableQty: Math.max(0, d.variant.availableQty),
          band: d.band,
          orderLimit: d.orderLimit,
        },
        backorder: null,
        receivable: null,
      },
      choices: null,
    },
  };
  return d.band === "NONE" ? [reply, handoffLine] : [reply];
}

/**
 * 미송 줄. 되묻기 보기 끝에 늘 `다른 주문이에요`(kind NOT_LISTED)를 싣는다 — 빠져나갈 보기가 없으면 소매가 아무
 * 칩이나 눌러 틀린 답을 받는다(Q3). 미송, NOT_LISTED 보기의 orderable 은 false 로 둔다(VARIANT만 읽는 칸,
 * 모르면 주문 가능이라 말하지 않는다). NOT_LISTED 의 variantId 는 required 라 0.
 *
 * 입고일 미정, 지남 답은 AUTO_REPLY + HANDOFF 두 줄(Q2). facts.backorder.qty 는 **남은** 수량이다.
 */
function backorderLines(
  d: Exclude<InquiryDecision, { kind: "HANDOFF" }> & { intent: "BACKORDER" },
  replyToSequence: number,
  checkedAt: string,
  handoffLine: GeneratedLine,
): GeneratedLine[] {
  if (d.kind === "CLARIFY")
    return [
      {
        sender: "WHOLESALER",
        kind: "CLARIFY",
        body: d.truncated
          ? `${BACKORDER_CLARIFY_BODY} ${BACKORDER_TRUNCATED_NOTE}`
          : BACKORDER_CLARIFY_BODY,
        autoReply: {
          intent: "BACKORDER",
          replyToSequence,
          generatedBy: "RULE",
          checkedAt,
          subject: {
            listingId: null,
            variantId: null,
            backorderId: null,
            label: null,
          },
          facts: { stock: null, backorder: null, receivable: null },
          choices: [
            ...d.choices.map((b) => ({
              variantId: b.variantId,
              label: backorderChoiceLabel(b, d.today),
              orderable: false,
              kind: "BACKORDER" as const,
              backorderId: b.backorderId,
            })),
            {
              variantId: 0,
              label: NOT_LISTED_LABEL,
              orderable: false,
              kind: "NOT_LISTED" as const,
              backorderId: null,
            },
          ],
        },
      },
    ];
  const b = d.backorder;
  const reply: GeneratedLine = {
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: backorderReplyBody(d),
    autoReply: {
      intent: "BACKORDER",
      replyToSequence,
      generatedBy: "RULE",
      checkedAt,
      subject: {
        listingId: null,
        variantId: b.variantId,
        backorderId: b.backorderId,
        label: `${b.title} ${b.color} / ${b.size}`,
      },
      facts: {
        stock: null,
        backorder: {
          qty: b.remainingQty,
          expectedInboundDate: b.expectedInboundDate,
          expectedInboundReason: b.expectedInboundReason,
        },
        receivable: null,
      },
      choices: null,
    },
  };
  return d.eta === "NONE" || d.eta === "PAST" ? [reply, handoffLine] : [reply];
}

/**
 * 소매 응답의 `orderable`. 저장된 도매 facts에는 이 칸이 없어서 대상을 다시 찾아 계산한다
 * (게시 중 + 게시된 옵션). 찾지 못하면 false — 모르면 주문 가능이라고 말하지 않는다.
 */
export function orderableOf(
  catalog: InquiryCatalog,
  subject: { listingId: number | null; variantId: number | null },
): boolean {
  if (subject.listingId === null || subject.variantId === null) return false;
  const listing = catalog(subject.listingId);
  const variant = listing?.variants.find(
    (v) => v.variantId === subject.variantId,
  );
  return listing !== null && listing !== undefined && variant !== undefined
    ? listing.published && variant.published
    : false;
}
