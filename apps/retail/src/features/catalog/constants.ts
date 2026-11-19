import type { CatalogSort, FilterAxes } from "./types";

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

/** 홈 — 네 축 전부 드롭다운이 있다 */
export const ALL_AXES: FilterAxes = {
  category: true,
  color: true,
  size: true,
  price: true,
};

/**
 * 도매처 홈 — 가격대 축이 없다. 한 도매처 안이라 가격 폭이 좁아 축이 안 나뉜다.
 * 드롭다운을 그리는 쪽과 주소를 읽는 쪽(`page.tsx`)이 **같은 값**을 봐야 한 쪽만
 * 감춘 축이 생기지 않는다(#181).
 */
export const WHOLESALER_HOME_AXES: FilterAxes = { ...ALL_AXES, price: false };

/**
 * `미결제 잔액` 카드가 정산 요청 실패로 값을 못 받았을 때(`TradeStatsSlot.unavailable`).
 * 숫자를 지어내지 않는다 — `0원`은 "거래 없음"으로 읽혀서 실제로 미수가 있는
 * 도매처가 깨끗해 보인다(#183).
 *
 * 예전 `진행 중` 카드는 지웠다. 도매처별 확정 대기·미송 건수를 주는 API가 없어
 * 늘 "거래 정보 준비 중"이었다(#240, `side-02` #3). 서버가 주면(BE 요청 B8) 다시 단다.
 */
export const TRADE_STATS_UNAVAILABLE = {
  value: "—",
  sub: "불러오지 못했어요",
} as const;

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
 * 마켓 목록 한 페이지의 상품 수. 격자가 6, 4, 2칸(`ProductGrid`)이라 셋으로 다
 * 나눠떨어지는 값이어야 마지막 줄이 비지 않는다
 */
export const PAGE_SIZE = 24;

/** 도매처 필터를 제공하지 않는 목록 API의 한 요청 최대 크기 */
export const MAX_PAGE_SIZE = 100;

/** 주소에 실리는 이름. 화면·링크가 같은 문자열을 보게 한 곳에 둔다 */
export const LIST_PARAM = {
  category: "category",
  color: "color",
  size: "size",
  price: "price",
  page: "page",
  /** 찜 목록의 도매처 칩 */
  seller: "seller",
  sort: "sort",
} as const;
