import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";

/**
 * 주문·포장 목 — BE `V900__seed_dev.sql`(MUL-110, dev 배포 시드)을 그대로 옮겼다.
 *
 * 주문 API는 스텁이 아니라 실구현(MUL-47)이라 `*StubExamples.java`가 없다. 스펙 자동 조립은
 * 주문 1건·라인 1줄·수량 0이라 확정 흐름을 볼 수 없어서, 시드의 주문 5건·라인 5줄을 옮긴다.
 * **값을 지어내지 않는다** — id·주문번호·거래처·상품·색상·사이즈·수량·단가·재고 전부 시드다.
 *
 * 시드와 다른 것 둘, 둘 다 머리에 적는다:
 *  1. 시드의 주문 5건은 도매처 3곳(101·102·103) 것이다. 이 목은 소유를 안 가리고 5건을
 *     다 내린다 — 한 도매처(101)만 보면 신규 주문이 없어 확정·취소를 못 본다.
 *     그래서 주문번호가 `1`이 셋이다(도매처별 연번).
 *  2. 시드의 `ordered_at`은 `now() - interval`이라 절대값이 없다. 기준일 2026-09-07(KST)로 박았다.
 *
 * 응답 모양은 스펙(`WholesaleSchema`)이 지킨다. 상태·버튼·수량 파생은 스펙 설명
 * (`isConfirmable`… boolean, "배분되지 않은 잔량은 전부 미송", "배분은 재고를 줄이지 않는다")을
 * 따라 여기서 흉내 낸다 — 확정 → 포장 → 삭제가 한 세션 안에서 이어져야 화면을 검증할 수 있다.
 * 새로고침하면 시드로 돌아간다.
 */

type OrderStatusKey = WholesaleSchema<"OrderStatusResponse">["key"];
type FilterKey = WholesaleSchema<"OrderFilterResponse">["key"];
type Size = WholesaleSchema<"OrderItemResponse">["size"];

/** `OrderStatusRule.LABELS` 그대로 */
const STATUS_LABEL: Record<OrderStatusKey, string> = {
  NEW: "신규 주문",
  CONFIRMED: "주문 확정",
  PARTIALLY_SHIPPED: "부분 출고",
  SHIPPED: "출고 완료",
  CANCELLED: "주문 취소",
};

/** 칩 순서 — 서버 `CHIP_ORDER` 그대로. 배열 순서가 곧 칩 표시 순서 */
const CHIP_ORDER: readonly FilterKey[] = [
  "ALL",
  "NEW",
  "CONFIRMED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "CANCELLED",
];

/** DB 저장값은 3개뿐이다. 표시 5값은 출고 진행도로 파생한다(스펙 설명) */
type StoredStatus = "NEW" | "CONFIRMED" | "CANCELLED";

interface MockLine {
  id: number;
  variantId: number;
  productNumber: number;
  variantNumber: number;
  productName: string;
  color: string;
  size: Size;
  unitPrice: number;
  qty: number;
  allocatedQty: number;
  shippedQty: number;
  /** `wholesale.variant.stock_qty` */
  stockQty: number;
  /** OPEN 미송이 붙어 있는가. 있으면 `backorderQty = 미할당` */
  hasOpenBackorder: boolean;
}

export interface MockOrder {
  id: number;
  orderNumber: number;
  orderedAt: string;
  /** `partner.retailer_id`. 봄봄상회 1 · 대기상회 2 (V900) — 출고 목이 소매처별로 자른다 */
  retailerId: number;
  retailerName: string;
  paymentMethod: WholesaleSchema<"OrderDetailResponse">["expectedPaymentMethod"];
  receiveBy: WholesaleSchema<"OrderDetailResponse">["receiveBy"];
  status: StoredStatus;
  items: MockLine[];
  /**
   * 입금 배정액 합(`payment_allocation`). 정산 목(`./settlement`)의 `POST /payments`가 올린다.
   * 정산 상태·미수 잔액은 여기서 파생한다 — 시드(V900)엔 입금이 없어 전부 0
   */
  allocatedAmount: number;
}

/**
 * 포장. `READY`는 출고 탭 포장 대기 줄로 보이고, 봉투(`outbound`)에 담기면 `PACKED`가 된다 —
 * 그때부터 주문 탭에서 취소할 수 없다(BE `PackingStatus` 주석). 봉투는 출고 목(`./shipment`)이 든다.
 */
export interface MockPacking {
  id: number;
  orderId: number;
  createdAt: string;
  status: "READY" | "PACKED";
  /** 담긴 봉투. `READY`면 null */
  outboundId: number | null;
  items: { id: number; orderItemId: number; qty: number }[];
}

export type MockOrderLine = MockLine;

/* --- 시드 --------------------------------------------------------------- */

/** `wholesale.variant` + `product` + `color_option` → `common.color`(V5). 주문에 쓰인 4개만 */
const VARIANT = {
  3002: {
    productNumber: 1,
    variantNumber: 2,
    productName: "빈티지 플라워 셔츠",
    color: "레드",
    size: "M",
    stockQty: 35,
  },
  3003: {
    productNumber: 1,
    variantNumber: 3,
    productName: "빈티지 플라워 셔츠",
    color: "레드",
    size: "L",
    stockQty: 0,
  },
  3011: {
    productNumber: 1,
    variantNumber: 4,
    productName: "와이드 데님 팬츠",
    color: "소라",
    size: "M",
    stockQty: 6,
  },
  3019: {
    productNumber: 1,
    variantNumber: 2,
    productName: "린넨 셋업 자켓",
    color: "베이지",
    size: "L",
    stockQty: 4,
  },
} as const satisfies Record<
  number,
  Omit<
    MockLine,
    | "id"
    | "variantId"
    | "unitPrice"
    | "qty"
    | "allocatedQty"
    | "shippedQty"
    | "hasOpenBackorder"
  >
>;

function line(
  id: number,
  variantId: keyof typeof VARIANT,
  qty: number,
  unitPrice: number,
  allocatedQty: number,
  shippedQty: number,
  hasOpenBackorder: boolean,
): MockLine {
  return {
    id,
    variantId,
    ...VARIANT[variantId],
    qty,
    unitPrice,
    allocatedQty,
    shippedQty,
    hasOpenBackorder,
  };
}

/** `wholesale.orders` + `order_item` + `backorder`(OPEN 여부). 거래처는 `partner.retailer_name` */
function seedOrders(): MockOrder[] {
  return [
    {
      id: 7001,
      orderNumber: 1,
      orderedAt: "2026-09-04T10:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      paymentMethod: "CASH",
      receiveBy: "AGENT",
      status: "CONFIRMED",
      // 재고 0이라 통째로 미송
      items: [line(8001, 3003, 4, 13500, 0, 0, true)],
      allocatedAmount: 0,
    },
    {
      id: 7002,
      orderNumber: 1,
      orderedAt: "2026-09-06T10:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      paymentMethod: "BANK_TRANSFER",
      receiveBy: "RETAILER",
      status: "CONFIRMED",
      items: [line(8002, 3011, 1, 31000, 0, 0, true)],
      allocatedAmount: 0,
    },
    {
      id: 7003,
      orderNumber: 1,
      orderedAt: "2026-09-07T08:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      paymentMethod: "CASH",
      receiveBy: "AGENT",
      status: "NEW",
      // 시드는 신규 주문에도 OPEN 미송을 심어 뒀다(9003). 그대로 옮긴다
      items: [line(8003, 3019, 2, 45000, 0, 0, true)],
      allocatedAmount: 0,
    },
    {
      id: 7004,
      orderNumber: 2,
      orderedAt: "2026-09-02T10:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      paymentMethod: "CASH",
      receiveBy: "AGENT",
      status: "CONFIRMED",
      // 다 받았다. 미송이 해소된 줄(RESOLVED)
      items: [line(8004, 3002, 3, 12500, 3, 3, false)],
      allocatedAmount: 0,
    },
    {
      id: 7005,
      orderNumber: 3,
      orderedAt: "2026-09-05T10:00:00+09:00",
      retailerId: 2,
      retailerName: "대기상회",
      paymentMethod: "CASH",
      receiveBy: "RETAILER",
      status: "CONFIRMED",
      items: [line(8005, 3003, 9, 13500, 0, 0, true)],
      allocatedAmount: 0,
    },
  ];
}

/* --- 상태 --------------------------------------------------------------- */

/**
 * 시드에서 유일하게 출고까지 끝난 줄(7004 · allocated 3 = shipped 3)의 포장. V900엔 포장 행이 없지만
 * `shipped_qty = 3`이 곧 "봉투에 담겨 나갔다"라 여기서 복원한다 — 출고 목이 이 포장을 봉투 `8801`
 * (BE 스텁의 출고 id)에 담아 출고 완료 탭의 유일한 시드로 쓴다. 포장 시각은 주문 다음 날로 둔다(시드에 없음).
 */
export const SEED_SHIPPED_OUTBOUND_ID = 8801;
export const SEED_SHIPPED_PACKING_CREATED_AT = "2026-09-03T10:00:00+09:00";
/** 시드 봉투 8801의 출고 시각(포장 다음 날, 가정값). 출고 목의 봉투와 정산 목의 판매 원장 줄이 같은 값을 본다 */
export const SEED_SHIPPED_AT = "2026-09-04T10:00:00+09:00";

function seedPackings(): MockPacking[] {
  return [
    {
      id: 9100,
      orderId: 7004,
      createdAt: SEED_SHIPPED_PACKING_CREATED_AT,
      status: "PACKED",
      outboundId: SEED_SHIPPED_OUTBOUND_ID,
      items: [{ id: 9200, orderItemId: 8004, qty: 3 }],
    },
  ];
}

let orders = seedOrders();
/** 시드 포장은 위 1건뿐이다. 나머지는 확정·포장 준비가 만든다 */
let packings: MockPacking[] = seedPackings();
let nextPackingId = 9101;
let nextPackingItemId = 9201;

/* --- 출고 목이 쓰는 문 ----------------------------------------------------
 * 포장·주문 상태는 이 모듈이 든다. 출고 목(`./shipment`)은 이 함수들로만 읽고 바꾼다 —
 * 배열을 직접 export 하면 `let` 재할당(reset) 뒤 옛 배열을 쥔 쪽이 생긴다.
 * ----------------------------------------------------------------------- */

export function mockOrders(): readonly MockOrder[] {
  return orders;
}

export function mockPackings(): readonly MockPacking[] {
  return packings;
}

/** 포장 분할(스펙: "대기열에 남는 쪽 id 유지, 나가는 쪽이 새 포장")로 생긴 새 포장을 등록한다 */
export function addMockPacking(packing: Omit<MockPacking, "id">): MockPacking {
  const created = { ...packing, id: nextPackingId++ };
  packings.push(created);
  return created;
}

/**
 * 소매처. `partner.retailer_name`뿐이라 코드·주소는 없다 — 시드에 없는 값은 빈 문자열로 둔다
 * (지어내지 않는다). 거래 이력 없는 id는 null(스펙: 404).
 */
export function mockRetailer(
  retailerId: number,
): { id: number; name: string; code: string } | null {
  const order = orders.find((o) => o.retailerId === retailerId);
  return order ? { id: retailerId, name: order.retailerName, code: "" } : null;
}

/**
 * 출고 확정 — 재고가 실제로 줄어드는 유일한 지점(스펙). 그 포장의 줄마다 `shippedQty`를 올리고,
 * 같은 SKU를 가진 모든 라인의 재고 복사본을 함께 내린다(라인이 SKU 재고를 각자 들고 있어서).
 */
export function shipMockPacking(packing: MockPacking): void {
  const order = orders.find((o) => o.id === packing.orderId);
  if (!order) return;
  for (const item of packing.items) {
    const l = order.items.find((x) => x.id === item.orderItemId);
    if (!l) continue;
    l.shippedQty += item.qty;
    for (const o of orders)
      for (const other of o.items)
        if (other.variantId === l.variantId) other.stockQty -= item.qty;
  }
}

/** 주문 금액 = Σ 수량 × 단가. 정산 목이 배분 상한(미수)을 잴 때도 쓴다 */
export function mockOrderAmount(order: MockOrder): number {
  return sum(order.items, (l) => l.qty * l.unitPrice);
}

/**
 * 주문 하나의 정산 파생값 — 스펙 설명이 없어 가정한 규칙(04-wire §3): 미수 = 주문 금액 − 배정액,
 * 상태는 배정액이 0이면 `UNPAID`, 주문 금액 미만이면 `PARTIALLY_SETTLED`, 채우면 `SETTLED`.
 */
export function mockOrderSettlement(order: MockOrder): {
  settlementStatus: WholesaleSchema<"OrderSummaryResponse">["settlementStatus"];
  outstandingAmount: number;
} {
  const amount = mockOrderAmount(order);
  const outstanding = Math.max(amount - order.allocatedAmount, 0);
  return {
    settlementStatus:
      order.allocatedAmount <= 0
        ? "UNPAID"
        : order.allocatedAmount < amount
          ? "PARTIALLY_SETTLED"
          : "SETTLED",
    outstandingAmount: outstanding,
  };
}

/** 입금 배정 — 정산 목의 `POST /payments`가 검증을 끝낸 뒤 부른다. 상한 검증은 부르는 쪽 */
export function allocateMockPayment(order: MockOrder, amount: number): void {
  order.allocatedAmount += amount;
}

/* --- 파생 (서버 규칙을 스펙 설명대로) ------------------------------------ */

function sum(items: readonly MockLine[], pick: (l: MockLine) => number) {
  return items.reduce((acc, l) => acc + pick(l), 0);
}

function statusKey(order: MockOrder): OrderStatusKey {
  if (order.status !== "CONFIRMED") return order.status;
  const total = sum(order.items, (l) => l.qty);
  const shipped = sum(order.items, (l) => l.shippedQty);
  if (shipped === 0) return "CONFIRMED";
  return shipped < total ? "PARTIALLY_SHIPPED" : "SHIPPED";
}

function flags(order: MockOrder) {
  const key = statusKey(order);
  const isNew = key === "NEW";
  const packable =
    order.status === "CONFIRMED" &&
    key !== "SHIPPED" &&
    sum(order.items, (l) => l.allocatedQty) < sum(order.items, (l) => l.qty);
  return {
    key,
    isConfirmable: isNew,
    isCancellable: isNew,
    isPackable: packable,
  };
}

/** 가용재고 = 재고 − 예약(잡혔지만 아직 안 나간 수량). SKU 스코프 */
function availableQty(l: MockLine): number {
  return l.stockQty - (l.allocatedQty - l.shippedQty);
}

function itemResponse(l: MockLine): WholesaleSchema<"OrderItemResponse"> {
  const unallocated = l.qty - l.allocatedQty;
  return {
    id: l.id,
    variantId: l.variantId,
    productNumber: l.productNumber,
    variantNumber: l.variantNumber,
    productName: l.productName,
    color: l.color,
    size: l.size,
    unitPrice: l.unitPrice,
    qty: l.qty,
    allocatedQty: l.allocatedQty,
    shippedQty: l.shippedQty,
    unallocatedQty: unallocated,
    variantAvailableQty: availableQty(l),
    backorderQty: l.hasOpenBackorder ? unallocated : 0,
  };
}

function detailResponse(
  order: MockOrder,
): WholesaleSchema<"OrderDetailResponse"> {
  const f = flags(order);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderedAt: order.orderedAt,
    // 스펙에 nullable이 없어 타입은 string이지만 확정 전엔 null이다
    confirmedAt: null as unknown as string,
    retailerId: order.retailerId,
    retailerName: order.retailerName,
    // 시드 거래처(partner)에 전화가 없다(V6 컬럼, 시드 미기입)
    retailerPhone: null as unknown as string,
    expectedPaymentMethod: order.paymentMethod,
    receiveBy: order.receiveBy,
    status: { key: f.key, label: STATUS_LABEL[f.key] },
    // 정산 목의 입금 배정에서 파생한다(시드는 입금이 없어 전부 UNPAID)
    settlementStatus: mockOrderSettlement(order).settlementStatus,
    isConfirmable: f.isConfirmable,
    isCancellable: f.isCancellable,
    isPackable: f.isPackable,
    orderAmount: mockOrderAmount(order),
    totalQty: sum(order.items, (l) => l.qty),
    items: order.items.map(itemResponse),
  };
}

function summaryResponse(
  order: MockOrder,
): WholesaleSchema<"OrderSummaryResponse"> {
  const f = flags(order);
  const first = order.items[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderedAt: order.orderedAt,
    retailerId: order.retailerId,
    retailerName: order.retailerName,
    summaryProductName: first ? `${first.productName} (${first.color})` : "",
    additionalItemCount: Math.max(order.items.length - 1, 0),
    orderAmount: mockOrderAmount(order),
    status: { key: f.key, label: STATUS_LABEL[f.key] },
    ...mockOrderSettlement(order),
    isConfirmable: f.isConfirmable,
    isCancellable: f.isCancellable,
    isPackable: f.isPackable,
  };
}

function packingItemResponse(
  order: MockOrder,
  item: MockPacking["items"][number],
): WholesaleSchema<"PackingItemResponse"> {
  const l = order.items.find((x) => x.id === item.orderItemId);
  if (!l)
    throw new Error(`mock: 포장 줄이 가리키는 라인이 없다 ${item.orderItemId}`);
  return {
    id: item.id,
    orderItemId: item.orderItemId,
    variantId: l.variantId,
    variantNumber: l.variantNumber,
    productNumber: l.productNumber,
    productName: l.productName,
    color: l.color,
    size: l.size,
    qty: item.qty,
  };
}

function queueItemResponse(
  order: MockOrder,
  p: MockPacking,
): WholesaleSchema<"PackingQueueItemResponse"> {
  return {
    id: p.id,
    status: p.status,
    // 스펙에 nullable이 없어 타입은 number지만 READY면 null이다
    outboundId: p.outboundId as number,
    // 봉투에 담긴 포장은 출고 묶음 해제 없이는 취소할 수 없다(BE PackingStatus)
    isCancellable: p.status === "READY",
    createdAt: p.createdAt,
    items: p.items.map((i) => packingItemResponse(order, i)),
  };
}

/** 서버 에러 본문 모양. `packages/api` 런타임이 `code`·`message`로 읽는다 */
function fail(status: number, code: string, message: string, field?: string) {
  return HttpResponse.json(
    {
      code,
      message,
      errors: field ? [{ field, reason: message }] : [],
      traceId: "mock",
    },
    { status },
  );
}

function matchesQuery(order: MockOrder, q: string | null): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    order.retailerName.toLowerCase().includes(lower) ||
    order.items.some((l) => l.productName.toLowerCase().includes(lower))
  );
}

/**
 * 배분 요청 검증 — 스펙 설명의 에러 코드 순서대로. 통과하면 라인별 수량 맵.
 * `requireAll`이면(확정) 전 라인이 있어야 하고, 아니면(포장) 1 이상만 담긴다.
 */
function validateAllocation(
  order: MockOrder,
  items: readonly WholesaleSchema<"AllocationItemRequest">[],
  requireAll: boolean,
): Map<number, number> | ReturnType<typeof fail> {
  const seen = new Map<number, number>();
  for (const item of items) {
    const l = order.items.find((x) => x.id === item.orderItemId);
    if (!l)
      return fail(
        400,
        "ORDER_ITEM_NOT_IN_ORDER",
        "이 주문에 없는 라인입니다.",
        "items",
      );
    if (seen.has(item.orderItemId))
      return fail(
        400,
        "DUPLICATE_ORDER_ITEM",
        "같은 라인이 두 번 들어왔습니다.",
        "items",
      );
    if (item.allocateQty < (requireAll ? 0 : 1))
      return fail(
        400,
        "INVARIANT_VIOLATED",
        "배분 수량이 올바르지 않습니다.",
        "items",
      );
    if (item.allocateQty > l.qty - l.allocatedQty)
      return fail(
        409,
        "ALLOCATION_EXCEEDS_ORDER",
        "배분 수량이 주문 잔량을 넘었습니다.",
      );
    if (item.allocateQty > availableQty(l))
      return fail(409, "INSUFFICIENT_STOCK", "가용재고가 부족합니다.");
    seen.set(item.orderItemId, item.allocateQty);
  }
  if (requireAll && seen.size < order.items.length)
    return fail(
      400,
      "ORDER_ITEM_MISSING",
      "모든 라인을 담아야 합니다.",
      "items",
    );
  return seen;
}

function applyAllocation(order: MockOrder, qtyByLine: Map<number, number>) {
  const created: MockPacking["items"] = [];
  for (const l of order.items) {
    const n = qtyByLine.get(l.id) ?? 0;
    l.allocatedQty += n;
    // 잔량이 남으면 미송(OPEN), 다 잡히면 해소
    l.hasOpenBackorder = l.qty - l.allocatedQty > 0;
    if (n > 0)
      created.push({ id: nextPackingItemId++, orderItemId: l.id, qty: n });
  }
  if (created.length === 0) return null;
  const packing: MockPacking = {
    id: nextPackingId++,
    orderId: order.id,
    createdAt: new Date().toISOString(),
    status: "READY",
    outboundId: null,
    items: created,
  };
  packings.push(packing);
  return packing;
}

function findOrder(raw: string | readonly string[] | undefined) {
  const id = Number(raw);
  return orders.find((o) => o.id === id) ?? null;
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다.
 * `orders/filters`가 `orders/:orderId`보다 먼저다 — 뒤에 두면 `filters`가 id로 잡힌다.
 */
export const orderHandlers = [
  http.get("*/api/wholesale/orders", ({ request }) => {
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter");
    const q = url.searchParams.get("q");
    const retailerId = url.searchParams.get("retailerId");
    const settlement = url.searchParams.get("settlementStatus");
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    if (size > 100)
      return fail(
        400,
        "VALIDATION_FAILED",
        "size는 100 이하여야 합니다.",
        "size",
      );

    const rows = orders
      .filter((o) => !filter || filter === "ALL" || statusKey(o) === filter)
      // 정산 탭 전용(스펙): `retailerId`를 넣으면 그 소매처의 **확정 주문만**(신규·취소 제외)
      .filter(
        (o) =>
          retailerId === null ||
          (o.retailerId === Number(retailerId) && o.status === "CONFIRMED"),
      )
      .filter(
        (o) =>
          !settlement || mockOrderSettlement(o).settlementStatus === settlement,
      )
      .filter((o) => matchesQuery(o, q))
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));

    const meta: WholesaleSchema<"PageMeta"> = {
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.max(Math.ceil(rows.length / size), 1),
    };
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size).map(summaryResponse),
      meta,
    });
  }),

  http.get("*/api/wholesale/orders/filters", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q");
    const scoped = orders.filter((o) => matchesQuery(o, q));
    const data: WholesaleSchema<"OrderFilterResponse">[] = CHIP_ORDER.map(
      (key) => ({
        key,
        label: key === "ALL" ? "전체" : STATUS_LABEL[key],
        count:
          key === "ALL"
            ? scoped.length
            : scoped.filter((o) => statusKey(o) === key).length,
      }),
    );
    return HttpResponse.json({ data });
  }),

  http.get("*/api/wholesale/orders/:orderId", ({ params }) => {
    const order = findOrder(params.orderId);
    if (!order)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "주문이 없거나 접근할 수 없습니다.",
      );
    return HttpResponse.json({ data: detailResponse(order) });
  }),

  http.post(
    "*/api/wholesale/orders/:orderId/confirm",
    async ({ params, request }) => {
      const order = findOrder(params.orderId);
      if (!order)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "주문이 없거나 접근할 수 없습니다.",
        );
      if (order.status !== "NEW")
        return fail(
          409,
          "TRANSITION_NOT_ALLOWED",
          "신규 주문만 확정할 수 있습니다.",
        );
      const body =
        (await request.json()) as WholesaleSchema<"OrderConfirmRequest">;
      const result = validateAllocation(order, body.items ?? [], true);
      if (result instanceof Map) {
        order.status = "CONFIRMED";
        applyAllocation(order, result);
        return HttpResponse.json({ data: detailResponse(order) });
      }
      return result;
    },
  ),

  http.post("*/api/wholesale/orders/:orderId/cancel", ({ params }) => {
    const order = findOrder(params.orderId);
    if (!order)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "주문이 없거나 접근할 수 없습니다.",
      );
    if (order.status !== "NEW")
      return fail(
        409,
        "TRANSITION_NOT_ALLOWED",
        "확정된 주문은 취소할 수 없습니다.",
      );
    order.status = "CANCELLED";
    return HttpResponse.json({ data: detailResponse(order) });
  }),

  http.get("*/api/wholesale/orders/:orderId/packings", ({ params }) => {
    const order = findOrder(params.orderId);
    if (!order)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "주문이 없거나 접근할 수 없습니다.",
      );
    const data = packings
      .filter((p) => p.orderId === order.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .map((p) => queueItemResponse(order, p));
    return HttpResponse.json({ data });
  }),

  http.post(
    "*/api/wholesale/orders/:orderId/packings",
    async ({ params, request }) => {
      const order = findOrder(params.orderId);
      if (!order)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "주문이 없거나 접근할 수 없습니다.",
        );
      if (!flags(order).isPackable)
        return fail(
          409,
          "TRANSITION_NOT_ALLOWED",
          "지금은 포장을 만들 수 없는 주문입니다.",
        );
      const body =
        (await request.json()) as WholesaleSchema<"PackingCreateRequest">;
      const result = validateAllocation(order, body.items ?? [], false);
      if (!(result instanceof Map)) return result;
      const packing = applyAllocation(order, result);
      if (!packing)
        return fail(
          400,
          "INVARIANT_VIOLATED",
          "배분할 라인이 없습니다.",
          "items",
        );
      const data: WholesaleSchema<"PackingCreatedResponse"> = {
        id: packing.id,
        orderId: order.id,
        status: "READY",
        outboundId: null as unknown as number,
        createdAt: packing.createdAt,
        items: packing.items.map((i) => packingItemResponse(order, i)),
      };
      return HttpResponse.json({ data }, { status: 201 });
    },
  ),

  http.delete("*/api/wholesale/packings/:packingId", ({ params }) => {
    const id = Number(params.packingId);
    const packing = packings.find((p) => p.id === id);
    if (!packing)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "포장이 없거나 이미 취소됐습니다.",
      );
    if (packing.status !== "READY")
      return fail(
        409,
        "TRANSITION_NOT_ALLOWED",
        "출고 묶음에 담긴 포장은 취소할 수 없습니다.",
      );
    const order = orders.find((o) => o.id === packing.orderId);
    if (order) {
      // 배분이 풀린다 — 출고진행이 줄고 해소했던 미송이 되살아난다(스펙 설명)
      for (const item of packing.items) {
        const l = order.items.find((x) => x.id === item.orderItemId);
        if (!l) continue;
        l.allocatedQty -= item.qty;
        l.hasOpenBackorder = l.qty - l.allocatedQty > 0;
      }
    }
    packings = packings.filter((p) => p.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];

/** 화면 검증 중 시드로 되돌릴 때. 앱은 부르지 않는다 */
export function resetOrderMock() {
  orders = seedOrders();
  packings = seedPackings();
  nextPackingId = 9101;
  nextPackingItemId = 9201;
}
