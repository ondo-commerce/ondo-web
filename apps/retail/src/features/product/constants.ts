import type { ListingStatus } from "./types";

/**
 * 색상 표기 옆 점에 쓰는 값. **도매 `COLOR_PALETTE` 26종 6그룹의 복제본**이다
 * (게이트 Q4). 앱 간 직접 import는 ESLint가 막고, feature 간에도 마찬가지다.
 * 목록 쪽(`features/catalog/constants.ts`)에도 같은 표가 있다 — 도매가 팔레트를
 * 늘리면 세 곳을 같이 고쳐야 한다.
 */
const COLOR_HEX: Record<string, string> = {
  블랙: "#191f28",
  차콜: "#4e5968",
  그레이: "#b0b8c1",
  화이트: "#ffffff",
  아이보리: "#f3efe3",
  크림: "#f7ecd7",
  베이지: "#d8c3a5",
  카멜: "#b5813f",
  브라운: "#6b4a2f",
  카키: "#6b6b45",
  네이비: "#1f2a44",
  블루: "#3182f6",
  소라: "#a5c9e8",
  연청: "#a9c3dc",
  중청: "#5b7fa6",
  진청: "#2b4160",
  레드: "#d63b3b",
  버건디: "#6e2233",
  핑크: "#f0a3bb",
  오렌지: "#f08030",
  옐로우: "#f2c94c",
  그린: "#3f7d4f",
  민트: "#8fd6c4",
  퍼플: "#7b5ea7",
  골드: "#c9a227",
  실버: "#c0c4c9",
};

/** 팔레트에 없는 이름(옛 데이터 등)이 와도 화면이 깨지지 않게 흰색으로 떨어뜨린다 */
export function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#ffffff";
}

/**
 * 거래 조건 3줄. **화면마다 다시 적지 않는다** — 결제 수단 표기가 갈리면
 * 어느 쪽이 맞는지 사장이 알 수 없다.
 *
 * 결제가 `현금 · 계좌 이체`인 것은 게이트 D2(2026-08-31) 확정이다.
 * `retail_screen_spec.md` RT-23은 아직 `현장 결제`로 적혀 있으나 그 말은 폐기됐다.
 * 수령의 표준어는 **`사입삼촌`(붙여 씀)**이다(§4). `사입 삼촌`으로 띄우지 않는다.
 */
export const TRADE_TERMS: readonly {
  term: string;
  value: string;
  why: string;
}[] = [
  {
    term: "결제",
    value: "현금 · 계좌 이체",
    why: "도매처가 입금을 건별로 확인해요",
  },
  {
    term: "수령",
    value: "직접 수령 · 사입삼촌 방문",
    why: "택배는 지원하지 않아요",
  },
  {
    term: "교환·반품",
    value: "반품만 가능해요",
    why: "환불 불가 · 도매처와 전화로 진행",
  },
];

/**
 * 주문이 잠긴 상태의 배너 문구.
 *
 * 시즌 종료와 게시 내림은 **결과가 같고 사건이 다르다.** 게시 내림은 다시 올라올
 * 수 있어 "지금은"이라고 적고, 시즌 종료는 끝난 것이라 "더"라고 적는다.
 */
export const LOCKED_NOTICE: Record<
  Exclude<ListingStatus, "ON_SALE">,
  string
> = {
  UNPUBLISHED: "도매처가 이 상품의 게시를 내렸어요. 지금은 주문할 수 없어요.",
  SEASON_ENDED: "이 상품은 시즌이 끝났어요. 더 주문할 수 없어요.",
};

/** 가격 범위 아래 한 줄. 왜 값이 하나가 아닌지를 미리 말한다 */
export const PRICE_HINT =
  "컬러 · 사이즈 조합마다 가격이 달라요 — 아래 옵션 목록에서 확인할 수 있어요.";

/** 갤러리에 세우는 썸네일 칸 수. 원본이 5칸이고 넘치면 마지막 칸이 `+N`이 된다 */
export const THUMB_SLOTS = 5;

/**
 * 한 번에 주문할 수 있는 상한. **SKU 하나당**이다(glossary G13) — 상품 단위가 아니다.
 * 색상 × 사이즈 조합마다 500장까지이고, 조합이 여럿이면 합계는 더 커질 수 있다.
 * 이 값을 화면 문구와 clamp가 같이 읽는다 — 두 곳에 적으면 안내와 동작이 갈린다.
 */
export const SKU_ORDER_LIMIT = 500;

/** 수량 단위. 소매는 `장`이다(게이트 Q9). 도매 화면의 `개`와는 별도 이슈로 맞춘다 */
export const QTY_UNIT = "장";

/** 수량 칸 각주. 상한이 어느 단위에 걸리는지를 여기서 못박는다 */
export const QTY_FOOTNOTE = `수량 칸에 숫자를 바로 입력하세요. −/+ 는 미세 조정용이에요. SKU 하나당 한 번에 최대 ${SKU_ORDER_LIMIT}${QTY_UNIT}까지 주문할 수 있어요.`;

/**
 * 수량 입력이 걸렸을 때 그 행에 뜨는 말.
 *
 * **값만 되돌리고 말을 안 하면 "고장난 칸"이 된다**(도매 5회차 F5). 특히
 * `45.5`처럼 소수점을 넣은 경우 — 점만 조용히 지우면 `455`가 되어 45배를
 * 주문하게 되므로, 친 글자를 그대로 두고 왜 못 받는지 말한다.
 */
export const QTY_ISSUE_TEXT = {
  NOT_A_NUMBER: `수량은 낱장 단위예요. 0 이상의 정수만 넣을 수 있어요(소수점 · 부호 · 전각 숫자는 못 받아요).`,
  OVER_LIMIT: `SKU 하나당 한 번에 ${SKU_ORDER_LIMIT}${QTY_UNIT}까지예요. ${SKU_ORDER_LIMIT}${QTY_UNIT}으로 맞췄어요.`,
} as const;

/** 재고 소진이지만 미송으로 주문은 되는 조합. **수치는 주지 않는다**(게이트 Q1) */
export const SOLD_OUT_BADGE = "재고 소진 · 미송 가능";
