import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response/Request 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 *
 * 재고 목록·SKU 재고는 **상품 응답**을 그대로 읽는다(스펙: "재고탭 SKU 표가 모두 이 응답을 쓴다").
 * 재고 전용 응답은 입고·조정·변동 이력 셋뿐이다.
 * ------------------------------------------------------------------------ */

export type ProductSummary = WholesaleSchema<"ProductSummaryResponse">;
export type ProductDetail = WholesaleSchema<"ProductDetailResponse">;
export type Variant = WholesaleSchema<"VariantResponse">;
/** 변동 이력 한 줄. 조정 201 응답도 같은 모양이다 */
export type StockMovement = WholesaleSchema<"StockMovementResponse">;
export type InboundCreateRequest = WholesaleSchema<"InboundCreateRequest">;
export type InboundItemRequest = WholesaleSchema<"InboundItemRequest">;
export type InboundCreated = WholesaleSchema<"InboundCreatedResponse">;
export type StockAdjustmentRequest = WholesaleSchema<"StockAdjustmentRequest">;
export type SkuSize = Variant["size"];

/**
 * 재고가 움직인 이유 — 스펙 enum `IN | OUT | ADJUST` 그대로.
 * 라벨만 재고 탭에서 다르다(glossary §4.5): 이 탭 안에서만 `OUT`을 "출고"라고 부르고,
 * 밖에서 "출고"는 주문 이행을 뜻한다.
 */
export type StockMovementType = StockMovement["type"];

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/**
 * 수량 4종 묶음. 색상 그룹 접힘 행·상품 행은 SKU 하나가 아니라 합계라서
 * `InventorySkuView`를 그대로 쓰지 못한다 — 합계 함수가 둘 다 받게 하려고 이 모양으로 좁힌다.
 *
 * `availableQty`는 **서버 값**이다(`VariantResponse.availableQty`). fixtures 시절엔
 * 화면이 `현재고 − 주문처리중 − 미송대기`로 계산했지만 이제 마켓에 노출되는 값을 서버가 준다.
 * 합계 행은 서버 값끼리 더한다 — 같은 공식이면 같은 결과다.
 */
export interface StockQuantities {
  /** 현재고(stockQty) */
  stock: number;
  /** 주문처리중(allocatedQty) */
  reservedQty: number;
  /** 미송대기(backorderQty) */
  backorderQty: number;
  /** 판매가능. 음수일 수 있다 — 0으로 감추지 않는다(§7 Q4) */
  availableQty: number;
}

/** SKU = 색상 × 사이즈. 무늬 축은 없다 */
export interface InventorySkuView extends StockQuantities {
  /** variant id. 입고·조정·이력 요청의 키 */
  id: number;
  /** `상품번호-SKU번호`(`1-3`). 스펙이 숫자 둘이라 SKU 코드 문자열은 없다 */
  code: string;
  colorId: number;
  color: string;
  /** 서버가 내려주는 표시색. 색 점(`ColorDot`)이 쓴다 */
  colorHex: string;
  size: SkuSize;
  /** 평균원가. 입고 이력으로 서버가 갱신한다 — 화면에서 계산하지 않는다 */
  avgCost: number;
}

/** 재고 목록의 상품 하나 — 상세 응답(`GET /products/{id}`)에서 나온다. 색상 순·사이즈 순은 서버 보장 */
export interface InventoryProductView {
  id: number;
  /** 품번. 스펙은 숫자(`productNumber`)라 화면엔 숫자만 보인다 */
  code: string;
  name: string;
  skus: InventorySkuView[];
}

/** 변동 이력 한 줄 */
export interface StockMovementView {
  id: number;
  /** `2026.09.07`(KST). 정렬은 파싱이 아니라 배열 순서(서버 시간 역순)로 한다 */
  date: string;
  type: StockMovementType;
  beforeQty: number;
  /** 부호 있는 변동량. 출고·차감 조정이면 음수다 */
  deltaQty: number;
  afterQty: number;
}

/* ------------------------------------------------------------------------
 * 입력
 * ------------------------------------------------------------------------ */

/**
 * 입고 처리 한 줄. 확인 다이얼로그를 거쳐 한 번에 반영한다.
 * 모드 A는 여러 줄, 모드 B는 한 줄을 만든다 — 요청으로 바꾸는 코드는 하나다.
 */
export interface InboundEntry {
  variantId: number;
  /** 입고수량. 0이나 빈칸인 줄은 여기까지 오지 않는다 */
  qty: number;
  /**
   * 매입단가. **비워 둘 수 있다.** 비우면 요청에서 `unitCost`를 뺀다 —
   * 평균원가 재계산은 서버 몫이다(glossary §3.1). 서버가 빈 단가를 받는지는 미확인(04-wire §3).
   */
  unitPrice: number | null;
}

/** 입력칸은 문자열로 들고 있는다 — 빈칸과 0을 구분해야 해서 숫자로 바로 못 바꾼다 */
export interface InboundInput {
  qty: string;
  unitPrice: string;
}

/**
 * SKU별 입고 입력(variant id → 칸). **모드 A와 모드 B가 같은 값을 본다** — 같은 SKU의
 * 입고수량·매입단가는 어느 카드에서 적었든 하나다. 상품을 접었다 펴거나 SKU 행을
 * 눌렀다 돌아와도 적은 값이 남는다(inventory Q-01·Q-02).
 */
export type InboundDrafts = Record<number, InboundInput | undefined>;

/** 입고 요청의 칸 이름 = 요청 DTO 필드명. `toFieldErrors`가 이 이름으로 서버 오류를 붙인다 */
export type InboundField = keyof InboundCreateRequest;
