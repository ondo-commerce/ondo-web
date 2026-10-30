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
import {
  receivableOf,
  receivableReplyBody,
  toReceivableFacts,
  type InquiryReceivableSource,
} from "./receivable";

/**
 * 재고, 미송, 미수 문의 판정 규칙과 자동 답 문장(loop-05b `01-plan.md` §4-2, §5-4, 미송은 loop-06 §4-2,
 * 미수와 넘김 이유는 loop-07 §4-1, §4-2). **목 규칙 = BE 규칙**이다.
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
type ChatHandoff = WholesaleSchema<"ChatHandoff">;
type ChatHandoffReason = WholesaleSchema<"ChatHandoffReason">;
type ChatReceivableFacts = WholesaleSchema<"ChatReceivableFacts">;
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
  /** 넘김 줄의 이유(loop-07). 열린 넘김과 이유가 같은지 볼 때만 읽는다. 없으면 이유 모름 */
  handoff?: Pick<ChatHandoff, "reason"> | null;
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
  /**
   * 미수 원본 전체(도매처 × 소매처 요약, 거르지 않은 것). 미수 가지에서만 부른다. 던지면 조회 실패로 넘긴다.
   * 이 방 한 줄을 고르는 건 판정이 한다(`receivableOf`) — 화면이 보낸 값은 보지 않는다(loop-07 §4-1 5)
   */
  receivables: InquiryReceivableSource;
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
/**
 * 미수 키워드(loop-07 §4-1 2). "얼마"만으로는 미수가 아니다("이 셔츠 얼마예요?"는 값 문의, R09).
 * "얼마 남았"을 미수로 읽는 예외는 두지 않는다 — "이 셔츠 얼마 남았어요?"가 금액 답이 된다(Codex 7, R10).
 * "미수 얼마나 남았어요?"는 재고 낱말 "남았"과 겹쳐 의도 둘로 넘긴다(R11)
 */
const RECEIVABLE_WORDS = [
  "미수",
  "외상",
  "잔금",
  "갚을",
  "잔액",
  "갚아야",
  "밀린",
];
/**
 * 입금 알림(판정 1-2). 의도 둘보다, 미수보다 먼저 본다 — "입금했는데 미수 얼마예요?"에 입금 등록 전 잔액을
 * 말하면 틀린 금액이다(§4-1 1, H17). 입금 확인은 정산 탭 일이라 사장에게 넘긴다
 */
const PAYMENT_REPORT_WORDS = ["입금했", "송금했", "이체했", "입금완료"];
/**
 * 기간 말. 미수 질문에 붙으면 넘긴다(Q2) — 배정이 주문 단위라 달별로 나눌 규칙이 없고, "지난달 얼마예요"에
 * 전체 금액을 말하면 질문과 다른 답이다.
 *
 * **일부러 넓게 잡는다**(Codex M1). 여섯 낱말만 보던 때 "9월 미수 얼마예요?", "지난주 미수 얼마예요?"에 전체
 * 잔액이 나갔다. 기간이 아닌 말을 기간으로 읽으면 사장에게 넘어갈 뿐이고, 기간을 놓치면 틀린 금액이 나간다.
 * "지금"은 넣지 않는다 — "지금 미수 얼마예요?"는 전체 잔액을 묻는 장면 문장이다(P5, R04).
 * 공백을 지운 본문(`flat`)에서 찾는다
 */
const PERIOD_WORDS = [
  // 달: 이번달, 지난달, 저번달, 다음달, 요번달, 월말, 월초 …
  "이번달",
  "요번달",
  "지난달",
  "저번달",
  "다음달",
  "담달",
  "월말",
  "월초",
  "말일",
  "초순",
  "중순",
  "하순",
  "상순",
  "월중",
  "이달",
  "지지난달",
  "다다음달",
  // 한자어 달(Codex C1). "전월 미수 얼마예요?"에 전체 잔액이 나갔다. 전전월은 전월에 걸리지만 목록으로 남긴다
  "전월",
  "전전월",
  "당월",
  "금월",
  "익월",
  "차월",
  // 주
  "이번주",
  "요번주",
  "지난주",
  "저번주",
  "다음주",
  "금주",
  "차주",
  "전주",
  "주초",
  "주중",
  "주말",
  "요일",
  // "내주"는 넣지 않는다 — 공백을 지우면 "내 주문"이 "내주문"이 된다
  // 날
  "오늘",
  "어제",
  "그제",
  "그저께",
  "엊그제",
  "내일",
  "모레",
  "어저께",
  "금일",
  "당일",
  "전일",
  "작일",
  "익일",
  "명일",
  // 해, 반기, 분기
  "올해",
  "금년",
  "당해",
  "당년",
  "작년",
  "재작년",
  "전년",
  "지난해",
  "내년",
  "명년",
  "익년",
  "후년",
  "연말",
  "연초",
  "연중",
  "상반기",
  "하반기",
  "분기",
  // 지난 어느 때(주문 하나, 거래 한 번을 가리킨다 — 그 몫만 따로 셀 규칙이 없다)
  "지난번",
  "저번",
  "요전",
  "최근",
  "요즘",
];
/**
 * 숫자가 붙은 기간: "9월", "10일", "2주", "3개월", "2025년", "1분기", 한글 수 "한달", "두 달", "몇 주"
 */
const PERIOD_PATTERNS: readonly RegExp[] = [
  /\d+(월|일|주|개월|달|년|분기)/,
  /(한|두|세|석|네|넉|몇|여러)(달|주|개월)/,
  /(일|이|삼|사|오|유|육|칠|팔|구|시|십|십일|십이)월(달|분|에|미수|외상|잔금|잔액|거)/,
];
/**
 * 날짜 모양 "9/7", "9.7", "9-7", "10/29". 정규화가 문장부호를 공백으로 바꾸기 전 원문에서 찾는다.
 * 금액 쉼표("37,500")는 이 모양이 아니다
 */
const PERIOD_DATE = /\d{1,4}\s*[/.-]\s*\d{1,2}(?!\d)/;

/** 본문에 기간 표현이 있는가. `body`는 원문, 판정은 NFKC만 거친 원문과 공백 지운 정규화 본문을 같이 본다 */
export function hasPeriodWord(body: string): boolean {
  const raw = body.normalize("NFKC");
  const flat = compact(normalizeInquiryText(body));
  return (
    PERIOD_WORDS.some((w) => flat.includes(w)) ||
    PERIOD_PATTERNS.some((p) => p.test(flat)) ||
    PERIOD_DATE.test(raw)
  );
}

/**
 * 미수 금액을 답하는 **문장 전체**(D41). 본문을 정규화해 이 집합에 정확히 있을 때만 금액을 말한다.
 *
 * 왜 문장 통째인가: 기간 말 목록(`PERIOD_WORDS`)은 빠뜨린 말이 계속 나왔고(C2 "보름 동안", "이틀 전"), 아는 말
 * 조각으로만 이어지는지 보는 방식도 조각끼리 붙어 다른 뜻이 됐다(C3) — "사장님이 저희에게 갚을 돈은 얼마예요?"는
 * 방향이 반대고, "미수 얼마만에 갚아야 되나요?"는 기한 질문인데 둘 다 37,500원 답이 나갔다.
 * 그래서 소매가 **자기가 갚을 돈**을 묻는 게 분명한 문장만 적는다. "사장님 미수 얼마예요"처럼 누가 누구에게인지
 * 모호한 문장은 넣지 않는다. 여기 없는 문장은 AMOUNT_UNSURE로 사장에게 넘어갈 뿐이라, 넓히기보다 좁게 둔다.
 * 골든셋에서 미수 금액 답을 기대하는 문장은 전부 여기 있어야 한다(unit이 확인한다).
 */
export const RECEIVABLE_AMOUNT_QUESTIONS: readonly string[] = [
  // 골든셋(P5, R01~R04, R08, R14, R16, R17)
  "지금 미수 얼마예요?",
  "미수 얼마예요?",
  "외상 얼마 있어요?",
  "제 미수 얼마예요?",
  "잔액 얼마예요",
  "사장님, 제 미수 얼마예요?",
  // 짧은 변형
  "미수 얼마",
  "미수 금액 알려주세요",
  "제 외상 얼마 있어요?",
  "외상 얼마예요?",
  "지금 외상 얼마예요?",
  "제 외상 얼마예요?",
  "잔액 얼마예요?",
  "제 잔액 얼마예요?",
  "갚을 돈 얼마예요?",
  "제가 갚을 돈 얼마예요?",
];

/** 문장 비교 열쇠. 판정과 같은 정규화를 거친 뒤 공백까지 지운다 — 띄어쓰기, 쉼표, 물음표 차이는 같은 문장이다 */
function receivableQuestionKey(body: string): string {
  return compact(normalizeInquiryText(body));
}

/** 처음 부를 때 만든다 — 정규화가 쓰는 `TYPO_FIXES`가 이 아래에 있어 모듈 로드 때 만들면 초기화 전 참조다 */
let receivableAmountKeys: Set<string> | null = null;

/** 본문이 정해 둔 미수 금액 문장 중 하나인가(D41). 숫자, 기간 말, 모르는 말이 끼면 자연히 false다 */
export function isReceivableAmountQuestion(body: string): boolean {
  receivableAmountKeys ??= new Set(
    RECEIVABLE_AMOUNT_QUESTIONS.map(receivableQuestionKey),
  );
  return receivableAmountKeys.has(receivableQuestionKey(body));
}

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
  | "NO_MATCH"
  /** 판정 1-2. 입금했다는 말(loop-07) */
  | "PAYMENT_REPORT"
  /** 미수. 기간 말(이번달, 지난달 …)이 붙었다(Q2) */
  | "PERIOD"
  /** 미수. 이 방 도매처와 이 소매처의 정산 줄이 없다. "없어요"라고 답하지 않는다 — 원본이 다 담는지 모른다(D34) */
  | "NO_RELATION"
  /** 미수. 원본 금액을 보장 못 한다(`toReceivableFacts`의 이상값 7종), 또는 본문이 정해 둔 미수 문장이 아니다(D41) */
  | "AMOUNT_UNSURE"
  /** 미수. 원본 조회가 던졌다. 보내기는 201이고 오류가 아니라 넘김이다(S1-9) */
  | "LOOKUP_FAILED";

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
    }
  | {
      kind: "AUTO_REPLY";
      intent: "RECEIVABLE";
      /** 이 방 도매처 몫만. `toReceivableFacts`를 지난 값 */
      facts: ChatReceivableFacts;
      /** 원본의 `asOf`. 판정 시각 `now`가 아니다(§4-1 12) */
      checkedAt: string;
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
  const { said, left, confirmed, blocked } = narrowBackorders(text, all);
  // blocked: 후보 하나로 좁혀졌지만 본문에 모르는 말(후보에 없는 상품명일 수 있다)이 있다. 그 칩 하나로 되물으면
  // 소매가 말하지 않은 상품을 내미는 셈이라 넘긴다(리뷰 M1)
  if (said && (left.length === 0 || blocked))
    return handoff("NO_MATCH", "BACKORDER");
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
 * 미수 가지(loop-07 §4-1). 의도가 미수로 정해지고 미수 설정이 켜진 뒤에 온다. 되묻기는 없다. 위에서부터:
 *  a. 기간 말 → PERIOD(Q2)
 *  b. 원본 조회가 던짐 → LOOKUP_FAILED
 *  c. 이 방 도매처 + 이 방 소매처 줄 없음 → NO_RELATION
 *  d. 이상값 7종(`toReceivableFacts`) → AMOUNT_UNSURE
 *  e. 본문이 정해 둔 문장이 아님 → AMOUNT_UNSURE(D41, `isReceivableAmountQuestion`)
 *  f. 답. `checkedAt` = 원본 `asOf`
 */
function decideReceivable(input: InquiryInput): InquiryDecision {
  if (hasPeriodWord(input.body)) return handoff("PERIOD", "RECEIVABLE");
  let rows;
  try {
    rows = input.receivables();
  } catch {
    return handoff("LOOKUP_FAILED", "RECEIVABLE");
  }
  const row = receivableOf(rows, input.wholesalerId, input.retailerId);
  if (row === null) return handoff("NO_RELATION", "RECEIVABLE");
  const converted = toReceivableFacts(row);
  if (!converted.ok) return handoff("AMOUNT_UNSURE", "RECEIVABLE");
  // e. 정해 둔 문장일 때만 금액(D41). 계약 이유 enum은 못 늘려서 AMOUNT_UNSURE로 넘긴다 — PERIOD는 도매
  // 화면에 "기간을 정해 물었어요"로 나가는데, 본문이 "37,500원 맞아요"나 기한 질문이면 그 문장이 틀린다.
  // AMOUNT_UNSURE("잔액과 연체 내역 확인이 필요해요")는 어느 경우에도 맞는 말이다
  if (!isReceivableAmountQuestion(input.body))
    return handoff("AMOUNT_UNSURE", "RECEIVABLE");
  return {
    kind: "AUTO_REPLY",
    intent: "RECEIVABLE",
    facts: converted.facts,
    checkedAt: converted.checkedAt,
  };
}

/**
 * 판정 순서 0~9(§4-2). 위에서부터 처음 걸린 것으로 정한다.
 *
 * 순서가 규칙이다 — 특히 협상어(1)가 inquiry(4)보다 먼저다. 칩을 눌러도 본문이 협상이면 넘긴다.
 * 입금 알림(1-2, loop-07)은 협상어 바로 뒤, 의도 둘보다 먼저다.
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
  // 1-2. 입금 알림. 미수 낱말이 같이 있어도 금액을 말하지 않는다(H17)
  if (PAYMENT_REPORT_WORDS.some((w) => flat.includes(w)))
    return handoff("PAYMENT_REPORT", "RECEIVABLE");
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
  // 1-3. "이번 달 얼마 남았어요?": 재고 낱말("남았")뿐이지만 "얼마" + 기간 말은 돈을 묻는 문장일 수 있다(QA F4).
  // 색상, 사이즈를 되묻거나 잔액을 말하지 않고 기간 넘김으로 보낸다. 기간 말이 없는 "이 셔츠 얼마 남았어요?"는
  // 그대로 재고다(R10), "얼마"가 없는 "오늘 몇 장 남았어요?"도 재고다
  if (
    intents.size === 1 &&
    intents.has("STOCK") &&
    flat.includes("얼마") &&
    hasPeriodWord(input.body)
  )
    return handoff("PERIOD", "RECEIVABLE");

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
  // 미수는 되묻기가 없고 다른 의도의 열린 되묻기를 계승하지 않는다(R14). 위 계승은 같은 의도일 때만 걸린다
  if (intent === "RECEIVABLE") return decideReceivable(input);
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
  /** HANDOFF 줄이면 늘 값, 그 밖 null(loop-07 §5-2). 도매 응답에만 실린다 — 소매 목이 지운다 */
  handoff: ChatHandoff | null;
}

/**
 * 넘김 줄. 이유, 그때 읽은 의도, 원인 소매 메시지(`replyToSequence`)를 싣는다(S1-8).
 * 답 + 넘김 두 줄의 넘김은 판정 이유가 아니라 답 쪽 이유다(STOCK_ZERO, ETA_UNKNOWN, ETA_PAST)
 */
function handoffLineOf(
  reason: ChatHandoffReason,
  intent: ChatIntent | null,
  sourceSequence: number,
): GeneratedLine {
  return {
    sender: "SYSTEM",
    kind: "HANDOFF",
    body: HANDOFF_BODY,
    autoReply: null,
    handoff: { reason, intent, sourceSequence },
  };
}

/**
 * 판정 → 메시지 줄. 재고 0이면 AUTO_REPLY + HANDOFF 두 줄(Q2). `checkedAt`은 `now`, 미수만 원본 `asOf`.
 * facts는 **도매 모양**(정확 수량 포함)이다. 소매 응답으로 바꾸는 건 소매 목의 `toRetailFacts`가 한다.
 * 열린 넘김이 있을 때 넘김 줄을 붙일지는 여기가 아니라 {@link linesToAppend}가 정한다.
 */
export function generatedLines(
  d: InquiryDecision,
  replyToSequence: number,
  now: number,
): GeneratedLine[] {
  const checkedAt = new Date(now).toISOString();
  if (d.kind === "HANDOFF")
    return [handoffLineOf(d.reason, d.intent, replyToSequence)];
  if (d.intent === "BACKORDER")
    return backorderLines(d, replyToSequence, checkedAt);
  if (d.intent === "RECEIVABLE") return [receivableLine(d, replyToSequence)];
  if (d.kind === "CLARIFY")
    return [
      {
        sender: "WHOLESALER",
        kind: "CLARIFY",
        handoff: null,
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
    handoff: null,
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
  return d.band === "NONE"
    ? [reply, handoffLineOf("STOCK_ZERO", "STOCK", replyToSequence)]
    : [reply];
}

/**
 * 미수 답 한 줄(loop-07 §4-1 10). 넘김 줄은 붙지 않는다 — 그래서 열린 넘김 중에도 금액이 나간다(§4-2 3).
 * `checkedAt`은 원본 `asOf`다. subject 는 전부 null(상품, 옵션, 미송 어느 것도 아니다)
 */
function receivableLine(
  d: Extract<InquiryDecision, { kind: "AUTO_REPLY"; intent: "RECEIVABLE" }>,
  replyToSequence: number,
): GeneratedLine {
  return {
    sender: "WHOLESALER",
    kind: "AUTO_REPLY",
    body: receivableReplyBody(d.facts),
    handoff: null,
    autoReply: {
      intent: "RECEIVABLE",
      replyToSequence,
      generatedBy: "RULE",
      checkedAt: d.checkedAt,
      subject: {
        listingId: null,
        variantId: null,
        backorderId: null,
        label: null,
      },
      facts: { stock: null, backorder: null, receivable: d.facts },
      choices: null,
    },
  };
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
): GeneratedLine[] {
  if (d.kind === "CLARIFY")
    return [
      {
        sender: "WHOLESALER",
        kind: "CLARIFY",
        handoff: null,
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
    handoff: null,
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
  if (d.eta === "NONE")
    return [reply, handoffLineOf("ETA_UNKNOWN", "BACKORDER", replyToSequence)];
  if (d.eta === "PAST")
    return [reply, handoffLineOf("ETA_PAST", "BACKORDER", replyToSequence)];
  return [reply];
}

/* --- 열린 넘김 (loop-07 §4-2) --------------------------------------------- */

/**
 * 지금 열린 넘김. 마지막 HANDOFF 뒤에 사장이 직접 쓴 TEXT가 없으면 열려 있다 — "사장이 답했다"이지 입금 확인
 * 완료가 아니다(§4-2 2, Codex 12). AUTO_REPLY, CLARIFY로는 닫히지 않는다.
 * 열려 있으면 `{reason}`(마지막 넘김 줄의 이유, 모르면 null), 닫혀 있으면 null.
 */
export function openHandoffOf(
  history: readonly Pick<InquiryHistoryItem, "sender" | "kind" | "handoff">[],
): { reason: ChatHandoffReason | null } | null {
  let open: { reason: ChatHandoffReason | null } | null = null;
  for (const m of history) {
    if (m.kind === "HANDOFF") open = { reason: m.handoff?.reason ?? null };
    else if (m.sender === "WHOLESALER" && m.kind === "TEXT") open = null;
  }
  return open;
}

/**
 * 생성 줄 중 실제로 방에 넣을 것. 소매 목 보내기, 도매 `incoming`, 골든셋이 같이 쓴다.
 *
 * 열린 넘김이 있을 때 넘김 줄은 **이유가 같으면** 넣지 않는다 — 사장이 답하기 전까지 소매 글마다 "사장님께
 * 전달했어요"가 쌓이면 대화가 그 줄로 덮인다. **이유가 다르면 새 줄**을 넣는다(Q3, H20) — 협상으로 넘어온 방에
 * "방금 입금했어요"가 오면 사장이 입금 확인을 놓치지 않게. 옛 줄을 고치지 않는다: 도매는 `afterSequence`로 이어
 * 받아(앱 `types.ts`) 바뀐 옛 줄을 못 받는다. 이유를 모르는 열린 넘김(null)은 어떤 이유와도 다르다고 본다.
 * 답 + 넘김 두 줄(재고 0, 미송 입고일 미정과 지남)의 넘김은 답의 일부라 늘 넣는다(D34, D37②).
 */
export function linesToAppend(
  lines: readonly GeneratedLine[],
  history: readonly Pick<InquiryHistoryItem, "sender" | "kind" | "handoff">[],
): GeneratedLine[] {
  const open = openHandoffOf(history);
  const answerWithHandoff =
    lines.some((l) => l.kind === "AUTO_REPLY") &&
    lines.some((l) => l.kind === "HANDOFF");
  return lines.filter(
    (l) =>
      !(
        l.kind === "HANDOFF" &&
        open !== null &&
        !answerWithHandoff &&
        l.handoff?.reason === open.reason
      ),
  );
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
