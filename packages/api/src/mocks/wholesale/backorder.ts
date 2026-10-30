import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import {
  addDays,
  seoulDate,
  type InquiryBackorder,
} from "../chat/backorderCandidates";

/**
 * 미송 목 — BE `V900__seed_dev.sql`(MUL-97)의 `backorder`·`order_item`·`variant` 행을 그대로 옮겼다.
 *
 * BE 컨트롤러는 스텁(MUL-83)이고 `BackorderStubExamples.java`가 있지만 **그 값은 상태를 흉내 낼 수
 * 없다** — 미송 행 1개(12장)에 요약은 90장·주문 10건이라 배분 뒤 숫자가 맞물려 움직일 수 없다.
 * 그래서 주문 목(`./order`)과 같은 시드를 쓴다: SKU 3003·3011·3019, 주문 7001·7002·7003·7005.
 * **값을 지어내지 않는다** — id·주문번호·거래처·상품·색상·사이즈·수량·단가·재고·입고 예정일·사유 전부 시드다.
 *
 * 시드와 다른 것, 머리에 적는다:
 *  1. 시드의 미송은 도매처 3곳 것이다. 주문 목처럼 소유를 안 가리고 다 내린다 — 한 도매처(101)만
 *     보면 SKU가 하나(3003)뿐이라 배분을 볼 수 없다(재고 0).
 *  2. 시드의 시각은 `now() - interval`이라 절대값이 없다. 주문 목과 같은 기준일 2026-09-07(KST)로 박았다.
 *     `elapsedDays`는 그 기준일과 미송 발생일의 차다.
 *  3. 주문 목과 상태를 **공유하지 않는다.** 여기서 배분해도 주문 탭의 포장 대기열엔 안 생긴다.
 *
 *  4. (loop-06) 입고 예정일은 **reset 시각(서울)의 상대값**이다: 3003 = 오늘 −3일, 3019 = +7일, 3011 미정.
 *     미송 자동 답이 "예정 / 지남 / 미정"을 가르는데 고정 날짜면 날이 갈수록 답이 바뀐다. e2e는 reset 전에
 *     `page.clock`을 2026-10-29 14:20(서울)에 고정한다. 주문 시각(9/4~9/7)은 칩 글자에 나와 고정 그대로 둔다.
 *  5. (loop-06) 시드에 없던 행 셋을 지었다. 9004(봄봄상회, 해소됨 — 칩에 남의 것과 같이 "없는 미송"을 시험),
 *     9006(봄봄상회, 3003, 원래 4장 중 2장 배분 → 남은 2장 — 답이 원래 수량을 쓰면 틀린다), 801(도매처 102,
 *     코튼 셔츠 블랙 / L 20장 — 소매 방 33의 미송). 9006의 주문 7006은 이 목 안의 번호다(알림 목 incoming이
 *     주문 목에 만드는 7006과 저장소가 달라 안 섞인다).
 *  6. (loop-06) 소유: 미송 탭의 "나"는 도매처 101이다. 3011, 3019는 상품 목에선 다른 도매처 게시글이지만
 *     이 목에선 지금처럼 101 것으로 둔다(미송 탭 화면이 그대로 보이게). 102의 SKU(3801)는 탭에 안 나온다.
 *
 * 응답 모양은 스펙(`WholesaleSchema`)이 지킨다. 배분 뒤 잔여·가용재고가 줄고 다 받은 미송이 빠지는 건
 * 스펙 설명("부분 성공 없음", "`resolvedBackorderIds`로 해소된 미송을 알려준다")을 따라 여기서 흉내 낸다.
 * 새로고침하면 시드로 돌아간다.
 */

type Size = WholesaleSchema<"BackorderSkuResponse">["size"];

/** `wholesale.variant` + `product` + `color_option`. 미송이 걸린 3개만. `stockQty`는 시드 `stock_qty` */
interface MockVariant {
  id: number;
  /** SKU의 도매처. 미송 탭은 101 것만 본다 */
  wholesalerId: number;
  productId: number;
  productNumber: number;
  variantNumber: number;
  productName: string;
  color: string;
  size: Size;
  stockQty: number;
  /** 잡혔지만 아직 안 나간 수량. 배분이 여기로 쌓인다 → 가용재고 = 재고 − 이것 */
  reservedQty: number;
  expectedInboundDate: string | null;
  expectedInboundReason: string | null;
}

/** `wholesale.backorder` + `order_item` + `orders` + `partner` 를 한 줄로 */
interface MockBackorder {
  id: number;
  variantId: number;
  orderId: number;
  orderNumber: number;
  orderItemId: number;
  orderedAt: string;
  createdAt: string;
  retailerId: number;
  retailerName: string;
  qty: number;
  remainingQty: number;
  unitPrice: number;
  status: "OPEN" | "RESOLVED";
}

/** 기준일. 시드의 `now()`를 이 날로 고정했다(주문 목과 같다). 경과일(`elapsedDays`)만 이 값으로 잰다 */
const TODAY = "2026-09-07";

/** 미송 탭의 "나". 채팅 목의 `CHAT_ME_WHOLESALER_ID`와 같다 */
export const BACKORDER_ME_WHOLESALER_ID = 101;

/** 입고 예정일 시드. reset 시각의 서울 날짜 기준 상대값(머리 주석 4). 골든셋 `backorders` 표와 같아야 한다 */
export const BACKORDER_SEED_ETA_DAYS = { 3003: -3, 3019: 7, 3801: 5 } as const;

function seedVariants(now: number): MockVariant[] {
  const today = seoulDate(now);
  return [
    {
      id: 3003,
      wholesalerId: BACKORDER_ME_WHOLESALER_ID,
      productId: 1001,
      productNumber: 1,
      variantNumber: 3,
      productName: "빈티지 플라워 셔츠",
      color: "레드",
      size: "L",
      // 재고 0 — 배분할 실물이 없는 표본. 입력칸이 전부 0으로 잠긴다
      stockQty: 0,
      reservedQty: 0,
      // 지난 예정일 — 자동 답 "등록된 입고 예정일이 지났어요" + 넘김(Q2)
      expectedInboundDate: addDays(today, BACKORDER_SEED_ETA_DAYS[3003]),
      expectedInboundReason: "공장 재입고 예정",
    },
    {
      id: 3011,
      wholesalerId: BACKORDER_ME_WHOLESALER_ID,
      productId: 1003,
      productNumber: 1,
      variantNumber: 4,
      productName: "와이드 데님 팬츠",
      color: "소라",
      size: "M",
      // 가용재고 6 ≥ 미송 1 — 한 번에 다 배분돼 **SKU가 목록에서 사라지는** 표본
      stockQty: 6,
      reservedQty: 0,
      // 시드가 일부러 비워 둔 SKU
      expectedInboundDate: null,
      expectedInboundReason: null,
    },
    {
      id: 3019,
      wholesalerId: BACKORDER_ME_WHOLESALER_ID,
      productId: 1005,
      productNumber: 1,
      variantNumber: 2,
      productName: "린넨 셋업 자켓",
      color: "베이지",
      size: "L",
      stockQty: 4,
      reservedQty: 0,
      // 시연 장면 2의 답 "11월 5일 도매 입고 예정이에요(원단 수급 지연)"(T0 기준 +7일)
      expectedInboundDate: addDays(today, BACKORDER_SEED_ETA_DAYS[3019]),
      expectedInboundReason: "원단 수급 지연",
    },
    {
      // 해소된 9004의 SKU. 열린 미송이 없어 탭에는 안 나온다
      id: 3002,
      wholesalerId: BACKORDER_ME_WHOLESALER_ID,
      productId: 1001,
      productNumber: 1,
      variantNumber: 2,
      productName: "빈티지 플라워 셔츠",
      color: "레드",
      size: "M",
      stockQty: 0,
      reservedQty: 0,
      expectedInboundDate: null,
      expectedInboundReason: null,
    },
    {
      // 도매처 102의 SKU. 소매 방 33(라온)의 미송. 101의 미송 탭에는 안 나온다
      id: 3801,
      wholesalerId: 102,
      productId: 1801,
      productNumber: 1,
      variantNumber: 1,
      productName: "코튼 셔츠",
      color: "블랙",
      size: "L",
      stockQty: 0,
      reservedQty: 0,
      expectedInboundDate: addDays(today, BACKORDER_SEED_ETA_DAYS[3801]),
      expectedInboundReason: null,
    },
  ];
}

/** 미송 7건. OPEN 6 + RESOLVED 1(9004). 탭 목록은 OPEN만, 자동 답 후보는 남은 수량 > 0만 쓴다 */
function seedBackorders(): MockBackorder[] {
  return [
    {
      id: 9001,
      variantId: 3003,
      orderId: 7001,
      orderNumber: 1,
      orderItemId: 8001,
      orderedAt: "2026-09-04T10:00:00+09:00",
      createdAt: "2026-09-04T10:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      qty: 4,
      remainingQty: 4,
      unitPrice: 13500,
      status: "OPEN",
    },
    {
      id: 9002,
      variantId: 3011,
      orderId: 7002,
      orderNumber: 1,
      orderItemId: 8002,
      orderedAt: "2026-09-06T10:00:00+09:00",
      createdAt: "2026-09-06T10:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      qty: 1,
      remainingQty: 1,
      unitPrice: 31000,
      status: "OPEN",
    },
    {
      id: 9003,
      variantId: 3019,
      orderId: 7003,
      orderNumber: 1,
      orderItemId: 8003,
      orderedAt: "2026-09-07T08:00:00+09:00",
      createdAt: "2026-09-07T08:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      qty: 2,
      remainingQty: 2,
      unitPrice: 45000,
      status: "OPEN",
    },
    {
      id: 9005,
      variantId: 3003,
      orderId: 7005,
      orderNumber: 3,
      orderItemId: 8005,
      orderedAt: "2026-09-05T10:00:00+09:00",
      createdAt: "2026-09-05T10:00:00+09:00",
      retailerId: 2,
      retailerName: "대기상회",
      qty: 9,
      remainingQty: 9,
      unitPrice: 13500,
      status: "OPEN",
    },
    {
      id: 9004,
      variantId: 3002,
      orderId: 7004,
      orderNumber: 2,
      orderItemId: 8004,
      orderedAt: "2026-09-05T15:00:00+09:00",
      createdAt: "2026-09-05T15:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      qty: 1,
      remainingQty: 0,
      unitPrice: 12500,
      status: "RESOLVED",
    },
    {
      id: 9006,
      variantId: 3003,
      orderId: 7006,
      orderNumber: 4,
      orderItemId: 8006,
      orderedAt: "2026-09-06T15:00:00+09:00",
      createdAt: "2026-09-06T15:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      // 원래 4장 중 2장은 이미 배분돼 나갔다
      qty: 4,
      remainingQty: 2,
      unitPrice: 13500,
      status: "OPEN",
    },
    {
      id: 801,
      variantId: 3801,
      orderId: 7801,
      orderNumber: 1,
      orderItemId: 8801,
      orderedAt: "2026-10-24T11:00:00+09:00",
      createdAt: "2026-10-24T11:00:00+09:00",
      retailerId: 1,
      retailerName: "봄봄상회",
      qty: 20,
      remainingQty: 20,
      unitPrice: 9000,
      status: "OPEN",
    },
  ];
}

/* --- 상태 --------------------------------------------------------------- */

let variants = seedVariants(Date.now());
let backorders = seedBackorders();
let nextBatchId = 4401;
let nextPackingId = 7710;
let nextPackingItemId = 91101;

/* --- 파생 (서버 규칙을 스펙 설명대로) ------------------------------------ */

const DAY_MS = 86_400_000;

/** 미송 발생일 → 기준일까지 며칠. 날짜만 본다(KST). BE 주석: 주문 시각이 아니라 `createdAt` 기준 */
function elapsedDays(createdAt: string): number {
  const day = createdAt.slice(0, 10);
  return Math.round((Date.parse(TODAY) - Date.parse(day)) / DAY_MS);
}

/** 미송 탭이 보는 SKU. 남의 도매처 SKU는 없는 것과 같다(404) */
function myVariants(): MockVariant[] {
  return variants.filter((v) => v.wholesalerId === BACKORDER_ME_WHOLESALER_ID);
}

function myBackorder(id: number): MockBackorder | undefined {
  const b = backorders.find((x) => x.id === id);
  return b !== undefined && myVariants().some((v) => v.id === b.variantId)
    ? b
    : undefined;
}

function openOf(variantId: number): MockBackorder[] {
  return backorders.filter(
    (b) => b.variantId === variantId && b.status === "OPEN",
  );
}

function availableQty(v: MockVariant): number {
  return v.stockQty - v.reservedQty;
}

function sum(
  rows: readonly MockBackorder[],
  pick: (b: MockBackorder) => number,
) {
  return rows.reduce((acc, b) => acc + pick(b), 0);
}

/** 스펙에 nullable이 없어 타입은 string이지만 미등록이면 null이다 */
function nullable(value: string | null): string {
  return value as unknown as string;
}

/** 열린 미송 중 가장 늦게 생긴 시각. 열린 게 없으면 null(스펙은 string이지만 서버도 이때 null을 준다) */
function latestBackorderedAt(rows: readonly MockBackorder[]): string | null {
  return rows.reduce<string | null>(
    (latest, b) =>
      latest === null || b.createdAt > latest ? b.createdAt : latest,
    null,
  );
}

function skuResponse(v: MockVariant): WholesaleSchema<"BackorderSkuResponse"> {
  const open = openOf(v.id);
  return {
    variantId: v.id,
    productId: v.productId,
    productNumber: v.productNumber,
    variantNumber: v.variantNumber,
    productName: v.productName,
    color: v.color,
    size: v.size,
    backorderQty: sum(open, (b) => b.remainingQty),
    availableQty: availableQty(v),
    expectedInboundDate: nullable(v.expectedInboundDate),
    latestBackorderedAt: nullable(latestBackorderedAt(open)),
  };
}

function backorderResponse(
  b: MockBackorder,
): WholesaleSchema<"BackorderResponse"> {
  return {
    id: b.id,
    orderId: b.orderId,
    orderNumber: b.orderNumber,
    orderItemId: b.orderItemId,
    orderedAt: b.orderedAt,
    createdAt: b.createdAt,
    elapsedDays: elapsedDays(b.createdAt),
    retailerId: b.retailerId,
    retailerName: b.retailerName,
    qty: b.qty,
    remainingQty: b.remainingQty,
    unitPrice: b.unitPrice,
  };
}

/** `BackorderStatsResponse` — 총액은 Σ(잔여 × 주문 시점 단가), 주문 건수는 OPEN 미송을 가진 주문 수 */
function statsResponse(
  v: MockVariant,
  rows: readonly MockBackorder[],
): WholesaleSchema<"BackorderStatsResponse"> {
  const ordered = [...rows].sort((a, b) =>
    a.orderedAt.localeCompare(b.orderedAt),
  );
  return {
    variantId: v.id,
    productNumber: v.productNumber,
    variantNumber: v.variantNumber,
    backorderQty: sum(rows, (b) => b.remainingQty),
    orderCount: new Set(rows.map((b) => b.orderId)).size,
    retailerCount: new Set(rows.map((b) => b.retailerId)).size,
    availableQty: availableQty(v),
    expectedInboundDate: nullable(v.expectedInboundDate),
    expectedInboundReason: nullable(v.expectedInboundReason),
    firstOrderedAt: nullable(ordered[0]?.orderedAt ?? null),
    lastOrderedAt: nullable(ordered[ordered.length - 1]?.orderedAt ?? null),
    backorderAmount: sum(rows, (b) => b.remainingQty * b.unitPrice),
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

function findVariant(raw: string | readonly string[] | undefined) {
  const id = Number(raw);
  return myVariants().find((v) => v.id === id) ?? null;
}

function matchesQuery(v: MockVariant, q: string | null): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    v.productName.toLowerCase().includes(lower) ||
    `${v.productNumber}-${v.variantNumber}`.includes(lower)
  );
}

/** 날짜 `YYYY-MM-DD`. 서버 `LocalDate` 파싱이 거절할 것을 흉내 낸다 */
function isWireDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다.
 */
export const backorderHandlers = [
  http.get("*/api/wholesale/backorders/variants", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    if (size > 100)
      return fail(
        400,
        "VALIDATION_FAILED",
        "size는 100 이하여야 합니다.",
        "size",
      );

    // 미송이 남은 SKU만, 많이 밀린 순(`backorderQty,desc`)
    const rows = myVariants()
      .map(skuResponse)
      .filter((s) => s.backorderQty > 0)
      .filter((s) => {
        const v = variants.find((x) => x.id === s.variantId);
        return v ? matchesQuery(v, q) : false;
      })
      .sort((a, b) => b.backorderQty - a.backorderQty);

    const meta: WholesaleSchema<"PageMeta"> = {
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.max(Math.ceil(rows.length / size), 1),
    };
    const data = rows.slice(page * size, page * size + size);
    return HttpResponse.json({ data, meta });
  }),

  http.get("*/api/wholesale/variants/:variantId/backorders", ({ params }) => {
    const v = findVariant(params.variantId);
    if (!v)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "SKU가 없거나 접근할 수 없습니다.",
      );
    const rows = openOf(v.id).sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
    );
    const body: WholesaleSchema<"BackorderListResponse"> = {
      data: rows.map(backorderResponse),
      stats: statsResponse(v, rows),
    };
    return HttpResponse.json(body);
  }),

  http.post("*/api/wholesale/backorders/allocations", async ({ request }) => {
    const body =
      (await request.json()) as WholesaleSchema<"BackorderAllocationRequest">;
    const items = body.items ?? [];
    if (items.length === 0)
      return fail(
        400,
        "INVARIANT_VIOLATED",
        "배분할 미송이 없습니다.",
        "items",
      );

    // 부분 성공 없음 — 전부 검사한 뒤에 적용한다
    const seen = new Set<number>();
    const perVariant = new Map<number, number>();
    for (const item of items) {
      if (seen.has(item.backorderId))
        return fail(
          400,
          "DUPLICATE_BACKORDER",
          "같은 미송이 두 번 들어왔습니다.",
          "items",
        );
      seen.add(item.backorderId);
      if (!Number.isInteger(item.allocateQty) || item.allocateQty < 1)
        return fail(
          400,
          "INVARIANT_VIOLATED",
          "배분 수량은 1 이상이어야 합니다.",
          "items",
        );
      const b = myBackorder(item.backorderId);
      if (!b)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "미송이 없거나 접근할 수 없습니다.",
        );
      if (b.status !== "OPEN")
        return fail(409, "BACKORDER_NOT_OPEN", "이미 해소된 미송입니다.");
      if (item.allocateQty > b.remainingQty)
        return fail(
          409,
          "ALLOCATION_EXCEEDS_REMAINING",
          "배분 수량이 남은 미송 수량을 넘었습니다.",
        );
      perVariant.set(
        b.variantId,
        (perVariant.get(b.variantId) ?? 0) + item.allocateQty,
      );
    }
    for (const [variantId, total] of perVariant) {
      const v = variants.find((x) => x.id === variantId);
      if (v && total > availableQty(v))
        return fail(
          409,
          "INSUFFICIENT_STOCK",
          "가용재고가 부족합니다.",
          "items",
        );
    }

    // 적용 — 주문마다 포장 카드 한 장
    const createdAt = new Date().toISOString();
    const resolved: number[] = [];
    const byOrder = new Map<
      number,
      WholesaleSchema<"AllocationPackingResponse">
    >();
    for (const item of items) {
      const b = backorders.find((x) => x.id === item.backorderId);
      const v = b ? variants.find((x) => x.id === b.variantId) : undefined;
      if (!b || !v) continue;
      b.remainingQty -= item.allocateQty;
      v.reservedQty += item.allocateQty;
      if (b.remainingQty === 0) {
        b.status = "RESOLVED";
        resolved.push(b.id);
      }
      let packing = byOrder.get(b.orderId);
      if (!packing) {
        packing = {
          id: nextPackingId++,
          orderId: b.orderId,
          orderNumber: b.orderNumber,
          status: "READY",
          outboundId: null as unknown as number,
          isCancellable: true,
          createdAt,
          items: [],
        };
        byOrder.set(b.orderId, packing);
      }
      packing.items.push({
        id: nextPackingItemId++,
        orderItemId: b.orderItemId,
        variantId: v.id,
        variantNumber: v.variantNumber,
        productNumber: v.productNumber,
        productName: v.productName,
        color: v.color,
        size: v.size,
        qty: item.allocateQty,
      });
    }

    const data: WholesaleSchema<"AllocationBatchResponse"> = {
      allocationBatchId: nextBatchId++,
      createdAt,
      packings: [...byOrder.values()],
      resolvedBackorderIds: resolved,
    };
    return HttpResponse.json({ data }, { status: 201 });
  }),

  http.put(
    "*/api/wholesale/variants/:variantId/expected-inbound",
    async ({ params, request }) => {
      const v = findVariant(params.variantId);
      if (!v)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "SKU가 없거나 접근할 수 없습니다.",
        );
      const body = (await request.json()) as {
        expectedInboundDate?: unknown;
        expectedInboundReason?: unknown;
      };
      const date = body.expectedInboundDate ?? null;
      if (date !== null && !isWireDate(date))
        return fail(
          400,
          "VALIDATION_FAILED",
          "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).",
          "expectedInboundDate",
        );
      const reason = body.expectedInboundReason;
      if (reason !== null && reason !== undefined && typeof reason !== "string")
        return fail(
          400,
          "VALIDATION_FAILED",
          "사유는 문자열이어야 합니다.",
          "expectedInboundReason",
        );

      // 전체 대체 — 날짜를 지우면 사유도 같이 비운다(스펙: "`null` = 해제(사유도 함께 null)")
      v.expectedInboundDate = date;
      v.expectedInboundReason =
        date === null ? null : ((reason as string | undefined) ?? null);

      const data: WholesaleSchema<"ExpectedInboundResponse"> = {
        variantId: v.id,
        productNumber: v.productNumber,
        variantNumber: v.variantNumber,
        expectedInboundDate: nullable(v.expectedInboundDate),
        expectedInboundReason: nullable(v.expectedInboundReason),
      };
      return HttpResponse.json({ data });
    },
  ),
];

/**
 * 시드로 되돌린다. 입고 예정일은 이 시각 기준이라 채팅 목 reset(`/__mock/chat/reset`)이 같이 부른다.
 * `empty`면 미송을 다 비운다(소매 "후보 0개" 시험, loop-06 S3-4). 앱은 부르지 않는다
 */
export function resetBackorderMock(options: { empty?: boolean } = {}) {
  variants = seedVariants(Date.now());
  backorders = options.empty === true ? [] : seedBackorders();
  nextBatchId = 4401;
  nextPackingId = 7710;
  nextPackingItemId = 91101;
}

/**
 * 미송 자동 답의 후보 원본(`../chat/backorderCandidates.ts` `InquiryBackorderSource`). **거르지 않고 전부**
 * 준다 — 이 도매처, 이 소매처 것을 고르는 건 판정이 한다. 칸을 골라 새 객체를 만든다: 원래 수량(`qty`),
 * 판매가능, 소매처 이름은 싣지 않는다(§4-2 8). 남은 수량은 배분이 줄인 `remainingQty` 그대로라
 * 미송 탭에서 배분하거나 입고일을 바꾸면 다음 답에 바로 쓰인다(S4-3, S4-4).
 */
export function inquiryBackorders(): InquiryBackorder[] {
  return backorders.flatMap((b) => {
    const v = variants.find((x) => x.id === b.variantId);
    if (v === undefined) return [];
    return [
      {
        backorderId: b.id,
        orderId: b.orderId,
        wholesalerId: v.wholesalerId,
        retailerId: b.retailerId,
        variantId: v.id,
        title: v.productName,
        color: v.color,
        size: v.size,
        remainingQty: b.remainingQty,
        orderedAt: b.orderedAt,
        expectedInboundDate: v.expectedInboundDate,
        expectedInboundReason: v.expectedInboundReason,
      },
    ];
  });
}
