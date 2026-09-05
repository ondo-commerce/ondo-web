import type { CatalogSort } from "./types";

/**
 * 필터의 `전체` 값. 상태 코드와 섞이지 않게 별도 값으로 둔다.
 * 도매 각 탭이 `FILTER_ALL`을 따로 갖는 것과 같은 이유로 여기 다시 적는다 —
 * feature끼리 상수를 공유하지 않는다(ESLint가 막는다).
 */
export const FILTER_ALL = "ALL";
export const FILTER_ALL_LABEL = "전체";

/**
 * 가격대 필터의 선택지. **서버 값이 아니다** — `GET /filter-options`는 실제
 * 최저·최고가(`priceRange`)만 주고 구간은 화면이 정한다. 자유 입력이 아니라 목록인
 * 이유: 숫자 입력칸을 늘리면 소수점·부호 방어를 그만큼 더 해야 하는데, 가격대는
 * 원래 대략의 구간이라 목록으로 충분하다.
 *
 * `max: null`은 상한 없음이다. 경계는 서버의 `priceFrom`·`priceTo`에 그대로 실린다 —
 * 서버가 닫힌 구간으로 보는지는 스펙에 없다(`04-wire.md` §3).
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

/** 정렬 라벨. 찜 목록만 정렬이 있다 — 목록 API에 정렬 파라미터가 없다 */
export const SORT_LABEL: Record<CatalogSort, string> = {
  "favorited-desc": "최근 찜한 순",
  "price-asc": "가격 낮은순",
  "price-desc": "가격 높은순",
};

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

/**
 * 서버가 한 번에 주는 최대 개수. **실측값이다** — `size=101`은 400
 * `VALIDATION_FAILED`, 스펙에는 상한이 적혀 있지 않다(`04-wire.md` §3).
 * `더 보기`가 이 수를 넘기면 그 자리에서 멈춘다.
 */
export const MAX_PAGE_SIZE = 100;

/** 주소에 실리는 이름. 화면·링크가 같은 문자열을 보게 한 곳에 둔다 */
export const LIST_PARAM = {
  category: "category",
  color: "color",
  size: "size",
  price: "price",
  /** 몇 장까지 펼쳤는지 */
  shown: "shown",
  /** 찜 목록의 도매처 칩 */
  seller: "seller",
  sort: "sort",
} as const;
