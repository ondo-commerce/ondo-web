/** 사이즈 축. 상품마다 쓰는 값이 다르지만 목록 자체는 고정이다 */
export type SizeName = "Free" | "XS" | "S" | "M" | "L" | "XL" | "2XL";

/** 게시글 상태. 시즌 종료는 삭제가 아니라 마켓 노출만 내린 상태다 */
export type PostStatus = "ON_SALE" | "SEASON_ENDED";

/**
 * 게시 상태를 **한 축으로 볼 때의 3값.** `NONE`은 게시글이 아직 없는 상태
 * (`Product.post === null`)라 `PostStatus`에는 들어갈 수 없다 — 게시글이 없으면
 * 그 게시글의 상태도 없기 때문이다.
 *
 * 그런데 목록의 `게시` 열과 필터는 그 셋을 **한 칸에서 같이** 읽어야 한다.
 * 그 시선을 이름 붙인 것이 이 타입이다. 필터 전용이 아니라 배지·상세도 같이 쓴다.
 */
export type PostStatusKey = PostStatus | "NONE";

export interface ColorOption {
  /** 고정 팔레트 26종 중 하나. 자유 입력이 아니다 — 필터·집계의 기준값 */
  name: string;
  /** 팔레트에서 가져온 표시색 */
  hex: string;
  /**
   * 노출용 이름 (자유 텍스트, 예: "뉴욕 블랙").
   * 도매 현장의 자유로운 색 이름은 팔레트가 아니라 여기가 받는다.
   */
  displayName?: string;
  /** 사진은 색상 단위로 1장이다 */
  imageUrl?: string;
}

/** SKU = 색상 × 사이즈. 무늬 축은 없다 */
export interface Sku {
  id: string;
  code: string;
  color: string;
  size: SizeName;
  /**
   * 현재고(stockOnHand) — 창고에 실제로 있는 수량. 0이면 빨강으로 표시한다.
   *
   * ⚠️ 팔 수 있는 수량이 아니다. 마켓에 노출되는 값은 아래 두 필드를 뺀
   *    판매가능(availableQty = stock − reservedQty − backorderQty)이고,
   *    그 계산은 재고 탭의 derive.ts 한 곳에서만 한다.
   */
  stock: number;
  /** 주문처리중(reservedQty) — 주문이 잡혀 빠져나갈 예정이라 이미 묶인 수량 */
  reservedQty: number;
  /** 미송대기(backorderQty) — 팔았지만 아직 못 보낸 수량. 현재고보다 클 수 있다 */
  backorderQty: number;
  /** 주문 제한 재고 (게시글에 붙는 값) */
  orderLimit: number;
  /** 입고 이력으로 갱신되는 값. 화면에서 수정하지 않는다 */
  avgCost: number;
  /** 판매가 (게시글에 붙는 값) */
  price: number;
  /** 평균원가와 판매가에서 나오는 파생값. 서버가 내려준다 */
  marginRate: number;
}

/**
 * 게시글 = 온도 마켓 노출 단위. 상품과 분리된 리소스다.
 * 판매가·주문제한·이미지·낱장 여부는 상품이 아니라 게시글에 붙는다.
 */
export interface Post {
  id: string;
  name: string;
  description: string;
  /** 첫 번째가 대표 이미지다 */
  images: string[];
  /** 낱장 등록 — 첫 구매시 1장 구매 허용 */
  allowSinglePiece: boolean;
  status: PostStatus;
}

/** 상품 = ERP 재고의 단위 */
export interface Product {
  id: string;
  /** 품명 */
  name: string;
  /** 품번 (SU-18 형태) */
  code: string;
  /** 대 > 중 > 소 3단 */
  category: [string, string, string];
  colors: ColorOption[];
  skus: Sku[];
  /** 아직 마켓에 게시하지 않았으면 null */
  post: Post | null;
}
