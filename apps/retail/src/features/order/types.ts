import type { RetailSchema } from "@ondo/api";

/**
 * 주문 도메인 타입.
 *
 * **`shared/`가 아니라 여기 있다.** 이 폴더를 지우면 주문서·주문 완료·주문
 * 내역·주문 상세가 통째로 사라져야 한다(`docs/02-folder-structure.md` 원칙 2).
 *
 * **`features/cart`를 import 하지 않는다.** 주문서가 읽는 것은 서버의
 * `GET /checkout`(장바구니에서 고른 `cartItemIds`)이고, 장바구니 화면은 그 id를
 * 주소(`/checkout?ids=`)에 실어 넘길 뿐이다.
 */

/* ────────────────────────────────────────────────────────────────────────
   wire — 스냅샷에서 생성한 타입의 별칭. 손으로 쓴 Response 타입은 없다(ADR-0002).
   소매 스펙은 `nullable`을 안 적어서 전부 non-optional로 보인다 — null이 오는
   자리(계좌 3필드 · `shippedAt` · `expectedInboundDate` · 접수 실패 건의 `amount`
   등)는 읽는 쪽(`derive.ts`의 `toXxx`)이 `?? null`로 좁힌다.
   ──────────────────────────────────────────────────────────────────────── */

export type CheckoutWire = RetailSchema<"CheckoutResponse">;
export type CheckoutGroupWire = RetailSchema<"CheckoutGroup">;
export type CheckoutItemWire = RetailSchema<"CheckoutItem">;
export type WholesalerWithBankWire = RetailSchema<"WholesalerWithBank">;
export type PlaceOrderRequest = RetailSchema<"PlaceOrderRequest">;
export type WholesalerOptionWire = RetailSchema<"WholesalerOption">;
export type PlaceOrderResult = RetailSchema<"PlaceOrderResponse">;
export type PlaceOrderLegResult = RetailSchema<"PlaceOrderResult">;
export type OrderSummaryWire = RetailSchema<"OrderSummaryResponse">;
export type OrderDetailWire = RetailSchema<"OrderDetailResponse">;
export type WholesalerOrderWire = RetailSchema<"WholesalerOrder">;
export type OrderItemWire = RetailSchema<"OrderItem">;
export type OutboundWire = RetailSchema<"Outbound">;
export type CancelOrderRequest = RetailSchema<"CancelOrderRequest">;
export type CancelOrderResult = RetailSchema<"CancelOrderResponse">;
export type CancelOrderLegResult = RetailSchema<"CancelOrderResult">;

/**
 * 수령 2종. **택배가 없다** — 동대문 도매는 직접 가져가거나 사입삼촌이 대신
 * 간다(glossary). 값은 스펙 enum(`ReceiveMethod`) 그대로다: `RETAILER`(직접 수령) ·
 * `AGENT`(사입삼촌 방문).
 */
export type PickupMethod = WholesalerOptionWire["receiveMethod"];

/**
 * 결제 2종. 둘 다 **안내**일 뿐이다 — 소매는 금액을 쓰지만 돈을 움직이지 않고
 * 입금 확인은 도매처가 건별로 한다(게이트 D2). 값은 스펙 enum(`PaymentTerm`)
 * 그대로다: `CASH`(현금) · `BANK_TRANSFER`(계좌 이체).
 */
export type PaymentMethod = WholesalerOptionWire["paymentTerm"];

/**
 * 도매처별 드롭다운이 들고 있는 값.
 *
 * `"BULK"`는 방법이 아니라 **"일괄 설정을 따른다"는 상태**다. 이걸 값으로 두지
 * 않고 일괄 값을 복사해 넣으면, 일괄 설정을 바꿨을 때 따라와야 할 도매처와
 * 따로 정한 도매처를 구분할 수 없다 — `전체 적용`이 무엇을 되돌리는지도
 * 말할 수 없게 된다.
 */
export type PickupChoice = PickupMethod | "BULK";
export type PaymentChoice = PaymentMethod | "BULK";

/**
 * 통합 주문 한 줄에 뜨는 배지. **서버가 정한다**(`OrderSummaryResponse.actionBadge`).
 *
 * 도매처가 둘인데 하나는 확정, 하나는 출고 중이면 "이 주문의 상태"라는 게 없다 —
 * 그래서 서버는 상태 이름 대신 **지금 사장이 할 일**을 준다. 화면은 표기만 붙인다
 * (`constants.ORDER_STATUS_LABEL`). fixtures 시절 `derive.orderStatus`가 하던 판정은
 * 서버로 갔다.
 */
export type OrderStatus = OrderSummaryWire["actionBadge"];

/**
 * 도매처별 입금 계좌. **셋이 전부 null이면 미등록**이고 그 도매처는 계좌 이체를
 * 못 고른다 — 화면이 현금만 남긴다(스펙 `WholesalerWithBank`).
 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  holder: string;
}

/* ────────────────────────────────────────────────────────────────────────
   주문서 · 완료 — 도매처 상자(`WholesalerOrderCard`)가 읽는 모양
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 상자 안 명세 한 줄이 갖는 최소 모양. 주문서의 `CheckoutLine`과 상세의
 * `OrderLine`이 둘 다 이 모양이라 같은 상자(`WholesalerOrderCard`)를 쓴다.
 */
export interface ProductLine {
  productName: string;
  /** 노출용 색상 표기(자유 텍스트). 팔레트 키가 아니라 도매 현장의 색 이름이다 */
  colorLabel: string;
  size: string;
  price: number;
  qty: number;
}

/**
 * 주문서에 오르는 조합 한 줄 = SKU 하나(색상 × 사이즈). `GET /checkout`의
 * `CheckoutItem` 하나다.
 *
 * **단가는 여기서 다시 받은 값이다** — 담아둔 사이에 도매가 가격을 올렸으면
 * 장바구니 화면 금액과 다를 수 있다(스펙). 수량 입력칸이 없는 화면이라(RT-37)
 * 수량도 서버 값 그대로다.
 */
export interface CheckoutLine extends ProductLine {
  /** `String(cartItemId)`. React key */
  lineId: string;
  /** 접수(`POST /orders`)에 그대로 넘긴다 */
  cartItemId: number;
  variantId: number;
  wholesalerId: string;
}

/** 도매처 하나의 상자. 서버가 도매처별로 묶어 주고 계좌까지 같이 온다 */
export interface CheckoutGroup {
  /** `String(wholesaler.id)`. 접수 요청의 `wholesalerOptions[].wholesalerId`로 돌아간다 */
  wholesalerId: string;
  wholesalerName: string;
  /** `storeBuilding storeUnit`. 사입삼촌에게 넘길 주소라 화면마다 같아야 한다 */
  wholesalerLocation: string;
  /** null이면 계좌 미등록 — 이 도매처는 현금만 된다 */
  bank: BankAccount | null;
  lines: readonly CheckoutLine[];
}

/**
 * 접수 요청을 보냈는데 **안 된 도매처**. `PlaceOrderResponse.results[]` 중
 * `isAccepted: false`인 것이다.
 *
 * 완료 화면은 `GET /orders/{id}`로 그리는데, 안 된 도매처는 주문에 안 만들어져
 * 그 응답에 없다 — 그래서 접수 응답에서 이것만 세션 스토어에 남긴다. 다시
 * 주문서로 갈 때 필요한 `cartItemIds`는 주문서가 알고 있던 값을 같이 붙인다.
 */
export interface RejectedLeg {
  wholesalerId: string;
  wholesalerName: string;
  /** 서버가 준 문구. 화면에 그대로 쓴다 */
  message: string;
  /** 이 도매처에 보내려던 장바구니 줄. 장바구니에 그대로 남아 있다(스펙) */
  cartItemIds: readonly number[];
}

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 주문 내역 · 주문 상세가 읽는 모양
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 주문 내역 한 줄 = `OrderSummaryResponse` 하나.
 *
 * **도매처별 건·라인·장끼가 없다** — 서버가 통합 주문서를 한 줄로 요약해 준다.
 * 상태 배지·장수·금액을 서버 값 그대로 쓰고, 화면은 더하지 않는다.
 */
export interface OrderSummary {
  /** 상세 주소(`/orders/{orderId}`)에 쓰는 id */
  orderId: number;
  /** 화면에 보여주는 통합 주문번호 `20260902-1420-0088` */
  orderNo: string;
  /** `2026.09.02 14:20` (KST) */
  orderedAt: string;
  /** 정렬용 epoch ms. `orderedAt`은 글자라 비교에 못 쓴다 */
  orderedAtMs: number;
  totalAmount: number;
  totalQty: number;
  /** 그중 받은 장수 */
  receivedQty: number;
  /** 아직 못 받은 장수 */
  backorderQty: number;
  wholesalerCount: number;
  wholesalerNames: readonly string[];
  status: OrderStatus;
}

/**
 * 통합 주문 안의 도매처 한 건 = `WholesalerOrder`.
 *
 * 상태(`statusKey`·`statusLabel`)는 **도매가 주는 것을 그대로 쓴다** — 같은
 * 주문을 두 화면이 다르게 부르면 안 된다(스펙 `Status`). 수령·결제는 주문할 때
 * 고른 값이라 확정 전에도 있다.
 */
export interface OrderLeg {
  /** 취소할 때 보내는 값 */
  wholesaleOrderId: number;
  wholesalerId: string;
  wholesalerName: string;
  /** `storeBuilding storeUnit`. **라인 표와 결제 패널이 같은 이 값을 읽는다** */
  wholesalerLocation: string;
  bank: BankAccount | null;
  /** 도매처별 연번. 통합 번호와 같이 보인다(RT-40) */
  legNo: number;
  /** NEW / CONFIRMED / PARTIALLY_SHIPPED / SHIPPED / CANCELLED — 분기에 쓴다 */
  statusKey: string;
  /** 화면에 그대로 쓰는 한글 이름 */
  statusLabel: string;
  canceled: boolean;
  /** 서버 판정. `statusKey`가 NEW일 때만 true */
  cancellable: boolean;
  pickup: PickupMethod;
  payment: PaymentMethod;
}

/**
 * 라인(SKU) 하나의 상태. **수량 셋(`qty`·`receivedQty`·`backorderQty`)과 도매처 건의
 * 상태에서 화면이 판정한다**(`derive.lineStatus`) — 서버 층 3은 "수량으로 말한다"
 * (스펙 `OrderDetailResponse`).
 *
 * `PARTIAL`·`PREPARING`이 fixtures 시절보다 늘었다. 한 줄이 일부만 받은 상태와,
 * 확정은 됐는데 아직 아무것도 안 나간 상태가 서버 데이터에 있기 때문이다.
 */
export type OrderLineStatus =
  | "SHIPPED"
  | "READY"
  | "BACKORDER"
  | "PARTIAL"
  | "PENDING"
  | "PREPARING"
  | "CANCELED";

/** 주문 라인 한 줄 = SKU 하나. 값은 **주문 시점 스냅샷**이라 지금 판매가와 다를 수 있다 */
export interface OrderLine extends ProductLine {
  /** `${wholesaleOrderId}-${index}`. 스펙에 라인 id가 없어 자리로 만든다 */
  lineId: string;
  wholesalerId: string;
  /** 상품 상세로 가는 게시글 id(`listingId`). 찜 집합의 키이기도 하다 */
  productId: string;
  receivedQty: number;
  backorderQty: number;
  /** 미송 예상 입고일 `YYYY-MM-DD`. 아직 없으면 null */
  expectedInboundDate: string | null;
  status: OrderLineStatus;
}

/** 장끼 한 장에 실리는 품목 */
export interface ShipmentLine extends ProductLine {
  /**
   * 스펙 `OutboundItem`에 단가가 없다. 같은 도매처 건의 주문 라인에서 상품·색·사이즈로
   * 찾아 채우고(`derive.toOrderDetail`), 못 찾으면 0이고 `priceKnown`이 false다 —
   * 그 장끼의 금액은 `—`로 그린다.
   */
  priceKnown: boolean;
}

/**
 * 출고 한 건 = 거래명세서(장끼) 한 장 = `Outbound`.
 *
 * **시스템이 자동 발행하고 고칠 수 없다**(RT-54). 미수는 이 시점에 생긴다(RT-64) —
 * 주문 금액 전체가 미수가 아니다.
 */
export interface Shipment {
  outboundId: number;
  statementNo: string;
  wholesalerId: string;
  /** `2026.09.02 08:20`. **null이면 포장만 끝난 상태**다(스펙) */
  shippedAt: string | null;
  lines: readonly ShipmentLine[];
}

/** 주문 상세 한 장 = `OrderDetailResponse` */
export interface OrderRecord {
  orderId: number;
  orderNo: string;
  /** `2026.09.02 14:20` (KST) */
  orderedAt: string;
  /** 사입삼촌. 도매처가 여럿이어도 사람은 하나다. 직접 수령만이면 빈 문자열 */
  agentName: string;
  agentPhone: string;
  legs: readonly OrderLeg[];
  lines: readonly OrderLine[];
  shipments: readonly Shipment[];
}

/**
 * `주문 취소`가 잠긴 이유 4종. **판정은 `derive.cancelLockReason`이 한다.**
 *
 * 사유마다 문구가 따로 있어야 한다 — 한 벌로 두면 이미 취소된 주문에까지
 * `확정돼서 잠겼어요`가 떠서 머리 배지(`취소됨`)와 정면으로 부딪친다(F3).
 */
export type CancelLock = "CANCELED" | "SHIPPED" | "CONFIRMED" | "EMPTY";

/** 주문 내역 툴바의 3축. 전부 주소에 실린다 */
export interface OrderFilter {
  period: string;
  /** 도매처 **상호**. 요약 응답에 도매처 id가 없어 이름이 곧 값이다 */
  wholesaler: string;
  status: string;
}

export type OrderSort = "latest" | "oldest";

/** 서버 페이지 위치. 목록 한 장(`size=100`)이 화면 하나다 */
export interface OrderPage {
  /** 1-base. 주소의 `?page=`와 같다 */
  page: number;
  totalPages: number;
  totalElements: number;
}
