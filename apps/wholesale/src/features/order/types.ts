import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response/Request 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 * ------------------------------------------------------------------------ */

/** 목록 한 행. 라인이 없다 — 펼치면 상세를 따로 부른다 */
export type OrderSummary = WholesaleSchema<"OrderSummaryResponse">;
/** 상세. 확정·취소 응답도 이 스키마다(스펙: "재조회 없이 화면을 갱신한다") */
export type OrderDetail = WholesaleSchema<"OrderDetailResponse">;
export type OrderItem = WholesaleSchema<"OrderItemResponse">;
/** 상태 칩 하나. `key`가 목록 `filter` 파라미터의 값이다 */
export type OrderFilter = WholesaleSchema<"OrderFilterResponse">;
export type OrderConfirmRequest = WholesaleSchema<"OrderConfirmRequest">;
export type PackingCreateRequest = WholesaleSchema<"PackingCreateRequest">;
export type AllocationItemRequest = WholesaleSchema<"AllocationItemRequest">;
export type PackingQueueItem = WholesaleSchema<"PackingQueueItemResponse">;
export type PackingItem = WholesaleSchema<"PackingItemResponse">;
export type PackingCreated = WholesaleSchema<"PackingCreatedResponse">;

/**
 * 주문 이행 상태 5종 — 스펙 enum 그대로다. glossary §4.3의 `PLACED`·`CANCELED`는
 * 서버에 없다(`NEW`·`CANCELLED`). 화면 라벨(`신규 주문` …)은 constants.ts의 표에만 둔다.
 *
 * `PARTIALLY_SHIPPED`·`SHIPPED`로 가는 전이는 주문 탭에서 만들 수 없다 — 출고 탭 몫이다.
 * 서버가 출고 진행도로 파생해 내려준다(스펙 설명).
 */
export type OrderStatus = WholesaleSchema<"OrderStatusResponse">["key"];
/** 상태 칩 키. 상태 5종 + `ALL` */
export type OrderFilterKey = OrderFilter["key"];
/** 정산 상태 3종. 화면 문구는 `미결제 · 부분 정산 · 정산 완료`(glossary §5.1) */
export type SettlementStatus = OrderSummary["settlementStatus"];
export type PaymentMethod = OrderDetail["expectedPaymentMethod"];
/** 수령 방식. `AGENT` = 사입삼촌, `RETAILER` = 직접 수령 */
export type ReceiveBy = OrderDetail["receiveBy"];
export type OrderLineSize = OrderItem["size"];

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/** 목록 행. 표 7열에 필요한 것만 */
export interface OrderRowView {
  id: number;
  /** `orderNumber`를 문자열로. 스펙이 숫자라 `ORD-001` 같은 표기는 없다 */
  orderNumber: string;
  /** `2024.08.01` 표시 문자열(KST) */
  orderedAt: string;
  retailerName: string;
  /** `첫 라인 상품명 (색상) 외 N건` */
  productSummary: string;
  orderAmount: number;
  status: OrderStatus;
  settlementStatus: SettlementStatus;
}

/**
 * 주문 라인 한 줄.
 *
 * **수량 항등식: `qty = allocatedQty + unallocatedQty`, 확정된 주문에서는 `unallocatedQty = backorderQty`.**
 * 화면의 `미할당` 열은 미송을 포함한 값이라 둘이 같은 숫자로 두 자리에 그려진다(01-pm.md §1.4).
 * 미할당·미송은 서버가 내려주는 값이다 — 화면에서 빼기 하지 않는다.
 */
export interface OrderLineView {
  /** 곧 `orderItemId`. 확정·포장 요청의 키 */
  id: number;
  variantId: number;
  /** `variantNumber`를 문자열로. SKU 칩에 그린다 */
  sku: string;
  productName: string;
  color: string;
  size: OrderLineSize;
  /** 주문수량 */
  qty: number;
  /** 출고진행 — 포장 대기로 잡혔거나 이미 나간 수량 */
  allocatedQty: number;
  /** 이미 출고 완료된 수량. 주문 탭에서는 바뀌지 않는다 */
  shippedQty: number;
  /** 미할당 = 주문수량 − 출고진행. 서버 값 */
  unallocatedQty: number;
  /** 미송대기 — 팔았지만 못 내보내기로 확정한 수량 */
  backorderQty: number;
  /**
   * 가용재고 — SKU 스코프(재고 − 예약). 라인이 아니라 SKU의 값이라 같은 SKU가 두 줄이면
   * 두 줄에 같은 숫자가 온다. 게이트 G-1이 보류했던 정의를 서버 계약이 정했다.
   */
  availableQty: number;
  unitPrice: number;
}

/** 주문 한 건(상세). 우측 카드·펼침 라인 표·액션 줄이 전부 이걸 본다 */
export interface OrderView {
  id: number;
  orderNumber: string;
  orderedAt: string;
  retailerName: string;
  /** 시드 거래처는 전화가 없어 null이 온다(생성 타입은 string). 화면은 `-` */
  retailerPhone: string | null;
  paymentMethod: PaymentMethod;
  receiveBy: ReceiveBy;
  status: OrderStatus;
  settlementStatus: SettlementStatus;
  /** 서버 합계. 라인을 더하지 않는다 */
  orderAmount: number;
  totalQty: number;
  lines: OrderLineView[];
  /** 버튼 노출은 이 셋으로만 판단한다(스펙). 상태 코드로 가르지 않는다 */
  isConfirmable: boolean;
  isCancellable: boolean;
  isPackable: boolean;
}

/** 포장 대기 회차 카드의 한 줄 — `상품명 (색상 - 사이즈)` / 수량 */
export interface PackingBatchLineView {
  id: number;
  orderItemId: number;
  label: string;
  qty: number;
}

/**
 * 포장 대기 회차(= 포장 하나). 서버에 회차 번호가 없어 `no`는 만든 순서로 매긴다 —
 * 지우면 뒤 번호가 당겨진다(04-wire.md §3).
 */
export interface PackingBatchView {
  id: number;
  no: number;
  /** 삭제 버튼 활성 조건. 출고에 잡힌 포장은 여기서 못 지운다 */
  isCancellable: boolean;
  lines: PackingBatchLineView[];
}

/** `이번 출고` 입력값. 라인 id → 문자열. 빈칸과 0을 구분하려고 문자열로 든다 */
export type ShipInputs = Readonly<Record<number, string>>;

/** 주문별 `이번 출고` 입력. 주문 id → 그 주문의 입력 맵. 접었다 펴도·다른 주문을 갔다 와도 남는다(#199) */
export type ShipInputsByOrder = Readonly<
  Record<number, ShipInputs | undefined>
>;

/**
 * 라인 표의 색상·사이즈 필터. `LINE_FILTER_ALL`이면 그 축은 안 건 것이다.
 * 표 안에 두지 않고 밖으로 올린 이유: 확정·포장 요청이 **이 필터를 알아야 한다** —
 * 가려진 라인의 입력이 요청에 실리면 사장은 보지 않은 수량을 확정하게 된다(F10).
 */
export interface LineFilter {
  readonly color: string;
  readonly size: string;
}
