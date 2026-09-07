import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { findMockProduct, findMockVariant } from "./product";

/**
 * 재고 목 — 입고·재고 조정·변동 이력. 상품 목(`./product`)의 variant 상태를 **같이 쓴다**:
 * 여기서 입고하면 `GET /products/{id}`의 `stockQty`·`avgCost`가 바뀐다. 재고 탭이 그 응답으로
 * SKU 표를 그리기 때문이다(스펙: "재고탭 SKU 표가 모두 이 응답을 쓴다").
 *
 * BE 컨트롤러는 스텁(MUL-83)이고 `InventoryStubExamples.java`가 있지만 **그 값은 상태를 흉내 낼 수
 * 없다** — 입고 응답이 SKU 90231·`qtyAfter 1284`로 고정이라 시드 SKU(3001~3020)의 수량과 맞물려
 * 움직이지 않는다. 그래서 스텁 값 대신 스펙 설명("재고를 올린다", "변동 이력에 ADJUST 한 줄",
 * "시간 역순", "`0`은 거절", "같은 키 재요청은 200 + 동일 본문")을 여기서 흉내 낸다.
 * 스텁의 모양(필드·enum)은 스펙이 지킨다 — `WholesaleSchema`라 스펙이 바뀌면 컴파일에서 깨진다.
 *
 * 시드(`V900__seed_dev.sql`)에는 `stock_movement`·`inbound`·`avg_cost`가 없다. 그래서
 * **이력은 비어서 시작**한다 — 처음 펼친 SKU는 "아직 재고가 움직인 적이 없습니다"를 보이고,
 * 입고·조정을 하면 그때부터 쌓인다. 평균원가도 0에서 시작해 이동평균으로 올라간다.
 * 새로고침하면 시드로 돌아간다.
 */

type MovementType = WholesaleSchema<"StockMovementResponse">["type"];

interface MockMovement {
  id: number;
  variantId: number;
  type: MovementType;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  /** 출처 로트. 조정은 항상 null(BE 주석) */
  refType: string | null;
  refId: number | null;
  createdAt: string;
}

/* --- 상태 --------------------------------------------------------------- */

let movements: MockMovement[] = [];
let nextMovementId = 55001;
let nextInboundId = 4101;
let nextInboundItemId = 77301;
/** 멱등키 → 그 키로 만든 응답. 같은 키 재요청은 이걸 그대로 돌려준다 */
let inboundsByKey = new Map<
  string,
  { bodyHash: string; response: WholesaleSchema<"InboundCreatedResponse"> }
>();

/* --- 도우미 --------------------------------------------------------------- */

/** 스펙에 nullable이 없어 타입은 string/number지만 조정 이력은 null이다 */
function nullable<T>(value: T | null): T {
  return value as unknown as T;
}

function movementResponse(
  m: MockMovement,
): WholesaleSchema<"StockMovementResponse"> {
  return {
    id: m.id,
    variantId: m.variantId,
    type: m.type,
    qtyBefore: m.qtyBefore,
    qtyChange: m.qtyChange,
    qtyAfter: m.qtyAfter,
    refType: nullable(m.refType),
    refId: nullable(m.refId),
    createdAt: m.createdAt,
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

function record(
  variantId: number,
  type: MovementType,
  qtyBefore: number,
  qtyChange: number,
  ref: { refType: string; refId: number } | null,
  createdAt: string,
): MockMovement {
  const m: MockMovement = {
    id: nextMovementId++,
    variantId,
    type,
    qtyBefore,
    qtyChange,
    qtyAfter: qtyBefore + qtyChange,
    refType: ref?.refType ?? null,
    refId: ref?.refId ?? null,
    createdAt,
  };
  movements.push(m);
  return m;
}

/** 요청 본문이 같은지 볼 때. 키 재사용 판정(`IDEMPOTENCY_KEY_REUSED`)에만 쓴다 */
function hashOf(body: unknown): string {
  return JSON.stringify(body);
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다.
 */
export const inventoryHandlers = [
  http.post("*/api/wholesale/inbounds", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key");
    if (!key)
      return fail(
        400,
        "VALIDATION_FAILED",
        "Idempotency-Key 헤더가 필요합니다.",
        "Idempotency-Key",
      );
    const body =
      (await request.json()) as WholesaleSchema<"InboundCreateRequest">;
    const bodyHash = hashOf(body);

    // 같은 키 재요청은 200 + 동일 본문(멱등). 같은 키에 다른 body는 409
    const known = inboundsByKey.get(key);
    if (known) {
      if (known.bodyHash !== bodyHash)
        return fail(
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "같은 Idempotency-Key로 다른 요청이 왔습니다.",
        );
      return HttpResponse.json({ data: known.response }, { status: 200 });
    }

    const items = body.items ?? [];
    if (items.length === 0)
      return fail(
        400,
        "INVARIANT_VIOLATED",
        "입고할 라인이 없습니다.",
        "items",
      );

    // 부분 성공 없음 — 전부 검사한 뒤에 적용한다
    const lots = new Set<string>();
    for (const item of items) {
      if (!Number.isInteger(item.qty) || item.qty < 1)
        return fail(
          400,
          "INVARIANT_VIOLATED",
          "입고수량은 1 이상이어야 합니다.",
          "items",
        );
      if (item.unitCost !== undefined && item.unitCost < 0)
        return fail(
          400,
          "INVARIANT_VIOLATED",
          "매입단가는 0 이상이어야 합니다.",
          "items",
        );
      // (variantId, unitCost)가 완전히 같은 중복만 거절(BE DTO 주석)
      const lot = `${item.variantId}:${item.unitCost ?? ""}`;
      if (lots.has(lot))
        return fail(
          400,
          "DUPLICATE_LOT",
          "같은 SKU·같은 단가의 로트가 두 번 들어왔습니다.",
          "items",
        );
      lots.add(lot);
      if (!findMockVariant(item.variantId))
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "SKU가 없거나 접근할 수 없습니다.",
        );
    }

    // 적용 — 라인마다 순차 누적. `qtyAfter`·`avgCostAfter`는 그 라인 반영 직후 값(BE DTO 주석)
    const receivedAt = body.receivedAt ?? new Date().toISOString();
    const inboundId = nextInboundId++;
    const responseItems: WholesaleSchema<"InboundItemResponse">[] = [];
    for (const item of items) {
      const v = findMockVariant(item.variantId);
      const p = v ? findMockProduct(v.productId) : null;
      if (!v || !p) continue;
      const before = v.stockQty;
      // 평균원가는 이동평균(glossary §3.1). 단가를 안 적은 로트는 원가를 바꾸지 않는다
      if (item.unitCost !== undefined) {
        v.avgCost =
          before + item.qty === 0
            ? item.unitCost
            : Math.round(
                (v.avgCost * before + item.unitCost * item.qty) /
                  (before + item.qty),
              );
      }
      v.stockQty = before + item.qty;
      const itemId = nextInboundItemId++;
      record(
        v.id,
        "IN",
        before,
        item.qty,
        { refType: "INBOUND_ITEM", refId: itemId },
        receivedAt,
      );
      responseItems.push({
        id: itemId,
        variantId: v.id,
        productNumber: p.productNumber,
        variantNumber: v.variantNumber,
        qty: item.qty,
        unitCost: nullable(item.unitCost ?? null),
        remainingQty: item.qty,
        qtyAfter: v.stockQty,
        avgCostAfter: v.avgCost,
      });
    }

    const response: WholesaleSchema<"InboundCreatedResponse"> = {
      id: inboundId,
      receivedAt,
      items: responseItems,
    };
    inboundsByKey.set(key, { bodyHash, response });
    return HttpResponse.json({ data: response }, { status: 201 });
  }),

  http.post(
    "*/api/wholesale/variants/:variantId/stock-adjustments",
    async ({ params, request }) => {
      const v = findMockVariant(Number(params.variantId));
      if (!v)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "SKU가 없거나 접근할 수 없습니다.",
        );
      const body =
        (await request.json()) as WholesaleSchema<"StockAdjustmentRequest">;
      const change = body.qtyChange;
      if (!Number.isInteger(change) || change === 0)
        return fail(
          400,
          "INVARIANT_VIOLATED",
          "증감 수량은 0이 아닌 정수여야 합니다.",
          "qtyChange",
        );
      const after = v.stockQty + change;
      if (after < 0)
        return fail(409, "STOCK_BELOW_ZERO", "재고가 0 아래로 내려갑니다.");
      if (after < v.allocatedQty)
        return fail(
          409,
          "STOCK_BELOW_ALLOCATED",
          "주문처리중 수량보다 재고가 적어집니다.",
        );

      const m = record(
        v.id,
        "ADJUST",
        v.stockQty,
        change,
        null,
        new Date().toISOString(),
      );
      v.stockQty = after;
      return HttpResponse.json({ data: movementResponse(m) }, { status: 201 });
    },
  ),

  http.get(
    "*/api/wholesale/variants/:variantId/stock-movements",
    ({ params, request }) => {
      const v = findMockVariant(Number(params.variantId));
      if (!v)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "SKU가 없거나 접근할 수 없습니다.",
        );
      const url = new URL(request.url);
      const type = url.searchParams.get("type");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const page = Number(url.searchParams.get("page") ?? 0);
      const size = Number(url.searchParams.get("size") ?? 20);
      if (size > 100)
        return fail(
          400,
          "VALIDATION_FAILED",
          "size는 100 이하여야 합니다.",
          "size",
        );

      // 시간 역순(같은 시각이면 나중에 쌓인 것 먼저)
      const rows = movements
        .filter((m) => m.variantId === v.id)
        .filter((m) => !type || m.type === type)
        .filter((m) => !from || m.createdAt.slice(0, 10) >= from)
        .filter((m) => !to || m.createdAt.slice(0, 10) <= to)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

      const meta: WholesaleSchema<"PageMeta"> = {
        page,
        size,
        totalElements: rows.length,
        totalPages: Math.max(Math.ceil(rows.length / size), 1),
      };
      const body: WholesaleSchema<"ApiResponseListStockMovementResponse"> = {
        data: rows.slice(page * size, page * size + size).map(movementResponse),
        meta,
      };
      return HttpResponse.json(body);
    },
  ),
];

/** 화면 검증 중 시드로 되돌릴 때(수량은 `resetProductMock`이 맡는다). 앱은 부르지 않는다 */
export function resetInventoryMock() {
  movements = [];
  nextMovementId = 55001;
  nextInboundId = 4101;
  nextInboundItemId = 77301;
  inboundsByKey = new Map();
}
