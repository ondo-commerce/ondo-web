import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 * ------------------------------------------------------------------------ */

export type ProductSummary = WholesaleSchema<"ProductSummaryResponse">;
export type ProductDetail = WholesaleSchema<"ProductDetailResponse">;
export type Listing = WholesaleSchema<"ListingResponse">;
export type Variant = WholesaleSchema<"VariantResponse">;
export type CategoryNode = WholesaleSchema<"CategoryNodeResponse">;
export type ColorGroup = WholesaleSchema<"ColorGroupResponse">;
export type ColorItem = WholesaleSchema<"ColorItem">;
export type ProductCreateRequest = WholesaleSchema<"ProductCreateRequest">;
export type ProductUpdateRequest = WholesaleSchema<"ProductUpdateRequest">;
export type ListingUpsertRequest = WholesaleSchema<"ListingUpsertRequest">;

/**
 * 사이즈 축. 스펙 enum(`XS S M L XL 2XL FREE`)이 원본이다 — 상품마다 쓰는 값이
 * 다르지만 목록 자체는 고정이고, 늘리려면 서버가 먼저다.
 */
export type SkuSize = Variant["size"];

/** 게시글 상태. 시즌 종료는 삭제가 아니라 마켓 노출만 내린 상태다 */
export type PostStatus = Listing["status"];

/**
 * 게시 상태를 **한 축으로 볼 때의 3값.** `NONE`은 게시글이 아직 없는 상태
 * (`listing`이 null)라 `PostStatus`에는 들어갈 수 없다 — 게시글이 없으면
 * 그 게시글의 상태도 없기 때문이다.
 *
 * 그런데 목록의 `게시` 열과 필터는 그 셋을 **한 칸에서 같이** 읽어야 한다.
 * 그 시선을 이름 붙인 것이 이 타입이다. 필터 전용이 아니라 배지·상세도 같이 쓴다.
 */
export type PostStatusKey = PostStatus | "NONE";

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`의 `toXxxView(wire)`로만 만든다.
 * wire와 따로 두는 이유: 게시글 없음이 wire에서는 "non-optional인데 null"로 오고
 * (스펙에 nullable이 없다), 화면은 그걸 `post: null`로 읽어야 한다. 그 좁힘을
 * 컴포넌트마다 하지 않으려고 한 번 바꿔서 넘긴다.
 * ------------------------------------------------------------------------ */

/** 목록 한 행. `GET /products`의 summary에서 나온다 — 색·SKU는 **개수만** 있다 */
export interface ProductRowView {
  id: number;
  /** 품번. 스펙은 숫자(`productNumber`)라 화면엔 숫자만 보인다 */
  code: string;
  name: string;
  /** `여성 > 상의 > 티셔츠` */
  categoryLabel: string;
  colorCount: number;
  skuCount: number;
  postStatus: PostStatusKey;
}

export interface ColorView {
  /** 팔레트(`GET /colors`) id. 요청에 실리는 값은 이름이 아니라 이것이다 */
  id: number;
  name: string;
  /** 서버가 내려주는 표시색 */
  hex: string;
}

/** SKU = 색상 × 사이즈. 무늬 축은 없다 */
export interface SkuView {
  /** variant id. 수정 요청의 `variantId`가 이것이다 */
  id: number;
  /** 품번 안의 순번(`variantNumber`). SKU 코드 문자열은 스펙에 없다 */
  code: string;
  colorId: number;
  color: string;
  size: SkuSize;
  /**
   * 현재고(stockQty) — 창고에 실제로 있는 수량. 0이면 빨강으로 표시한다.
   *
   * ⚠️ 팔 수 있는 수량이 아니다. 마켓에 노출되는 값은 `availableQty`이고 서버가 준다.
   */
  stock: number;
  /** 주문처리중(allocatedQty) — 주문이 잡혀 빠져나갈 예정이라 이미 묶인 수량 */
  reservedQty: number;
  /** 미송대기(backorderQty) — 팔았지만 아직 못 보낸 수량. 현재고보다 클 수 있다 */
  backorderQty: number;
  /** 판매가능 = 현재고 − 주문처리중 − 미송대기. 서버가 계산한 값을 그대로 */
  availableQty: number;
  /** 주문 제한 (게시글에 붙는 값). 0 = 무제한 */
  orderLimit: number;
  /** 입고 이력으로 갱신되는 값. 화면에서 수정하지 않는다 */
  avgCost: number;
  /** 판매가 (게시글에 붙는 값) */
  price: number;
}

/**
 * 게시글 = 온도 마켓 노출 단위. 상품과 분리된 리소스다.
 * 판매가·주문제한·이미지·낱장 여부는 상품이 아니라 게시글에 붙는다.
 */
export interface PostView {
  /** listing id. 시즌 종료·재개 호출이 이 id를 받는다 */
  id: number;
  name: string;
  description: string;
  /** 이미지 URL. 첫 번째가 대표다 (서버가 `sortOrder` ASC로 보장) */
  images: string[];
  /** 낱장 등록 — 첫 구매시 1장 구매 허용 */
  allowSinglePiece: boolean;
  status: PostStatus;
}

/** 상품 = ERP 재고의 단위. `GET /products/{id}`에서 나온다 */
export interface ProductView {
  id: number;
  name: string;
  code: string;
  /** 대 > 중 > 소. 서버가 리프까지의 경로를 준다 */
  categoryPath: readonly { id: number; name: string }[];
  categoryLabel: string;
  colors: ColorView[];
  skus: SkuView[];
  /** 아직 마켓에 게시하지 않았으면 null */
  post: PostView | null;
}

/* ------------------------------------------------------------------------
 * 폼 — 등록·수정 화면이 들고 있는 값. 요청으로 바꾸는 건 `derive.ts`가 한다.
 * ------------------------------------------------------------------------ */

export interface OptionDraft {
  id: string;
  /** 팔레트(`GET /colors`) 중 하나. 표의 행 하나가 색상 하나다 */
  color: ColorItem;
  sizes: SkuSize[];
}

export interface ProductFormValue {
  name: string;
  /**
   * 대·중·소 카테고리 **id 문자열**. 빈 문자열 = 아직 안 고름.
   * 이름이 아니라 id인 이유: 요청에 실리는 건 리프 `categoryId`이고, 같은 이름의
   * 소분류(여성>아우터>데님 / 여성>팬츠>데님)가 트리에 여럿이라 이름으로는 못 찾는다.
   */
  category: [string, string, string];
  options: OptionDraft[];
}

/**
 * 가격표 한 칸의 값. **숫자가 아니라 친 글자 그대로**다.
 *
 * 숫자로 들면 `Number("45.5")`가 칸에 `455`로 돌아오고 `-3`이 `3`이 된다 —
 * 친 글자와 칸에 남은 값이 달라진 걸 아무도 모른다(계좌번호 `ACCOUNT_NO_SHAPE`와
 * 같은 이유). 정수 문자열(`isIntegerText`)만 유효하고, 판정은 검증이,
 * 숫자 변환은 요청 직전(`toListingRequest`)이 한다. 빈 문자열 = 0.
 */
export interface PriceValue {
  orderLimit: string;
  price: string;
}

export interface PostFormValue {
  name: string;
  description: string;
  /** 이미지 URL. 인덱스가 곧 순서(0번 = 대표) */
  images: string[];
  allowSinglePiece: boolean;
  /** 키 = `priceRowId(colorId, size)` */
  prices: Record<string, PriceValue>;
}

/** 가격표 한 행. 옵션 매트릭스(색상 × 사이즈)에서 나온다 */
export interface PriceRow {
  id: string;
  colorId: number;
  color: string;
  colorHex: string;
  /** 같은 색상의 첫 행에만 색상을 표시한다 */
  firstOfColor: boolean;
  size: SkuSize;
  stock: number;
  avgCost: number;
}

/** 서버 `VALIDATION_FAILED`의 `errors[].field`가 올 자리. 폼 칸과 1:1이다 */
export type ProductField =
  | "name"
  | "categoryId"
  | "colorOptions"
  | "listing.title"
  | "listing.description"
  | "listing.images"
  | "listing.variantPrices";

/* ------------------------------------------------------------------------
 * ⚠️ 아래는 **연동 전 화면용 타입**이다. 상품 탭은 더 이상 쓰지 않는다.
 *
 * 재고 탭(`features/inventory`)·주문 탭(`features/order`)이 아직 fixtures로 돌고
 * 그쪽 fixtures가 이 모양을 import 한다. 그 feature가 연동되는 회차에 같이 지운다.
 * 새 코드에서는 위의 `ProductView`·`SkuView`를 쓴다.
 * ------------------------------------------------------------------------ */

export type SizeName = "Free" | "XS" | "S" | "M" | "L" | "XL" | "2XL";

export interface ColorOption {
  name: string;
  hex: string;
  displayName?: string;
  imageUrl?: string;
}

export interface Sku {
  id: string;
  code: string;
  color: string;
  size: SizeName;
  stock: number;
  reservedQty: number;
  backorderQty: number;
  orderLimit: number;
  avgCost: number;
  price: number;
  marginRate: number;
}

export interface Post {
  id: string;
  name: string;
  description: string;
  images: string[];
  allowSinglePiece: boolean;
  status: PostStatus;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: [string, string, string];
  colors: ColorOption[];
  skus: Sku[];
  post: Post | null;
}
