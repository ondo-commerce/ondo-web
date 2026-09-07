import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import {
  addMockPacking,
  mockOrders,
  mockPackings,
  mockRetailer,
  SEED_SHIPPED_OUTBOUND_ID,
  SEED_SHIPPED_PACKING_CREATED_AT,
  shipMockPacking,
  type MockOrder,
  type MockOrderLine,
  type MockPacking,
} from "./order";
import { findMockVariant } from "./product";

/**
 * 출고 목 — 주문 목(`./order`)의 포장 상태와 **맞물린다.**
 *
 * BE 출고 컨트롤러는 스텁(MUL-83, `OutboundStubExamples`: 소매처 `부산 상사` 1곳 · 출고 8801 1건 ·
 * 장끼 1부 고정)이라 그 값으로는 포장 대기 → 봉투 생성 → 출고 확정 → 장끼 흐름을 볼 수 없다.
 * 그래서 값은 V900 시드(주문 목이 옮긴 것)에서 오고, 규칙은 스펙 설명을 따라 여기서 흉내 낸다:
 *
 *   - 포장 대기 줄 = 주문 탭에서 `포장 준비`한 포장(`READY`)의 줄. 주문 탭에서 만들면 여기 보인다
 *   - `POST /outbounds` = 체크한 줄을 봉투 하나로. 같은 소매처·같은 수령 방식만. 포장의 일부만
 *     담기면 포장이 **분할**된다(남는 쪽 id 유지, 나가는 쪽이 새 포장). 재고는 아직 안 준다
 *   - `POST …/ship` = 재고가 실제로 줄어드는 유일한 지점. 주문 라인의 `shippedQty`가 오르고
 *     (주문 탭 상태가 부분 출고·출고 완료로 파생), 상품 목의 SKU 재고도 함께 준다. 장끼번호는 날짜별 1부터
 *
 * 스텁에서 그대로 가져온 값: 시드 봉투 id `8801`, 장끼의 `sellerName` `도도도매`.
 * 시드에 없어 **비워 둔 값**(지어내지 않는다): 소매처 코드 `retailerCode` · 배송지 `deliveryAddress` → `""`.
 * 시드 봉투의 시각(포장 다음 날 출고)은 주문일에서 미뤄 잡은 가정이다 — V900에 출고 시각이 없다.
 *
 * 응답 모양은 스펙(`WholesaleSchema`)이 지킨다. 새로고침하면 시드로 돌아간다.
 */

type ReceiveBy = WholesaleSchema<"PackingItemRowResponse">["receiveBy"];
type OutboundStatus = "NOT_SHIPPED" | "SHIPPED";

interface MockOutbound {
  id: number;
  /** 도매처별 연번. 목은 도매처를 안 가려 전역 연번 */
  outboundNumber: number;
  retailerId: number;
  receiveBy: ReceiveBy;
  createdAt: string;
  shippedAt: string | null;
  /** 날짜별 1부터. 출고 확정이 채운다 */
  statementNumber: number | null;
}

/** 봉투 하나에 담긴 줄 하나 — 포장 줄 + 그 라인·주문. 목록·상세·장끼가 같이 쓴다 */
interface OutboundLine {
  packing: MockPacking;
  order: MockOrder;
  itemId: number;
  line: MockOrderLine;
  qty: number;
}

/* --- 시드 --------------------------------------------------------------- */

function seedOutbounds(): MockOutbound[] {
  return [
    {
      id: SEED_SHIPPED_OUTBOUND_ID,
      outboundNumber: 1,
      retailerId: 1,
      receiveBy: "AGENT",
      createdAt: SEED_SHIPPED_PACKING_CREATED_AT,
      shippedAt: "2026-09-04T10:00:00+09:00",
      statementNumber: 1,
    },
  ];
}

let outbounds = seedOutbounds();
let nextOutboundId = 8802;
let nextOutboundNumber = 2;

/** 장끼 `sellerName`. BE 스텁 값 그대로 — 목은 도매처를 안 가린다 */
const SELLER_NAME = "도도도매";

/* --- 조회 --------------------------------------------------------------- */

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

function orderOf(packing: MockPacking): MockOrder {
  const order = mockOrders().find((o) => o.id === packing.orderId);
  if (!order)
    throw new Error(`mock: 포장이 가리키는 주문이 없다 ${packing.orderId}`);
  return order;
}

function lineOf(order: MockOrder, orderItemId: number): MockOrderLine {
  const line = order.items.find((l) => l.id === orderItemId);
  if (!line)
    throw new Error(`mock: 포장 줄이 가리키는 라인이 없다 ${orderItemId}`);
  return line;
}

/** 포장 대기 줄 전부(READY 포장의 줄). 필터는 부르는 쪽 */
function readyLines(): OutboundLine[] {
  return mockPackings()
    .filter((p) => p.status === "READY")
    .flatMap((packing) => {
      const order = orderOf(packing);
      return packing.items.map((item) => ({
        packing,
        order,
        itemId: item.id,
        line: lineOf(order, item.orderItemId),
        qty: item.qty,
      }));
    });
}

/** 봉투에 담긴 줄 전부 */
function outboundLines(outbound: MockOutbound): OutboundLine[] {
  return mockPackings()
    .filter((p) => p.outboundId === outbound.id)
    .flatMap((packing) => {
      const order = orderOf(packing);
      return packing.items.map((item) => ({
        packing,
        order,
        itemId: item.id,
        line: lineOf(order, item.orderItemId),
        qty: item.qty,
      }));
    });
}

/** 상세·장끼의 품목 — **SKU 단위로 합친다**(스펙). 처음 나온 순서 유지 */
function mergedItems(lines: readonly OutboundLine[]) {
  const byVariant = new Map<number, { line: MockOrderLine; qty: number }>();
  for (const { line, qty } of lines) {
    const found = byVariant.get(line.variantId);
    if (found) found.qty += qty;
    else byVariant.set(line.variantId, { line, qty });
  }
  return [...byVariant.values()];
}

function matchesQ(productName: string, q: string | null): boolean {
  return !q || productName.toLowerCase().includes(q.toLowerCase());
}

function statusOf(outbound: MockOutbound): OutboundStatus {
  return outbound.shippedAt === null ? "NOT_SHIPPED" : "SHIPPED";
}

/** 목록 필터(`status`·`q`)를 통과한 봉투. `q`는 담긴 상품명 기준(스펙에 설명이 없어 포장 대기와 같게) */
function filteredOutbounds(
  status: string | null,
  q: string | null,
): { outbound: MockOutbound; lines: OutboundLine[] }[] {
  return outbounds
    .filter((o) => !status || statusOf(o) === status)
    .map((outbound) => ({ outbound, lines: outboundLines(outbound) }))
    .filter(({ lines }) => lines.some((l) => matchesQ(l.line.productName, q)));
}

function sumQty(lines: readonly { qty: number }[]): number {
  return lines.reduce((acc, l) => acc + l.qty, 0);
}

function pageMeta(total: number, page: number, size: number) {
  const meta: WholesaleSchema<"PageMeta"> = {
    page,
    size,
    totalElements: total,
    totalPages: Math.max(Math.ceil(total / size), 1),
  };
  return meta;
}

/* --- 응답 조립 ---------------------------------------------------------- */

function packingRowResponse(
  l: OutboundLine,
): WholesaleSchema<"PackingItemRowResponse"> {
  return {
    id: l.itemId,
    packingId: l.packing.id,
    orderId: l.order.id,
    orderNumber: l.order.orderNumber,
    variantId: l.line.variantId,
    productNumber: l.line.productNumber,
    variantNumber: l.line.variantNumber,
    productName: l.line.productName,
    color: l.line.color,
    size: l.line.size,
    receiveBy: l.order.receiveBy,
    orderedAt: l.order.orderedAt,
    qty: l.qty,
  };
}

function summaryResponse(
  outbound: MockOutbound,
  lines: readonly OutboundLine[],
): WholesaleSchema<"OutboundSummaryResponse"> {
  const items = mergedItems(lines);
  return {
    id: outbound.id,
    outboundNumber: outbound.outboundNumber,
    summaryProductName: items[0]?.line.productName ?? "",
    additionalItemCount: Math.max(items.length - 1, 0),
    receiveBy: outbound.receiveBy,
    createdAt: outbound.createdAt,
    // 스펙에 nullable이 없어 타입은 string·number지만 출고 전엔 null이다
    shippedAt: outbound.shippedAt as string,
    statementNumber: outbound.statementNumber as number,
    totalQty: sumQty(lines),
  };
}

function detailResponse(
  outbound: MockOutbound,
): WholesaleSchema<"OutboundDetailResponse"> {
  const lines = outboundLines(outbound);
  const retailer = mockRetailer(outbound.retailerId);
  const packings = [...new Set(lines.map((l) => l.packing))];
  return {
    id: outbound.id,
    outboundNumber: outbound.outboundNumber,
    retailerId: outbound.retailerId,
    retailerCode: retailer?.code ?? "",
    retailerName: retailer?.name ?? "",
    createdAt: outbound.createdAt,
    shippedAt: outbound.shippedAt as string,
    statementNumber: outbound.statementNumber as number,
    // 재고 검증은 안 들어 있다(스펙) — 확정 때 따로 본다
    isShippable: outbound.shippedAt === null && lines.length > 0,
    totalQty: sumQty(lines),
    items: mergedItems(lines).map(({ line, qty }) => ({
      variantId: line.variantId,
      productNumber: line.productNumber,
      variantNumber: line.variantNumber,
      productName: line.productName,
      color: line.color,
      size: line.size,
      qty,
    })),
    packings: packings.map((p) => {
      const order = orderOf(p);
      return { id: p.id, orderId: order.id, orderNumber: order.orderNumber };
    }),
  };
}

function statementResponse(
  outbound: MockOutbound,
  shippedAt: string,
  statementNumber: number,
): WholesaleSchema<"StatementResponse"> {
  const lines = outboundLines(outbound);
  const retailer = mockRetailer(outbound.retailerId);
  return {
    statementNumber,
    outboundNumber: outbound.outboundNumber,
    shippedAt,
    sellerName: SELLER_NAME,
    retailerCode: retailer?.code ?? "",
    retailerName: retailer?.name ?? "",
    deliveryAddress: "",
    receiveBy: outbound.receiveBy,
    totalQty: sumQty(lines),
    items: mergedItems(lines).map(({ line, qty }) => ({
      productName: line.productName,
      color: line.color,
      size: line.size,
      qty,
    })),
  };
}

function findOutbound(raw: string | readonly string[] | undefined) {
  const id = Number(raw);
  return outbounds.find((o) => o.id === id) ?? null;
}

/** 장끼번호 = 그 KST 날짜에 발행된 수 + 1 */
function nextStatementNumber(shippedAt: string): number {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  const today = day(shippedAt);
  return (
    outbounds.filter((o) => o.shippedAt !== null && day(o.shippedAt) === today)
      .length + 1
  );
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다.
 * `outbounds/retailers`가 `outbounds/:outboundId`보다 먼저다 — 뒤에 두면 `retailers`가 id로 잡힌다.
 */
export const shipmentHandlers = [
  http.get("*/api/wholesale/packing-items/retailers", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const receiveBy = url.searchParams.get("receiveBy");
    const byRetailer = new Map<number, OutboundLine[]>();
    for (const l of readyLines()) {
      if (!matchesQ(l.line.productName, q)) continue;
      if (receiveBy && l.order.receiveBy !== receiveBy) continue;
      const list = byRetailer.get(l.order.retailerId) ?? [];
      list.push(l);
      byRetailer.set(l.order.retailerId, list);
    }
    const data: WholesaleSchema<"PackingRetailerResponse">[] = [
      ...byRetailer.entries(),
    ]
      .sort(([a], [b]) => a - b)
      .map(([retailerId, lines]) => {
        const retailer = mockRetailer(retailerId);
        return {
          retailerId,
          retailerCode: retailer?.code ?? "",
          retailerName: retailer?.name ?? "",
          itemCount: lines.length,
          totalQty: sumQty(lines),
        };
      });
    return HttpResponse.json({ data });
  }),

  http.get("*/api/wholesale/packing-items", ({ request }) => {
    const url = new URL(request.url);
    const retailerId = url.searchParams.get("retailerId");
    const q = url.searchParams.get("q");
    const receiveBy = url.searchParams.get("receiveBy");
    if (retailerId !== null && mockRetailer(Number(retailerId)) === null)
      return fail(404, "RESOURCE_NOT_FOUND", "거래 이력이 없는 소매처입니다.");
    const data = readyLines()
      .filter(
        (l) => retailerId === null || l.order.retailerId === Number(retailerId),
      )
      .filter((l) => matchesQ(l.line.productName, q))
      .filter((l) => !receiveBy || l.order.receiveBy === receiveBy)
      .map(packingRowResponse);
    return HttpResponse.json({ data });
  }),

  http.get("*/api/wholesale/outbounds/retailers", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
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

    const byRetailer = new Map<
      number,
      { outbound: MockOutbound; lines: OutboundLine[] }[]
    >();
    for (const entry of filteredOutbounds(status, q)) {
      const list = byRetailer.get(entry.outbound.retailerId) ?? [];
      list.push(entry);
      byRetailer.set(entry.outbound.retailerId, list);
    }
    const rows: WholesaleSchema<"OutboundRetailerResponse">[] = [
      ...byRetailer.entries(),
    ]
      .sort(([a], [b]) => a - b)
      .map(([retailerId, entries]) => {
        const retailer = mockRetailer(retailerId);
        const shipped = entries
          .map((e) => e.outbound.shippedAt)
          .filter((s): s is string => s !== null)
          .sort();
        return {
          retailerId,
          retailerCode: retailer?.code ?? "",
          retailerName: retailer?.name ?? "",
          outboundCount: entries.length,
          totalQty: sumQty(entries.flatMap((e) => e.lines)),
          lastCreatedAt: entries
            .map((e) => e.outbound.createdAt)
            .sort()
            .at(-1) as string,
          lastShippedAt: shipped.at(-1) as string,
        };
      });
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size),
      meta: pageMeta(rows.length, page, size),
    });
  }),

  http.get("*/api/wholesale/outbounds", ({ request }) => {
    const url = new URL(request.url);
    const retailerId = url.searchParams.get("retailerId");
    const status = url.searchParams.get("status");
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
    if (retailerId !== null && mockRetailer(Number(retailerId)) === null)
      return fail(404, "RESOURCE_NOT_FOUND", "거래 이력이 없는 소매처입니다.");

    const rows = filteredOutbounds(status, q)
      .filter(
        ({ outbound }) =>
          retailerId === null || outbound.retailerId === Number(retailerId),
      )
      .sort((a, b) => b.outbound.createdAt.localeCompare(a.outbound.createdAt))
      .map(({ outbound, lines }) => summaryResponse(outbound, lines));
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size),
      meta: pageMeta(rows.length, page, size),
    });
  }),

  http.post("*/api/wholesale/outbounds", async ({ request }) => {
    const body =
      (await request.json()) as WholesaleSchema<"OutboundCreateRequest">;
    const ids = body.packingItemIds ?? [];
    if (ids.length === 0)
      return fail(
        400,
        "INVARIANT_VIOLATED",
        "담을 줄이 없습니다.",
        "packingItemIds",
      );
    if (new Set(ids).size !== ids.length)
      return fail(
        400,
        "DUPLICATE_PACKING_ITEM",
        "같은 줄이 두 번 들어왔습니다.",
        "packingItemIds",
      );

    // 스펙 설명의 에러 코드 순서대로 — 없는 줄(404) → 이미 포장된 줄(409) → 섞임(400)
    const all = mockPackings().flatMap((packing) =>
      packing.items.map((item) => ({ packing, item })),
    );
    const picked = ids.map((id) => all.find((x) => x.item.id === id) ?? null);
    if (picked.some((p) => p === null))
      return fail(404, "RESOURCE_NOT_FOUND", "없는 포장 줄이 섞여 있습니다.");
    const lines = picked
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map(({ packing, item }) => ({
        packing,
        item,
        order: orderOf(packing),
      }));
    if (lines.some((l) => l.packing.status !== "READY"))
      return fail(
        409,
        "PACKING_NOT_READY",
        "이미 봉투에 담긴 포장의 줄입니다.",
      );
    if (new Set(lines.map((l) => l.order.retailerId)).size > 1)
      return fail(
        400,
        "RETAILER_MIXED",
        "한 봉투에는 한 소매처의 줄만 담을 수 있습니다.",
        "packingItemIds",
      );
    if (new Set(lines.map((l) => l.order.receiveBy)).size > 1)
      return fail(
        400,
        "RECEIVE_BY_MIXED",
        "수령 방식이 다른 줄은 한 봉투에 담을 수 없습니다.",
        "packingItemIds",
      );

    const first = lines[0];
    if (!first) throw new Error("mock: 검증을 통과했는데 줄이 없다");
    const outbound: MockOutbound = {
      id: nextOutboundId++,
      outboundNumber: nextOutboundNumber++,
      retailerId: first.order.retailerId,
      receiveBy: first.order.receiveBy,
      createdAt: new Date().toISOString(),
      shippedAt: null,
      statementNumber: null,
    };
    outbounds.push(outbound);

    // 포장 단위로 담는다. 일부만 골랐으면 분할 — 남는 쪽이 id를 지키고 나가는 쪽이 새 포장(스펙)
    const packed: MockPacking[] = [];
    for (const packing of new Set(lines.map((l) => l.packing))) {
      const moving = packing.items.filter((item) => ids.includes(item.id));
      if (moving.length === packing.items.length) {
        packing.status = "PACKED";
        packing.outboundId = outbound.id;
        packed.push(packing);
      } else {
        packing.items = packing.items.filter((item) => !ids.includes(item.id));
        packed.push(
          addMockPacking({
            orderId: packing.orderId,
            createdAt: packing.createdAt,
            status: "PACKED",
            outboundId: outbound.id,
            items: moving,
          }),
        );
      }
    }

    const retailer = mockRetailer(outbound.retailerId);
    const data: WholesaleSchema<"OutboundCreatedResponse"> = {
      id: outbound.id,
      outboundNumber: outbound.outboundNumber,
      retailerId: outbound.retailerId,
      retailerName: retailer?.name ?? "",
      shippedAt: null as unknown as string,
      statementNumber: null as unknown as number,
      createdAt: outbound.createdAt,
      totalQty: sumQty(lines.map((l) => l.item)),
      packings: packed.map((p) => {
        const order = orderOf(p);
        return {
          id: p.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: "PACKED",
          items: p.items.map((item) => {
            const line = lineOf(order, item.orderItemId);
            return {
              id: item.id,
              orderItemId: item.orderItemId,
              variantId: line.variantId,
              variantNumber: line.variantNumber,
              productNumber: line.productNumber,
              productName: line.productName,
              color: line.color,
              size: line.size,
              qty: item.qty,
            };
          }),
        };
      }),
    };
    return HttpResponse.json({ data }, { status: 201 });
  }),

  http.get("*/api/wholesale/outbounds/:outboundId", ({ params }) => {
    const outbound = findOutbound(params.outboundId);
    if (!outbound)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "봉투가 없거나 접근할 수 없습니다.",
      );
    return HttpResponse.json({ data: detailResponse(outbound) });
  }),

  http.post("*/api/wholesale/outbounds/:outboundId/ship", ({ params }) => {
    const outbound = findOutbound(params.outboundId);
    if (!outbound)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "봉투가 없거나 접근할 수 없습니다.",
      );
    if (outbound.shippedAt !== null)
      return fail(409, "TRANSITION_NOT_ALLOWED", "이미 출고된 봉투입니다.");
    const lines = outboundLines(outbound);
    if (lines.length === 0)
      return fail(409, "OUTBOUND_EMPTY", "담긴 품목이 없습니다.");
    // 재고 검증은 여기서만(스펙: 상세의 isShippable엔 안 들어 있다). SKU 단위 합으로 본다
    for (const { line, qty } of mergedItems(lines)) {
      if (line.stockQty < qty)
        return fail(
          409,
          "INSUFFICIENT_STOCK",
          `${line.productName} ${line.color}/${line.size} 재고가 부족합니다.`,
        );
    }

    const shippedAt = new Date().toISOString();
    outbound.statementNumber = nextStatementNumber(shippedAt);
    outbound.shippedAt = shippedAt;
    for (const packing of new Set(lines.map((l) => l.packing))) {
      shipMockPacking(packing);
      // 상품·재고 탭이 보는 SKU 재고도 같이 줄인다 — 주문처리중이 풀리고 현재고가 준다
      for (const item of packing.items) {
        const line = lineOf(orderOf(packing), item.orderItemId);
        const variant = findMockVariant(line.variantId);
        if (variant) {
          variant.stockQty -= item.qty;
          variant.allocatedQty = Math.max(variant.allocatedQty - item.qty, 0);
        }
      }
    }
    return HttpResponse.json({ data: detailResponse(outbound) });
  }),

  http.get("*/api/wholesale/outbounds/:outboundId/statement", ({ params }) => {
    const outbound = findOutbound(params.outboundId);
    // 출고 확정 전도 404다(스펙)
    if (
      !outbound ||
      outbound.shippedAt === null ||
      outbound.statementNumber === null
    )
      return fail(404, "RESOURCE_NOT_FOUND", "아직 발행된 장끼가 없습니다.");
    return HttpResponse.json({
      data: statementResponse(
        outbound,
        outbound.shippedAt,
        outbound.statementNumber,
      ),
    });
  }),
];

/** 화면 검증 중 시드로 되돌릴 때. 앱은 부르지 않는다. 주문 목도 같이 되돌려야 맞물린다 */
export function resetShipmentMock() {
  outbounds = seedOutbounds();
  nextOutboundId = 8802;
  nextOutboundNumber = 2;
}
