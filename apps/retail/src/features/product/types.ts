import type { RetailSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다.
 * ------------------------------------------------------------------------ */

export type ListingDetailWire = RetailSchema<"ListingDetailResponse">;
export type ColorOptionWire = RetailSchema<"ColorOption">;
export type VariantWire = RetailSchema<"Variant">;
export type AddCartItemRequest = RetailSchema<"AddCartItemRequest">;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`의 `toProductDetail(wire)`로만 만든다.
 *
 * 목록의 `CatalogProduct`(`features/catalog`)와 겹치는 필드가 있지만 **같은 타입을
 * 쓰지 않는다** — feature끼리 직접 import 하지 않는 규칙이기도 하고, 목록과 상세는
 * 실제로 다른 응답(`ListingSummaryResponse` / `ListingDetailResponse`)이다.
 * ------------------------------------------------------------------------ */

/** 도매처 카드에 서는 값 */
export interface DetailWholesaler {
  /** `String(wholesaler.id)`. 도매처 홈 주소에 실린다 */
  id: string;
  name: string;
  /** 상호 첫 글자 — 이미지가 없어 이니셜 사각형으로 대신한다 */
  initial: string;
  /** `청평화패션몰 2층 24호` — `storeBuilding` + `storeUnit`. 둘 다 없으면 빈 문자열 */
  location: string;
}

/**
 * 게시된 조합 한 줄 = SKU 하나(`Variant`).
 *
 * **재고 수치가 없다**(게이트 Q1, 2026-08-31). 스펙도 재고를 안 내린다 — "접수는
 * 재고를 보지 않고 모자라면 미송으로 잡힌다". `soldOut`(재고 소진 · 미송 가능)
 * 신호도 스펙에 없어 항상 false다. 배지 자리는 남겨 두고 값이 오면 켠다.
 */
export interface OptionRow {
  /** `String(variant.id)`. 수량 입력이 이 키를 쓴다 */
  skuId: string;
  /** 장바구니에 담을 때 보내는 값(`AddCartItemRequest.variantId`) */
  variantId: number;
  size: string;
  /** 판매가. 조합마다 다르다 — 화면에서 고칠 수 없다 */
  price: number;
  /** 재고 소진 · 미송 가능. 스펙에 없어 항상 false */
  soldOut: boolean;
  /** 1회 주문당 최대. 0이면 무제한. 화면은 아직 `shared/qty`의 상수 500만 본다(§5) */
  orderLimit: number;
}

/** 색상 하나와 그 아래 사이즈 행들 */
export interface ColorGroup {
  /** `ListingColor.id`. 그룹의 React key */
  colorId: number;
  /** `#RRGGBB` — 서버가 준다. 팔레트 조회가 없다 */
  hex: string;
  /** 색상 이름(`ListingColor.name`). 그룹 머리에 그대로 찍힌다 */
  displayName: string;
  /** **도매처가 마켓에 올린 조합만** 있다. 안 올린 조합은 아예 줄이 없다(스펙) */
  rows: OptionRow[];
}

export interface ProductDetail {
  /** `String(listingId)` */
  id: string;
  name: string;
  /** 품번. 스펙은 숫자(`productNumber`)라 `SU-18` 같은 접두어가 없다 */
  code: string;
  /** 루트 → 리프. 스펙은 "항상 3단"이지만 배열이라 길이를 믿지 않는다 */
  categoryPath: string[];
  wholesaler: DetailWholesaler;
  /** 사진 주소. `sortOrder` 순으로 서버가 정렬해 준다 */
  images: string[];
  priceMin: number;
  priceMax: number;
  colorGroups: ColorGroup[];
  /** 지금 살 수 있는 옵션 수(`listedVariantCount`) */
  listedCount: number;
  /**
   * 색상 × 사이즈로 만들 수 있는 조합 수 **전부**(게시하지 않은 것 포함,
   * `totalVariantCount`). `총 5개 조합 · 전체 15개 중 도매처가 마켓에 올린 것만`의 뒷숫자다.
   */
  totalSkuCount: number;
}

/** `장바구니 담기`가 보낼 것 하나. 수량이 0인 조합은 여기 없다 */
export type CartItemDraft = AddCartItemRequest;

/**
 * 조합 여럿을 하나씩 보낸 결과. **부분 성공은 실패가 아니라 결과다** — 하나가
 * 죽었다고 전체를 reject하면 이미 담긴 조합을 화면이 모르고, 다시 누르면 같은
 * SKU가 또 들어간다(서버는 합산). 장바구니 회차의 `BatchResult`와 같은 계약이다.
 */
export interface AddToCartResult {
  /** 서버가 받아 준 것. 보낸 순서다 */
  done: readonly CartItemDraft[];
  /** 거절됐거나 못 닿은 것과 그 이유. 보낸 순서다 */
  failed: readonly { input: CartItemDraft; error: unknown }[];
}
