import type { WholesalePaths, WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response/Request 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 *
 * 용어 대응: 화면의 `포장 대기 줄` = 서버 `packing item`, 화면의 `포장 묶음(PKG)` = 서버
 * `outbound`(봉투), 화면의 `장끼` = `statement`.
 * ------------------------------------------------------------------------ */

/** 포장 대기 소매처 한 행(아코디언 머리). 페이징 없음 */
export type PackingRetailer = WholesaleSchema<"PackingRetailerResponse">;
/** 포장 대기 한 줄. `id`가 `POST /outbounds`의 `packingItemIds[]` */
export type PackingRow = WholesaleSchema<"PackingItemRowResponse">;
/** 출고 소매처 한 행. `NOT_SHIPPED`·`SHIPPED` 두 단계가 같은 스키마 */
export type OutboundRetailer = WholesaleSchema<"OutboundRetailerResponse">;
/** 봉투 목록 한 행. status 필드가 없다 — 출고 완료는 `shippedAt != null`(스펙 설명) */
export type OutboundSummary = WholesaleSchema<"OutboundSummaryResponse">;
export type OutboundCreateRequest = WholesaleSchema<"OutboundCreateRequest">;
export type OutboundCreated = WholesaleSchema<"OutboundCreatedResponse">;
/** 상세. 출고 확정(`POST …/ship`) 응답도 이 스키마다(스펙: "응답은 출고 상세와 동일 스키마") */
export type OutboundDetail = WholesaleSchema<"OutboundDetailResponse">;
export type OutboundItem = WholesaleSchema<"OutboundItemResponse">;
export type Statement = WholesaleSchema<"StatementResponse">;
export type StatementItem = WholesaleSchema<"Item">;

/**
 * 수령 방식 2종 — 스펙 enum 그대로. `RETAILER` = 직접 수령, `AGENT` = 사입삼촌.
 * **택배는 없다** — 배송은 사입삼촌 영역이라 도매처가 관리하는 단계가 아니다(glossary §4.3 G7).
 * 화면 라벨(`직접 수령` …)은 constants.ts의 표에만 둔다.
 */
export type ReceiveBy = PackingRow["receiveBy"];

/** 출고 목록·소매처 목록의 `status` 파라미터. 화면 단계(`packed`/`shipped`)가 이 값으로 바뀐다 */
export type OutboundStatus = NonNullable<
  NonNullable<
    WholesalePaths["/api/wholesale/outbounds/retailers"]["get"]["parameters"]["query"]
  >["status"]
>;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/**
 * 출고 탭의 3단계. **라우트가 아니라 한 화면의 상태다** — 좌측 셸(검색줄·칩 줄·
 * 소매처 아코디언)이 세 단계에서 픽셀 단위로 같고, 표의 열과 우측 패널만 바뀐다.
 * 그래서 `/shipments/packed` 같은 하위 라우트를 만들지 않는다.
 */
export type ShipmentStage = "ready" | "packed" | "shipped";

/**
 * 소매처. 관리 화면이 아직 없어서 이 탭에서는 읽기만 한다(screen_spec §9.5).
 * 소매처 코드는 없다 — BE가 `retailerCode`를 응답에서 지웠다(2026-09-08 스펙, "도매 API 연동 안내").
 */
export interface RetailerView {
  id: number;
  name: string;
}

/** 아코디언 한 행. 단계별 소매처 응답을 이 모양으로 좁혀 표에 넘긴다 — 표는 단계를 모른다 */
export interface RetailerRowView {
  retailer: RetailerView;
  /** 건수. 단위는 단계가 정한다 — 포장 대기는 대기 줄, 나머지는 봉투 */
  count: number;
  qty: number;
}

/** 포장 대기 한 줄(표·포장 작업 패널·선택 스냅샷이 같이 쓴다) */
export interface PackingRowView {
  id: number;
  /** `품번-SKU번호`(`1-4`). 서버에 SKU 코드 문자열이 없다(04-wire §3) */
  sku: string;
  productName: string;
  receiveBy: ReceiveBy;
  /** 표시용 `9/7 08:00`(KST) */
  orderedAt: string;
  /** 정렬용 원본(ISO). 표시 문자열로 정렬하면 `10/1`이 `9/7`보다 앞에 온다 */
  orderedAtIso: string;
  orderId: number;
  /** `orderNumber`를 문자열로. `ORD-1001` 같은 표기는 서버에 없다 */
  orderNumber: string;
  qty: number;
}

/**
 * 체크한 대기 줄. **id가 아니라 행 스냅샷**을 든다 — 검색으로 목록에서 빠져도 우측 패널이
 * 무엇을 골랐는지 계속 보여야 해서다(shipments F3 · #198 계열).
 */
export type PackingSelection = Readonly<Record<number, PackingRowView>>;

/** 봉투 목록 한 행. 출고 대기·출고 완료 표가 같이 쓴다 */
export interface OutboundRowView {
  id: number;
  /** `#N`. 서버 `outboundNumber`에 코드 문자열이 없어 붙인 표기 */
  label: string;
  /** `첫 상품명 외 N건` */
  summary: string;
  receiveBy: ReceiveBy;
  createdAt: string;
  createdAtIso: string;
  /** 출고 전이면 null. 출고 완료 판정도 이 값이다(스펙 설명) */
  shippedAt: string | null;
  shippedAtIso: string | null;
  /** 서버 합계 */
  totalQty: number;
}

/** 상세의 품목 한 줄. **SKU 단위로 합쳐져 있다**(스펙) — 주문이 둘이어도 같은 SKU면 한 줄 */
export interface OutboundLineView {
  variantId: number;
  sku: string;
  productName: string;
  qty: number;
}

/** 봉투 상세. 포장 상세 패널이 본다 */
export interface OutboundView {
  id: number;
  label: string;
  retailerId: number;
  retailerName: string;
  /** `9월 7일 08:00` */
  createdAt: string;
  lines: OutboundLineView[];
  totalQty: number;
  /** 버튼 활성 판정용(스펙: 성공 보장은 아니다 — 재고 검증이 안 들어 있다) */
  isShippable: boolean;
  shippedAt: string | null;
  /** `JG-YYYYMMDD-NNN`. 출고 전엔 null */
  statementCode: string | null;
}

export interface StatementLineView {
  productName: string;
  /** `색상 / 사이즈` */
  option: string;
  qty: number;
}

/**
 * 장끼 = 거래명세표. **시스템이 발행하는 문서**이고 영수증·세금계산서와 다른 것이다(glossary §5).
 * 서버 `StatementResponse`를 카드 모양으로 바꾼 것. 금액 칸이 없다(스펙: "금액 컬럼 없음").
 */
export interface StatementView {
  statementCode: string;
  outboundLabel: string;
  shippedAt: string;
  /** 물건을 낸 도매처 자신. 라벨은 `도매처` — `판매처`는 폐기어(glossary §2.1) */
  sellerName: string;
  /** 소매처 코드·배송지는 없다 — BE가 `retailerCode`·`deliveryAddress`를 장끼에서 지웠다(2026-09-08 스펙) */
  retailerName: string;
  receiveBy: ReceiveBy;
  lines: StatementLineView[];
  totalQty: number;
}

/**
 * 뮤테이션이 끝난 뒤 우측에 남기는 한 줄. 포장·출고 둘 다 성공하면 패널이 내려가므로
 * (선택이 풀린다) 빈 자리 안내 옆에 이 문구를 둔다 — 안 그러면 처리됐는지 알 길이 없다(shipments F9).
 *
 * `refreshed`가 false면 서버는 받았는데 목록 재조회가 실패한 것 — 옛 목록을 보고 한 번 더
 * 누르는 길을 막으려고 문구를 바꾸고 버튼을 잠근다(wire-inventory F2).
 */
export type ShipmentNotice =
  | { kind: "packed"; outboundLabel: string; refreshed: boolean }
  | { kind: "shipped"; statementCode: string; refreshed: boolean };

/** `POST /outbounds` 요청의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸으로 간다 */
export type OutboundCreateField = keyof OutboundCreateRequest;
