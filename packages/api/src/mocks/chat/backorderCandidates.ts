import type { WholesaleSchema } from "../../wholesale";

/**
 * 미송 자동 답의 후보와 날짜(loop-06 `01-plan.md` §4-2, §5-4). **목 규칙 = BE 규칙**이다. 순수 함수만 둔다.
 *
 * 후보 원본은 부르는 쪽이 넘긴다 — 목은 도매 미송 목 저장소(`../wholesale/backorder.ts`), 골든셋은
 * `backorders` 표. 원본은 **거르지 않고 다 넘긴다.** 이 방 도매처와 이 소매처 것만 고르는 건 여기서 한다.
 * 화면이 보낸 backorderId를 믿지 않으려면 거르는 곳이 서버 판정 안에 있어야 한다(§5-3 1).
 *
 * 후보 한 줄에 **없는 칸**이 규칙이다(§4-2 8): 그 SKU 판매가능, SKU 미송 합계, 원래 미송량, 소매처 이름.
 * 칸이 없으니 소매에게 나가는 글과 facts에 섞일 길이 없다.
 */

type Size = WholesaleSchema<"VariantResponse">["size"];

export interface InquiryBackorder {
  backorderId: number;
  orderId: number;
  /** 이 미송이 걸린 주문의 도매처 */
  wholesalerId: number;
  retailerId: number;
  variantId: number;
  /** 상품명 */
  title: string;
  color: string;
  size: Size;
  /** 남은 미배분 수량. 배분된 몫은 포장 대기라 답에 넣지 않는다. 0이면 해소 */
  remainingQty: number;
  /** 주문 시각(ISO, 오프셋 포함). 후보 순서와 칩 글자의 주문일 */
  orderedAt: string;
  /** 그 SKU의 도매 입고 예정일(`YYYY-MM-DD`, SKU 단위). 미정이면 null */
  expectedInboundDate: string | null;
  expectedInboundReason: string | null;
}

/** 원본 전체. 도매처, 소매처로 거르지 않은 것 */
export type InquiryBackorderSource = () => readonly InquiryBackorder[];

/* --- 날짜 (서울) ---------------------------------------------------------- */

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;

/** 시각(ms) → 서울 날짜 `YYYY-MM-DD`. UTC 15:00이 서울 자정이다 */
export function seoulDate(ms: number): string {
  return new Date(ms + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` + n일. 달력 날짜만 다룬다(시각 없음) */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** b − a 날짜 수 */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

export type EtaState = "FUTURE" | "TODAY" | "NONE" | "PAST";

/** 입고일 상태. 오늘 = 서울 날짜. 미정 NONE, 오늘보다 앞 PAST(지연이라 단정하지 않는다, Q2) */
export function etaState(date: string | null, today: string): EtaState {
  if (date === null) return "NONE";
  if (date === today) return "TODAY";
  return date > today ? "FUTURE" : "PAST";
}

function ymd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** "11월 5일", 다른 해면 "2027년 1월 5일" */
export function koreanDate(date: string, today: string): string {
  const t = ymd(date);
  const head = t.y === ymd(today).y ? "" : `${t.y}년 `;
  return `${head}${t.m}월 ${t.d}일`;
}

/** 칩 주문일 "9/7", 다른 해면 "2025/12/30". 주문 시각은 서울 날짜로 읽는다 */
export function slashDate(iso: string, today: string): string {
  const t = ymd(seoulDate(Date.parse(iso)));
  const head = t.y === ymd(today).y ? "" : `${t.y}/`;
  return `${head}${t.m}/${t.d}`;
}

/* --- 후보 ----------------------------------------------------------------- */

/**
 * §4-2 1. 이 방 도매처 + 이 소매처의 열린 미송(남은 수량 > 0). 순서는 주문 시각 오름차순, 같으면 id 오름차순.
 * 소유를 보는 줄이 이 함수의 핵심이다 — 지우면 남의 미송이 칩에 뜬다(변이 1).
 */
export function candidatesOf(
  source: InquiryBackorderSource,
  wholesalerId: number,
  retailerId: number,
): InquiryBackorder[] {
  return source()
    .filter(
      (b) => b.wholesalerId === wholesalerId && b.retailerId === retailerId,
    )
    .filter((b) => b.remainingQty > 0)
    .sort(
      (a, b) =>
        Date.parse(a.orderedAt) - Date.parse(b.orderedAt) ||
        a.backorderId - b.backorderId,
    );
}

/** 칩 글자. "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003". 고르면 이 글자가 본문이다 */
export function backorderChoiceLabel(b: InquiryBackorder, today: string) {
  return `${b.title} ${b.color}/${b.size}, 남은 ${b.remainingQty}장, ${slashDate(b.orderedAt, today)} 주문 #${b.orderId}`;
}

/* --- 본문 좁히기 (§4-2 4) ------------------------------------------------- */

/**
 * 색상 사전. 후보의 색상만으로는 "블랙 셔츠"의 블랙을 못 읽는다(셔츠 미송이 화이트뿐이면 블랙은 후보 어디에도 없다).
 * 그러면 블랙을 못 본 채 셔츠 후보로 되묻는다 — 소매가 말한 색과 다른 미송이 칩에 뜬다. 그래서 흔한 색 이름을 따로 둔다.
 * 사전에 없는 색은 못 읽는다(별칭 "빨강"도 안 받는다, 05b 정규화 표와 같다). 그 말은 좁히기에 안 쓰고 되묻는다
 */
const COLOR_WORDS = [
  "블랙",
  "화이트",
  "아이보리",
  "크림",
  "베이지",
  "그레이",
  "차콜",
  "네이비",
  "블루",
  "소라",
  "스카이",
  "레드",
  "와인",
  "핑크",
  "오렌지",
  "옐로우",
  "카키",
  "그린",
  "민트",
  "브라운",
  "카멜",
  "퍼플",
  "라벤더",
];

const SIZE_TOKEN = /(?<![A-Z0-9])(2XL|XS|XL|S|M|L|FREE)(?![A-Z0-9])/g;

export interface Narrowed {
  /** 상품명 낱말, 색상, 사이즈 중 하나라도 나왔다 */
  said: boolean;
  /** 나온 말을 전부 만족하는 후보(입력 순서 그대로) */
  left: InquiryBackorder[];
  /** 남은 게 1개이고 본문에 색상과 사이즈가 하나씩 있다(M1: 한쪽만으로 확정하지 않는다, R1: 둘 이상이면 쌍을 몰라 확정하지 않는다) */
  confirmed: InquiryBackorder | null;
}

/**
 * `normalized`는 `normalizeInquiryText`를 거친 글(대문자 사이즈, 문장부호는 공백). 상품명 낱말은 후보 상품명을
 * 공백으로 자른 2글자 이상 낱말이다 — 후보에 없는 상품명("블라우스")은 못 읽어서 좁히지 않고 되묻는다.
 */
export function narrowBackorders(
  normalized: string,
  pool: readonly InquiryBackorder[],
): Narrowed {
  const flat = normalized.replace(/\s/g, "");
  const words = [
    ...new Set(
      pool.flatMap((b) => b.title.split(/\s+/).filter((w) => w.length >= 2)),
    ),
  ].filter((w) => flat.includes(w));
  const colors = [
    ...new Set([...COLOR_WORDS, ...pool.map((b) => b.color)]),
  ].filter((c) => flat.includes(c));
  const sizes = [
    ...new Set([...normalized.matchAll(SIZE_TOKEN)].map((m) => m[1] as Size)),
  ];
  const said = words.length + colors.length + sizes.length > 0;
  const left = pool.filter(
    (b) =>
      words.every((w) => b.title.split(/\s+/).includes(w)) &&
      (colors.length === 0 || colors.includes(b.color)) &&
      (sizes.length === 0 || sizes.includes(b.size)),
  );
  // 색상이나 사이즈가 둘 이상이면 어느 색에 어느 사이즈인지(쌍)를 이 거르기가 모른다. "블랙 M이랑 화이트 L"은
  // 블랙/L도 통과시킨다 — 묻지 않은 옵션으로 확정하게 된다(D37 ④, 리뷰 R1). 그래서 각각 하나일 때만 확정한다
  const confirmed =
    left.length === 1 && colors.length === 1 && sizes.length === 1
      ? (left[0] ?? null)
      : null;
  return { said, left, confirmed };
}
