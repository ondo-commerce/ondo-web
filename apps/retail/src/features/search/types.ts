/**
 * 통합 검색이 훑는 세 축. 상품·도매처·**내 주문**이다 —
 * 전에 주문했던 건에서도 찾아 주는 것이 이 화면의 존재 이유다(RT-15).
 */

/** 검색 결과 줄에 서는 상품. 목록 화면의 카드보다 적은 값을 쓴다 */
export interface SearchProduct {
  id: string;
  name: string;
  /** 품번. 도매 `SU-18` 형식이다(게이트 Q3) — `품번 정확 일치`의 비교 대상 */
  code: string;
  wholesalerId: string;
  wholesalerName: string;
  colorCount: number;
  /** 사이즈가 하나뿐이면 이름 그대로 쓴다(`사이즈 Free`) */
  sizeLabel: string;
  priceMin: number;
  /** 최저가보다 비싼 조합이 있는가. 있으면 `~`를 붙인다 */
  hasRange: boolean;
  favorited: boolean;
}

export interface SearchWholesaler {
  id: string;
  name: string;
  initial: string;
  location: string;
}

/**
 * 주문 검색 결과 한 줄.
 *
 * **통합 주문**(여러 도매처를 한 번에 담아 넣은 주문)이 소매의 기본 단위다.
 * 그래서 도매처가 `무드온 외 1곳`처럼 적히고, 상태는 통합 주문 하나의 상태다.
 * (통합 주문 엔티티 자체는 §3-B 미결정이라 여기서는 더미 값이다.)
 */
export interface SearchOrder {
  id: string;
  /** 통합 주문번호 `20260717-1152-0088` */
  orderNo: string;
  /** 주문일 (ISO 날짜) */
  orderedAt: string;
  /** 이 주문에 걸린 상품명들 — 검색어와 맞춘 결과를 사장에게 되짚어 준다 */
  productName: string;
  productCode: string;
  /** `블랙/M 5장 · 블랙/L 4장` — 색상/사이즈 조합과 장수 */
  optionSummary: string;
  wholesalerSummary: string;
  /** 총 장수. 소매의 수량 단위는 `장`이다(게이트 Q9) */
  totalSheets: number;
  totalAmount: number;
  statusLabel: string;
}

/** 결과 분류 탭. 값은 주소의 `?tab=`에 그대로 실린다 */
export type SearchTab = "all" | "products" | "wholesalers" | "orders";

/** 세 축을 한 번에 훑은 결과 */
export interface SearchResult {
  products: MatchedProduct[];
  wholesalers: SearchWholesaler[];
  orders: SearchOrder[];
}

export interface MatchedProduct extends SearchProduct {
  /** 품번이 검색어와 **정확히** 같다. 배지가 붙고 목록 맨 위로 올라간다 */
  exactCode: boolean;
}
