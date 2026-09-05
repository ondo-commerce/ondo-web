import type { RetailSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다.
 *
 * **소매가 보는 것은 상품이 아니라 게시글(listing)이다** — 도매 ERP의 `Product`
 * (재고 단위)와 이름이 겹치지만 같은 것이 아니다. 목록은 "깊이 2로 끊는다"(스펙):
 * 색상·사이즈 목록도 재고도 안 내리고 가짓수만 온다.
 * ------------------------------------------------------------------------ */

export type ListingSummaryWire = RetailSchema<"ListingSummaryResponse">;
export type ListingDetailWire = RetailSchema<"ListingDetailResponse">;
export type CategoryWire = RetailSchema<"CategoryResponse">;
export type FilterOptionsWire = RetailSchema<"FilterOptionsResponse">;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`의 `toCatalogProduct(wire)`로만 만든다.
 * ------------------------------------------------------------------------ */

/**
 * 마켓 목록 카드 한 장이 쓰는 값 전부.
 *
 * fixtures 시절과 달리 **없는 것**이 많다 — 품번·카테고리·색상 이름·사이즈 이름·
 * 최고가·시즌 종료·구매 이력·게시일은 `ListingSummaryResponse`에 없다
 * (`04-wire.md` §3). 카드는 있는 값만 그린다.
 */
export interface CatalogProduct {
  /** `String(listingId)`. 찜 집합·주소가 문자열 키를 쓴다 */
  id: string;
  name: string;
  /** `String(wholesaler.id)`. 도매처 홈 주소에 실린다 */
  wholesalerId: string;
  /** 카드에 그대로 찍히는 상호. 도매처 화면을 안 거쳐도 누구 물건인지 보여야 한다 */
  wholesalerName: string;
  /** 대표 이미지. 빈 문자열이면 회색 슬롯을 그린다 */
  thumbnailUrl: string;
  /** 고를 수 있는 색상 가짓수. 이름 목록은 상세에만 있다 */
  colorCount: number;
  /** 고를 수 있는 사이즈 가짓수 */
  sizeCount: number;
  /** 옵션 중 제일 싼 값. 카드는 스펙대로 `12,500원~`으로 그린다 — 최고가는 안 온다 */
  priceMin: number;
}

/** 카테고리 바·필터 드롭다운에 세우는 항목. `GET /categories`의 최상위 한 단 */
export interface CategoryOption {
  id: number;
  name: string;
}

/** 컬러 필터 항목. `GET /filter-options`의 그룹을 펼친 것 — 순서는 서버가 정한다 */
export interface ColorFilterOption {
  id: number;
  name: string;
  hex: string;
  groupName: string;
}

/** 필터 드롭다운이 세울 선택지 전부. 목록과 따로 받는다(스펙: "필터를 바꿔도 선택지는 안 바뀐다") */
export interface CatalogOptions {
  categories: readonly CategoryOption[];
  colors: readonly ColorFilterOption[];
  sizes: readonly string[];
}

/**
 * 툴바가 좁히는 네 축. 값은 전부 **주소에 실린 문자열**이고 `전체`는 `FILTER_ALL` 한 값이다.
 * 카테고리·컬러는 서버 id의 문자열, 사이즈는 서버 사이즈 문자열, 가격은 `PRICE_BANDS`의 값.
 */
export interface CatalogFilter {
  category: string;
  color: string;
  size: string;
  price: string;
}

/** 서버가 잘라 준 목록의 크기. `상품 N개 · 전체 M개`와 `더 보기`가 이걸 읽는다 */
export interface CatalogPaging {
  /** 지금 화면에 실제로 그려진 카드 수 */
  shown: number;
  /** 조건에 맞는 전체 개수(`meta.totalElements`) */
  total: number;
}

/**
 * 찜 목록의 정렬. **목록 화면(홈·도매처 홈)에는 정렬이 없다** — `GET /listings`에
 * 정렬 파라미터가 없어서 서버 순서 그대로 그린다(`04-wire.md` §3).
 */
export type CatalogSort = "favorited-desc" | "price-asc" | "price-desc";

/**
 * 도매처 홈 머리에 서는 값. **상호만 서버 값이다** — 목록 응답의 `wholesaler.name`.
 * 위치·영업시간·누적 주문은 스펙에 없어 화면이 그 자리를 비운다.
 */
export interface Wholesaler {
  id: string;
  name: string;
  /** 상호 첫 글자. 이미지가 없어 이니셜 사각형으로 대신한다 */
  initial: string;
}
