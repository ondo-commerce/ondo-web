import { isApiError } from "@ondo/api";
import { describeError } from "@/shared/api/describeError";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_SETTLEMENT_STATUSES,
  LINE_FILTER_ALL,
  ORDER_ERROR_TEXT,
  PAGE_SIZE,
  STATUS_FILTER_ALL,
  type OrderFilterValue,
  type SettlementFilterValue,
} from "./constants";
import type {
  LineFilter,
  OrderConfirmRequest,
  OrderDetail,
  OrderFilter,
  OrderFilterKey,
  OrderItem,
  OrderLineView,
  OrderRowView,
  OrderStatus,
  OrderSummary,
  OrderView,
  PackingBatchView,
  PackingCreateRequest,
  PackingItem,
  PackingQueueItem,
  SettlementStatus,
  ShipInputs,
} from "./types";

/*
 * 주문 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 공식이 목록 행·우측 카드·라인 표·확인 다이얼로그에서 쓰이는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다.
 *
 * wire → 뷰 변환도 여기다. 화면은 wire 모양을 모른다.
 */

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/** KST 고정. 사장의 브라우저 시간대가 어디든 동대문 날짜로 읽혀야 한다 */
const ORDER_DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `2024.08.01`. `Intl`이 주는 `2024. 08. 01.`을 화면 표기로 바꾼다 */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    ORDER_DATE_FORMAT.formatToParts(date).find((p) => p.type === type)?.value ??
    "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

/**
 * 목록 `상품명` 셀 — `첫 라인 상품명 (색상) 외 N건`.
 * 앞부분은 서버가 만들어 준다(`summaryProductName`). 라인이 1개면 `외 N건`이 붙지 않는다.
 */
export function orderProductSummary(summary: OrderSummary): string {
  const rest = summary.additionalItemCount;
  return rest > 0
    ? `${summary.summaryProductName} 외 ${rest}건`
    : summary.summaryProductName;
}

export function toOrderRowView(summary: OrderSummary): OrderRowView {
  return {
    id: summary.id,
    orderNumber: String(summary.orderNumber),
    orderedAt: formatOrderDate(summary.orderedAt),
    retailerName: summary.retailerName,
    productSummary: orderProductSummary(summary),
    orderAmount: summary.orderAmount,
    status: summary.status.key,
    settlementStatus: summary.settlementStatus,
  };
}

export function toOrderLineView(item: OrderItem): OrderLineView {
  return {
    id: item.id,
    variantId: item.variantId,
    sku: String(item.variantNumber),
    productName: item.productName,
    color: item.color,
    size: item.size,
    qty: item.qty,
    allocatedQty: item.allocatedQty,
    shippedQty: item.shippedQty,
    unallocatedQty: item.unallocatedQty,
    backorderQty: item.backorderQty,
    availableQty: item.variantAvailableQty,
    unitPrice: item.unitPrice,
  };
}

export function toOrderView(detail: OrderDetail): OrderView {
  return {
    id: detail.id,
    orderNumber: String(detail.orderNumber),
    orderedAt: formatOrderDate(detail.orderedAt),
    retailerName: detail.retailerName,
    // 스펙엔 nullable이 없어 타입은 string이지만 전화 없는 거래처는 null이 온다
    retailerPhone: detail.retailerPhone ?? null,
    paymentMethod: detail.expectedPaymentMethod,
    receiveBy: detail.receiveBy,
    status: detail.status.key,
    settlementStatus: detail.settlementStatus,
    orderAmount: detail.orderAmount,
    totalQty: detail.totalQty,
    lines: (detail.items ?? []).map(toOrderLineView),
    isConfirmable: detail.isConfirmable,
    isCancellable: detail.isCancellable,
    isPackable: detail.isPackable,
  };
}

/** 포장 대기열 줄 표기 — `상품명 (색상 - 사이즈)`. SKU 코드가 아니다(Figma 실측) */
export function packingItemLabel(
  item: Pick<PackingItem, "productName" | "color" | "size">,
): string {
  return `${item.productName} (${item.color} - ${item.size})`;
}

/**
 * 포장 대기열 → 회차 카드. **만든 순서(오름차순)로 돌려준다** — 그리는 쪽이 뒤집는다.
 *
 * 회차 번호는 서버에 없다. 만든 순서 위치로 매기므로 `#2`를 지우면 옛 `#3`이 `#2`가 된다.
 * 더미 시절 규칙("번호는 재사용하지 않는다")은 서버가 번호를 주기 전엔 지킬 수 없다(04-wire.md §3).
 */
export function toPackingBatchViews(
  items: readonly PackingQueueItem[],
): PackingBatchView[] {
  return [...items]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    .map((packing, index) => ({
      id: packing.id,
      no: index + 1,
      isCancellable: packing.isCancellable,
      lines: (packing.items ?? []).map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        label: packingItemLabel(item),
        qty: item.qty,
      })),
    }));
}

/**
 * 필터 칩의 건수. `GET /orders/filters` 응답에서 키로 찾는다.
 * 서버가 그 키를 안 내리면 `null` — 괄호 없이 라벨만 그린다. 0으로 지어내지 않는다.
 */
export function chipCount(
  filters: readonly OrderFilter[],
  key: OrderFilterKey,
): number | null {
  return filters.find((f) => f.key === key)?.count ?? null;
}

/**
 * 배지 색. **파랑·회색 2색뿐이다** — 상태가 5종이어도 색을 늘리지 않는다.
 * 목록 행과 우측 카드가 같은 규칙을 쓰도록 여기 한 곳에서만 정한다.
 */
export function orderStatusTone(status: OrderStatus): "active" | "done" {
  return ACTIVE_ORDER_STATUSES.includes(status) ? "active" : "done";
}

/** 정산 배지도 같은 2색 규칙 — 받을 돈이 남았으면 파랑 */
export function settlementStatusTone(
  status: SettlementStatus,
): "active" | "done" {
  return ACTIVE_SETTLEMENT_STATUSES.includes(status) ? "active" : "done";
}

/* ------------------------------------------------------------------------
 * 목록 쿼리
 * ------------------------------------------------------------------------ */

/** 화면의 목록 상태. 세그먼트 둘 + 검색어 + 페이지(1-base) */
export interface OrderListParams {
  q: string;
  status: OrderFilterValue;
  settlement: SettlementFilterValue;
  page: number;
}

/** 서버에 보낼 쿼리. queryKey에 그대로 들어간다 */
export interface OrderListQuery {
  filter: OrderFilterValue | undefined;
  q: string | undefined;
  settlementStatus: SettlementStatus | undefined;
  /** 0-base */
  page: number;
  size: number;
}

/** `ALL`·빈 검색은 파라미터를 안 보낸다 — 서버 기본값이 곧 그 뜻이다 */
export function toListQuery(params: OrderListParams): OrderListQuery {
  return {
    filter: params.status === STATUS_FILTER_ALL ? undefined : params.status,
    q: params.q === "" ? undefined : params.q,
    settlementStatus:
      params.settlement === STATUS_FILTER_ALL ? undefined : params.settlement,
    page: params.page - 1,
    size: PAGE_SIZE,
  };
}

/* ------------------------------------------------------------------------
 * 라인 표의 파생값. Figma 3프레임의 숫자를 역산해 확정한 공식이다(01-pm.md §1.4).
 * `n` = `이번 출고` 입력값이고, 입력이 없으면 n = 0이라 before와 after가 같아진다.
 * ---------------------------------------------------------------------- */

/**
 * 가용재고. 서버가 SKU 스코프로 내려준다(`variantAvailableQty` = 재고 − 예약).
 * 더미 시절엔 `현재고 − 주문처리중`을 화면이 계산했고 그 정의가 glossary와 충돌해
 * 보류(게이트 G-1)됐는데, 서버 계약이 값을 직접 주는 것으로 닫혔다.
 */
export function assignableQty(line: OrderLineView): number {
  return line.availableQty;
}

/** 미할당 = 주문수량 − 출고진행. **미송을 포함한 값이다**(01-pm.md §1.4). 서버 값 */
export function unallocatedQty(line: OrderLineView): number {
  return line.unallocatedQty;
}

/** 출고진행: `alloc → alloc + n` */
export function allocatedAfter(line: OrderLineView, n: number): number {
  return line.allocatedQty + n;
}

/** 미할당: `u → u − n` */
export function unallocatedAfter(line: OrderLineView, n: number): number {
  return unallocatedQty(line) - n;
}

/** 가용재고: `avail → avail − n` */
export function assignableAfter(line: OrderLineView, n: number): number {
  return assignableQty(line) - n;
}

/** 미송: `bo → bo − min(n, bo)`. 미송이 없는 라인에서는 그대로 0이다 */
export function backorderAfter(line: OrderLineView, n: number): number {
  return line.backorderQty - Math.min(n, line.backorderQty);
}

/** 전량 할당된 라인. 입력칸 대신 완료 ✓가 들어간다 */
export function isLineAllocated(line: OrderLineView): boolean {
  return unallocatedQty(line) === 0;
}

/** 가용재고가 0이라 지금은 아무것도 못 빼는 라인. 입력칸이 비활성이 된다 */
export function isLineOutOfStock(line: OrderLineView): boolean {
  return assignableQty(line) <= 0;
}

/**
 * 수량을 입력할 수 있는 국면인가. **서버 boolean으로만 판단한다**(스펙) —
 * 확정할 수 있거나(신규) 포장을 더 만들 수 있으면(확정·부분 출고 잔량) 입력을 받는다.
 * 취소·출고 완료는 둘 다 false라 읽기 전용이다.
 */
export function canAllocate(order: OrderView): boolean {
  return order.isConfirmable || order.isPackable;
}

/**
 * 숫자 입력칸의 문자열 → 수량.
 * 빈칸과 0을 구분해야 해서 빈칸은 null이다 — "안 적었다"와 "0을 적었다"는 다르다.
 * **숫자 아닌 글자가 섞이면 `undefined`** — 걸러서 이어 붙이면(`1.5` → `15`) 더 큰 수가
 * 되므로(F-04) 그 입력은 통째로 버린다.
 */
export function parseNumberInput(raw: string): number | null | undefined {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

/** 입력 맵(라인 id → 입력 문자열)에서 그 라인의 수량을 꺼낸다. 안 적었으면 0 */
export function shipQty(inputs: ShipInputs, line: OrderLineView): number {
  return parseNumberInput(inputs[line.id] ?? "") ?? 0;
}

/* ------------------------------------------------------------------------
 * 라인 필터. 표가 무엇을 보여 주는지와 요청이 무엇을 읽는지가 **같은 함수**를 거친다 —
 * 표만 거르고 요청은 입력 맵 전체를 읽으면 필터로 가린 라인의 수량이 사장 모르게
 * 확정된다(F10). 그래서 필터는 표 안 useState가 아니라 액션까지 닿는 곳에 있다.
 * ---------------------------------------------------------------------- */

/** 이 라인이 지금 필터로 보이는가 */
export function isLineVisible(
  line: OrderLineView,
  filter: LineFilter,
): boolean {
  return (
    (filter.color === LINE_FILTER_ALL || line.color === filter.color) &&
    (filter.size === LINE_FILTER_ALL || line.size === filter.size)
  );
}

/** 표에 그릴 라인 */
export function visibleLines(
  order: OrderView,
  filter: LineFilter,
): OrderLineView[] {
  return order.lines.filter((line) => isLineVisible(line, filter));
}

/**
 * 요청·미리보기·합계가 읽는 수량. **가려진 라인은 안 적은 것으로 본다**(0).
 * 화면에 없는 값은 요청에도 없어야 사장이 본 것과 서버가 받는 것이 같다.
 */
export function sentShipQty(
  inputs: ShipInputs,
  line: OrderLineView,
  filter: LineFilter,
): number {
  return isLineVisible(line, filter) ? shipQty(inputs, line) : 0;
}

/**
 * 필터로 가려졌는데 입력이 남아 있는 라인 수.
 * 0이 아니면 액션 줄이 확정·포장을 잠그고 이 수를 보인다 — 조용히 버리지 않는다.
 * 사장이 색상별로 번갈아 적어 둔 값을 필터를 풀면 전부 되살릴 수 있어야 하기 때문이다.
 */
export function hiddenInputCount(
  order: OrderView,
  inputs: ShipInputs,
  filter: LineFilter,
): number {
  return order.lines.filter(
    (line) => !isLineVisible(line, filter) && shipQty(inputs, line) > 0,
  ).length;
}

/** 보이는 라인의 입력 합계. 0이면 포장 준비를 눌러도 담을 것이 없다 */
export function totalShipQty(
  order: OrderView,
  inputs: ShipInputs,
  filter: LineFilter,
): number {
  return order.lines.reduce(
    (sum, line) => sum + sentShipQty(inputs, line, filter),
    0,
  );
}

/**
 * `이번 출고` 입력 상한 = `min(미할당, 가용재고)`.
 * 둘 중 하나라도 넘기면 서버가 `ALLOCATION_EXCEEDS_ORDER`·`INSUFFICIENT_STOCK`으로 되돌린다.
 * 화면에서 먼저 자르는 이유는 항등식이 깨진 숫자를 사장이 보고 있게 두지 않기 위해서다.
 */
export function shipCap(line: OrderLineView): number {
  return Math.max(0, Math.min(unallocatedQty(line), assignableQty(line)));
}

/**
 * 입력칸 문자열을 상한으로 자른다. 빈칸은 빈칸으로 둔다(0과 구분).
 * 숫자가 아니면 `null` — 부르는 쪽이 그 키 입력을 무시한다(직전 값이 남는다).
 */
export function clampShipInput(
  line: OrderLineView,
  raw: string,
): string | null {
  const parsed = parseNumberInput(raw);
  if (parsed === undefined) return null;
  if (parsed === null) return "";
  return String(Math.min(parsed, shipCap(line)));
}

/** 확정 다이얼로그에 띄울 미송 예고 */
export interface BackorderPreview {
  /** 미송이 잡히는 SKU 수 */
  skuCount: number;
  /** 미송 합계(장) */
  totalQty: number;
}

/**
 * 지금 입력 상태로 확정하면 미송이 얼마나 잡히는가.
 * **입력하지 않은 잔량은 전부 미송이 된다** — 스펙("배분되지 않은 잔량은 전부 미송")과
 * Figma 프레임 1913:6060의 제목이 같은 규칙이다.
 * 가려진 라인은 안 적은 것으로 세므로(`sentShipQty`) 요청 본문과 같은 숫자가 나온다.
 */
export function backorderPreview(
  order: OrderView,
  inputs: ShipInputs,
  filter: LineFilter,
): BackorderPreview {
  return order.lines.reduce<BackorderPreview>(
    (acc, line) => {
      const rest = unallocatedAfter(line, sentShipQty(inputs, line, filter));
      return rest > 0
        ? { skuCount: acc.skuCount + 1, totalQty: acc.totalQty + rest }
        : acc;
    },
    { skuCount: 0, totalQty: 0 },
  );
}

/* ------------------------------------------------------------------------
 * 요청 본문. 더미 시절엔 여기서 새 주문 객체를 만들었다 — 이제 서버가 상태를 바꾸고
 * 화면은 입력을 요청으로 옮기기만 한다.
 * ---------------------------------------------------------------------- */

/**
 * 주문 확정 요청. **전 라인을 담는다** — 안 적은 라인은 `allocateQty: 0`(전량 미송).
 * 스펙: "`items`는 주문의 전 라인 필수, `allocateQty: 0`은 정상값". 빠뜨리면
 * `ORDER_ITEM_MISSING`이다. 필터로 가려진 라인도 담기는 하되 수량은 0이다.
 */
export function toConfirmRequest(
  order: OrderView,
  inputs: ShipInputs,
  filter: LineFilter,
): OrderConfirmRequest {
  return {
    items: order.lines.map((line) => ({
      orderItemId: line.id,
      allocateQty: sentShipQty(inputs, line, filter),
    })),
  };
}

/**
 * 포장 준비 요청. **적은 라인만 담는다** — 스펙: "배분할 라인만 담고 `allocateQty >= 1`".
 * 확정과 반대 규칙이라 함수를 따로 둔다.
 */
export function toPackingRequest(
  order: OrderView,
  inputs: ShipInputs,
  filter: LineFilter,
): PackingCreateRequest {
  return {
    items: order.lines
      .map((line) => ({
        orderItemId: line.id,
        allocateQty: sentShipQty(inputs, line, filter),
      }))
      .filter((item) => item.allocateQty >= 1),
  };
}

/* ------------------------------------------------------------------------
 * 오류 문구
 * ---------------------------------------------------------------------- */

/**
 * 확정·취소·포장·삭제가 거절됐을 때 액션 줄에 붙일 한 줄.
 *
 * 순서: `VALIDATION_FAILED`면 칸별 사유를 이어 붙인다(이 화면엔 폼 칸이 없어 `_form`
 * 하나로 본다) → 아는 코드면 `ORDER_ERROR_TEXT` → 나머지는 `describeError`의 종류별
 * 제목에 서버 문구를 덧붙인다. **`message`로 가르지 않는다** — 코드로만 가른다.
 */
export function actionErrorText(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === WHOLESALE_ERROR_CODE.VALIDATION_FAILED) {
      const reasons = error.fieldErrors.map((f) => f.message);
      return reasons.length > 0 ? reasons.join(" ") : error.message;
    }
    const known = ORDER_ERROR_TEXT[error.code];
    if (known !== undefined) return known;
  }
  const described = describeError(error);
  return described.detail
    ? `${described.title} (${described.detail})`
    : described.title;
}

/**
 * 서버 상태와 어긋나서 거절된 것인가(409·404). 이때는 화면이 든 값이 낡은 것이라
 * 다시 불러와야 한다 — 문구만 보이고 길이 없으면 같은 버튼을 다시 눌러 같은 답을 본다(F3, #198).
 * 재고·출고·정산 `derive.ts`에 같은 함수가 있지만 **복사해 왔다** — feature 경계를 넘어 import 하지 않는다.
 */
export function isStaleRejection(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

/**
 * 포장 `삭제`가 거절됐을 때의 문구. 409 뒤 재조회로 그 포장이 `isCancellable=false`가 됐으면
 * 이미 봉투에 담긴 것이라 "다시 눌러라"가 아니라 이유만 말한다 — 버튼은 이미 잠겨 있다(fix F4).
 * 목이 `DOCUMENT_FROZEN` 대신 `TRANSITION_NOT_ALLOWED`를 내도 같은 문구다.
 */
export function packingCancelErrorText(
  error: unknown,
  batch: PackingBatchView | undefined,
): string {
  if (batch !== undefined && !batch.isCancellable) {
    return ORDER_ERROR_TEXT.DOCUMENT_FROZEN ?? actionErrorText(error);
  }
  return actionErrorText(error);
}
