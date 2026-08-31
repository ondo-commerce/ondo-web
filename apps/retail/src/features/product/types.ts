/**
 * 상품 상세 한 장이 쓰는 값.
 *
 * 목록의 `CatalogProduct`(`features/catalog`)와 겹치는 필드가 있지만 **같은 타입을
 * 쓰지 않는다** — feature끼리 직접 import 하지 않는 규칙이기도 하고, 서버가 붙으면
 * 목록과 상세는 서로 다른 응답을 받을 자리다. 목록은 카드 한 장에 필요한 요약만
 * 갖고, 여기는 조합별 판매가까지 갖는다.
 */

/** 사이즈 축. 도매 상품 마스터와 같은 목록이다 */
export type SizeName = "Free" | "XS" | "S" | "M" | "L" | "XL" | "2XL";

/**
 * 마켓에서의 노출 상태.
 * - `ON_SALE` 주문할 수 있다
 * - `SEASON_ENDED` 시즌이 끝났다. 다시 올라오지 않는다
 * - `UNPUBLISHED` 도매처가 게시만 내렸다. 다시 올라올 수 있다
 *
 * 뒤 둘은 **주문이 잠긴다는 결과가 같고 문구가 다르다.**
 */
export type ListingStatus = "ON_SALE" | "SEASON_ENDED" | "UNPUBLISHED";

/** 도매처 카드에 서는 값 */
export interface DetailWholesaler {
  id: string;
  name: string;
  initial: string;
  location: string;
}

/**
 * 게시된 조합 한 줄 = SKU 하나.
 *
 * **재고 수치가 없다**(게이트 Q1, 2026-08-31). 판매가능(= 현재고 − 주문처리중 −
 * 미송대기)을 소매에 숫자로 줄지가 아직 미결정이라, 지금은 "재고가 없지만 미송으로
 * 주문은 된다"는 사실만 boolean으로 온다.
 */
export interface OptionRow {
  /** 색상/사이즈로 만든 SKU 키. 수량 입력이 이 키를 쓴다 */
  skuId: string;
  size: SizeName;
  /** 판매가. 조합마다 다르다 — 화면에서 고칠 수 없다 */
  price: number;
  /** 재고 소진 · 미송 가능. 수량은 그래도 넣을 수 있다 */
  soldOut: boolean;
}

/** 색상 하나와 그 아래 사이즈 행들 */
export interface ColorGroup {
  /** 고정 팔레트 26종 중 하나. 필터·집계의 기준값이다 */
  color: string;
  /** 노출용 색상 표기(자유 텍스트). 도매 현장의 색 이름이 여기 들어온다 */
  displayName: string;
  /** **도매처가 마켓에 올린 조합만** 있다. 안 올린 조합은 아예 줄이 없다 */
  rows: OptionRow[];
}

export interface ProductDetail {
  id: string;
  name: string;
  /** 품번 (SU-18 형태) — 게이트 Q3 */
  code: string;
  /** 대 > 중 > 소 3단 (게이트 Q2). 브레드크럼이 이 셋을 그대로 그린다 */
  category: [string, string, string];
  wholesaler: DetailWholesaler;
  /** 사진 장수. 실제 자산이 없어 개수만 안다 — 갤러리는 회색 슬롯을 그린다 */
  imageCount: number;
  status: ListingStatus;
  colorGroups: ColorGroup[];
  /**
   * 색상 × 사이즈로 만들 수 있는 조합 수 **전부**(게시하지 않은 것 포함).
   * `총 5개 조합 · 전체 15개 중 도매처가 마켓에 올린 것만`의 뒷숫자다.
   */
  totalSkuCount: number;
}
