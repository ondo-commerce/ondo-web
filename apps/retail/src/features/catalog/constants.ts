import type { CatalogSort, SizeName } from "./types";

export const SIZES: readonly SizeName[] = [
  "Free",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
];

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface PaletteGroup {
  group: string;
  colors: PaletteColor[];
}

/**
 * 색상 마스터 — 고정 팔레트 26종 6그룹. 자유 입력이 아니다.
 * 색상 = 시스템 값(필터·집계용), 색상 표기 = 노출용 이름(자유 텍스트).
 *
 * **도매 `apps/wholesale/src/features/product/constants.ts`의 복제본이다**
 * (게이트 Q4, 2026-08-31). 앱 간 직접 import는 ESLint가 막고, 색상 마스터는
 * 도메인 지식이 있어 `packages/ui` 승격 대상도 아니다. 도매가 팔레트를 늘리면
 * 이 파일도 같이 고쳐야 한다 — 값이 갈리면 소매 필터가 도매 데이터를 못 집는다.
 */
export const COLOR_PALETTE: readonly PaletteGroup[] = [
  {
    group: "무채색",
    colors: [
      { name: "블랙", hex: "#191f28" },
      { name: "차콜", hex: "#4e5968" },
      { name: "그레이", hex: "#b0b8c1" },
      { name: "화이트", hex: "#ffffff" },
      { name: "아이보리", hex: "#f3efe3" },
      { name: "크림", hex: "#f7ecd7" },
    ],
  },
  {
    group: "베이지·브라운",
    colors: [
      { name: "베이지", hex: "#d8c3a5" },
      { name: "카멜", hex: "#b5813f" },
      { name: "브라운", hex: "#6b4a2f" },
      { name: "카키", hex: "#6b6b45" },
    ],
  },
  {
    group: "블루",
    colors: [
      { name: "네이비", hex: "#1f2a44" },
      { name: "블루", hex: "#3182f6" },
      { name: "소라", hex: "#a5c9e8" },
    ],
  },
  {
    group: "데님 워싱",
    colors: [
      { name: "연청", hex: "#a9c3dc" },
      { name: "중청", hex: "#5b7fa6" },
      { name: "진청", hex: "#2b4160" },
    ],
  },
  {
    group: "컬러",
    colors: [
      { name: "레드", hex: "#d63b3b" },
      { name: "버건디", hex: "#6e2233" },
      { name: "핑크", hex: "#f0a3bb" },
      { name: "오렌지", hex: "#f08030" },
      { name: "옐로우", hex: "#f2c94c" },
      { name: "그린", hex: "#3f7d4f" },
      { name: "민트", hex: "#8fd6c4" },
      { name: "퍼플", hex: "#7b5ea7" },
    ],
  },
  {
    group: "특수",
    colors: [
      { name: "골드", hex: "#c9a227" },
      { name: "실버", hex: "#c0c4c9" },
    ],
  },
];

/** 팔레트 색 이름 → hex. 카드·필터·옵션 표에서 색 점을 그릴 때 쓴다 */
const COLOR_HEX: Record<string, string> = Object.fromEntries(
  COLOR_PALETTE.flatMap((g) => g.colors.map((c) => [c.name, c.hex])),
);

/** 팔레트에 없는 이름(옛 데이터 등)이 와도 화면이 깨지지 않게 흰색으로 떨어뜨린다 */
export function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#ffffff";
}

/**
 * 필터의 `전체` 값. 상태 코드와 섞이지 않게 별도 값으로 둔다.
 * 도매 각 탭이 `FILTER_ALL`을 따로 갖는 것과 같은 이유로 여기 다시 적는다 —
 * feature끼리 상수를 공유하지 않는다(ESLint가 막는다).
 */
export const FILTER_ALL = "ALL";
export const FILTER_ALL_LABEL = "전체";

/**
 * 가격대 필터의 선택지. **자유 입력이 아니라 목록**이다 —
 * 숫자 입력칸을 늘리면 소수점·부호 방어를 그만큼 더 해야 하는데,
 * 가격대는 원래 대략의 구간이라 목록으로 충분하다.
 *
 * `max: null`은 상한 없음이다. 경계는 `min <= 가격 <= max`로 닫는다 —
 * 열어 두면 20,000원짜리가 `1~2만원`에도 `2~3만원`에도 안 걸린다.
 */
export interface PriceBand {
  value: string;
  label: string;
  min: number;
  max: number | null;
}

export const PRICE_BANDS: readonly PriceBand[] = [
  { value: "u10000", label: "1만원 미만", min: 0, max: 9999 },
  { value: "10000", label: "1만 ~ 2만원", min: 10000, max: 20000 },
  { value: "20000", label: "2만 ~ 3만원", min: 20000, max: 30000 },
  { value: "30000", label: "3만원 이상", min: 30000, max: null },
];

/** 정렬 라벨. 툴바 버튼과 드롭다운 항목이 같은 문구를 쓰도록 한 표에서 찾는다 */
export const SORT_LABEL: Record<CatalogSort, string> = {
  latest: "최신순",
  "price-asc": "가격 낮은순",
  "price-desc": "가격 높은순",
  "favorited-desc": "최근 찜한 순",
};

/** 목록 화면(홈·도매처 홈)이 고를 수 있는 정렬. `최근 찜한 순`은 찜 목록에만 있다 */
export const LIST_SORTS: readonly CatalogSort[] = [
  "latest",
  "price-asc",
  "price-desc",
];

/** 찜 목록의 정렬. 기본값이 `최근 찜한 순`이라 맨 앞이다 */
export const WISHLIST_SORTS: readonly CatalogSort[] = [
  "favorited-desc",
  "price-asc",
  "price-desc",
];

/**
 * `상품 더 보기` 한 번에 늘어나는 카드 수.
 *
 * 확정 와이어프레임의 홈이 8장 + `상품 더 보기` 한 줄이라 그 수에 맞춘다.
 * 무한 스크롤로 바꾸지 않는다 — 원본이 버튼이고, 버튼이어야 지금 몇 장을 보고
 * 있는지 화면이 말할 수 있다(아래 건수 표기와 짝이다).
 */
export const PAGE_SIZE = 8;
