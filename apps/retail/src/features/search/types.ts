import type { RetailSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다.
 *
 * 통합 검색이 부르는 path는 `GET /listings?q=` 하나다. 도매처 검색·내 주문 검색
 * path가 스펙에 없어(`04-wire.md` §3) 도매처는 상품 결과에서 파생하고, 내 주문 탭은
 * 이번 회차에 없다(`GET /orders`에 `q`가 없다).
 * ------------------------------------------------------------------------ */

export type ListingSummaryWire = RetailSchema<"ListingSummaryResponse">;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`의 `toSearchProduct(wire)`로만 만든다.
 * ------------------------------------------------------------------------ */

/** 검색 결과 줄에 서는 상품. 목록 화면의 카드와 같은 응답을 다른 모양으로 본다 */
export interface SearchProduct {
  /** `String(listingId)` */
  id: string;
  name: string;
  /** `String(wholesaler.id)` */
  wholesalerId: string;
  wholesalerName: string;
  thumbnailUrl: string;
  colorCount: number;
  sizeCount: number;
  /** 목록 응답은 최저가만 준다 — 줄은 `12,500원~`으로 그린다 */
  priceMin: number;
  /* 품번(`SU-18`)이 없다 — `ListingSummaryResponse`에 `productNumber`가 없다.
     그래서 fixtures 시절의 `품번 정확 일치` 배지·우선 정렬도 없다(§3).
     찜 상태도 여기 없다 — `features/catalog`의 세션 저장소 한 곳이 갖는다 */
}

/**
 * 도매처 결과 줄. **상품 결과에서 파생한다** — 이름이 검색어와 맞는 도매처만.
 * 위치는 목록 응답(`WholesalerBrief`)에 없어 줄에 없다.
 */
export interface SearchWholesaler {
  id: string;
  name: string;
  initial: string;
}

/** 결과 분류 탭. 값은 주소의 `?tab=`에 그대로 실린다 */
export type SearchTab = "all" | "products" | "wholesalers";

/** 두 축을 한 번에 훑은 결과 */
export interface SearchResult {
  products: SearchProduct[];
  wholesalers: SearchWholesaler[];
  /** 서버가 아는 상품 결과 전체 수(`meta.totalElements`). 받은 것보다 많을 수 있다 */
  productTotal: number;
}
