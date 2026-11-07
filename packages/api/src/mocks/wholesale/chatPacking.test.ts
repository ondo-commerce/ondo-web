import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { GOLDEN_T0 } from "../chat/golden.testkit";
import { packingOrdersOf } from "../chat/packingOrders";
import { backorderSku, inquiryBackorders } from "./backorder";
import { chatHandlers, chatStore, resetChatMock } from "./chat";
import { orderHandlers, type MockOrder, type MockPacking } from "./order";
import { findMockProduct, findMockVariant } from "./product";
import {
  inquiryPackings,
  mockVariantOwner,
  packingRowsOf,
  shipmentHandlers,
} from "./shipment";

/**
 * loop-08i S2 포장 원본(`inquiryPackings`)과 채팅 포장 답의 목 HTTP 흐름. 채팅, 주문, 출고 목을 **한 서버에** 올린다 —
 * 브라우저 도매 탭과 같은 구성이라 주문 탭 포장, 봉투 담기, 출고 확정이 다음 자동 답에 바로 쓰이는지 본다.
 *
 * 시계: `Date`만 T0(2026-10-29 14:20 서울)로 고정한다. msw `delay`는 진짜다. 시나리오마다 새 reset(기획 §6 머리 11).
 */

const ORIGIN = "http://mock.test";

const server = setupServer(
  ...chatHandlers,
  ...orderHandlers,
  ...shipmentHandlers,
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_T0);
  resetChatMock();
});
afterEach(() => {
  vi.useRealTimers();
});

/* --- 합성 주문(시드를 안 바꾸고 소유 매핑을 보려고) ------------------------- */

function order(
  id: number,
  lines: { id: number; variantId: number }[],
  status: MockOrder["status"] = "CONFIRMED",
): MockOrder {
  return {
    id,
    orderNumber: id,
    orderedAt: "2026-10-01T10:00:00+09:00",
    retailerId: 1,
    retailerName: "봄봄상회",
    paymentMethod: "CASH",
    receiveBy: "AGENT",
    status,
    items: lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      productNumber: 1,
      variantNumber: 1,
      productName: "합성",
      color: "블랙",
      size: "M",
      unitPrice: 1000,
      qty: 5,
      allocatedQty: 0,
      shippedQty: 0,
      stockQty: 10,
      hasOpenBackorder: false,
    })),
    allocatedAmount: 0,
  };
}

function packing(
  id: number,
  orderId: number,
  items: { orderItemId: number; qty: number }[],
  status: MockPacking["status"] = "READY",
  outboundId: number | null = null,
): MockPacking {
  return {
    id,
    orderId,
    createdAt: "2026-10-02T10:00:00+09:00",
    status,
    outboundId,
    items: items.map((item, i) => ({ id: id * 10 + i, ...item })),
  };
}

const SHIPPED_OUTBOUND = 1;
const OPEN_OUTBOUND = 2;
const outboundShipped = (id: number) =>
  id === SHIPPED_OUTBOUND ? true : id === OPEN_OUTBOUND ? false : null;

describe("S2-1 ① 원본 변환(packingRowsOf)", () => {
  it("102 상품 variant(3012) 합성 주문 → 행 wholesalerId 102 → 방 101 x 1 판정 0건", () => {
    const rows = packingRowsOf({
      orders: [order(9701, [{ id: 1, variantId: 3012 }])],
      packings: [packing(9801, 9701, [{ orderItemId: 1, qty: 2 }])],
      outboundShipped,
      ownerOf: mockVariantOwner,
    });
    expect(rows).toEqual([
      {
        packingId: 9801,
        orderId: 9701,
        wholesalerId: 102,
        retailerId: 1,
        orderCancelled: false,
        packingStatus: "READY",
        outboundShipped: null,
        qty: 2,
      },
    ]);
    expect(packingOrdersOf(rows, 101, 1)).toEqual([]);
    expect(packingOrdersOf(rows, 102, 1)).toEqual([9701]);
  });

  it("소유: 줄마다 도매처 다름, variant 없음, 줄이 주문에 없음 → null. 같은 도매처 두 줄은 그 도매처, 수량은 합", () => {
    const rows = packingRowsOf({
      orders: [
        order(9701, [
          { id: 1, variantId: 3002 },
          { id: 2, variantId: 3012 },
          { id: 3, variantId: 99999 },
          { id: 4, variantId: 3011 },
        ]),
      ],
      packings: [
        packing(9801, 9701, [
          { orderItemId: 1, qty: 1 },
          { orderItemId: 2, qty: 1 },
        ]),
        packing(9802, 9701, [{ orderItemId: 3, qty: 1 }]),
        packing(9803, 9701, [{ orderItemId: 77, qty: 1 }]),
        packing(9804, 9701, [
          { orderItemId: 1, qty: 2 },
          { orderItemId: 4, qty: 3 },
        ]),
      ],
      outboundShipped,
      ownerOf: mockVariantOwner,
    });
    expect(rows.map((r) => [r.packingId, r.wholesalerId, r.qty])).toEqual([
      [9801, null, 2],
      [9802, null, 1],
      [9803, null, 1],
      [9804, 101, 5],
    ]);
  });

  it("봉투: 없음 null, 출고 전 false, 출고됨 true, 모르는 봉투 null. 주문 취소는 그대로 싣는다(거르지 않음)", () => {
    const rows = packingRowsOf({
      orders: [
        order(9701, [{ id: 1, variantId: 3002 }]),
        order(9702, [{ id: 2, variantId: 3002 }], "CANCELLED"),
      ],
      packings: [
        packing(9801, 9701, [{ orderItemId: 1, qty: 1 }]),
        packing(
          9802,
          9701,
          [{ orderItemId: 1, qty: 1 }],
          "PACKED",
          OPEN_OUTBOUND,
        ),
        packing(
          9803,
          9701,
          [{ orderItemId: 1, qty: 1 }],
          "PACKED",
          SHIPPED_OUTBOUND,
        ),
        packing(9804, 9701, [{ orderItemId: 1, qty: 1 }], "PACKED", 404),
        packing(9805, 9702, [{ orderItemId: 2, qty: 1 }]),
      ],
      outboundShipped,
      ownerOf: mockVariantOwner,
    });
    expect(
      rows.map((r) => [
        r.packingId,
        r.packingStatus,
        r.outboundShipped,
        r.orderCancelled,
      ]),
    ).toEqual([
      [9801, "READY", null, false],
      [9802, "PACKED", false, false],
      [9803, "PACKED", true, false],
      [9804, "PACKED", null, false],
      [9805, "READY", null, true],
    ]);
    // 판정이 고르면 9701 하나(READY 봉투 없음, PACKED 출고 전). 취소 주문 9702는 빠진다
    expect(packingOrdersOf(rows, 101, 1)).toEqual([9701]);
  });

  it("상품 목 소유 경로: 3012 → 1004 → 102, 3020 → 1006 → 103, 3002 → 101, 없는 variant → null", () => {
    expect(mockVariantOwner(3012)).toBe(102);
    expect(mockVariantOwner(3020)).toBe(103);
    expect(mockVariantOwner(3002)).toBe(101);
    expect(mockVariantOwner(99999)).toBeNull();
  });
});

describe("S2-1 ① 원본(inquiryPackings)은 주문 목 포장 전부, 부를 때마다 지금 읽는다", () => {
  it("기본 시드 → 출고된 9100 한 줄(거르지 않음). 주문 탭 포장 뒤 다음 호출에 READY 7002가 더해진다", async () => {
    expect(inquiryPackings()).toEqual([
      {
        packingId: 9100,
        orderId: 7004,
        wholesalerId: 101,
        retailerId: 1,
        orderCancelled: false,
        packingStatus: "PACKED",
        outboundShipped: true,
        qty: 3,
      },
    ]);
    const res = await fetch(`${ORIGIN}/api/wholesale/orders/7002/packings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ orderItemId: 8002, allocateQty: 1 }] }),
    });
    expect(res.status).toBe(201);
    const rows = inquiryPackings();
    expect(rows.map((r) => [r.orderId, r.packingStatus, r.qty])).toEqual([
      [7004, "PACKED", 3],
      [7002, "READY", 1],
    ]);
    expect(rows[1]).toMatchObject({
      wholesalerId: 101,
      retailerId: 1,
      outboundShipped: null,
      orderCancelled: false,
    });
  });
});

describe("S2-1 ② 주문 목 variant의 상품 목 소유 = 미송 목 소유", () => {
  it.each([3002, 3003, 3011, 3019])(
    "variant %i: 상품 목에 있고 소유가 backorderSku 소유와 같다",
    (variantId) => {
      const variant = findMockVariant(variantId);
      expect(variant).not.toBeNull();
      const product =
        variant === null ? null : findMockProduct(variant.productId);
      expect(product).not.toBeNull();
      const sku = backorderSku(variantId);
      expect(sku).not.toBeNull();
      expect(mockVariantOwner(variantId)).toBe(product?.wholesalerId);
      expect(mockVariantOwner(variantId)).toBe(sku?.wholesalerId);
    },
  );
});

/* --- 목 HTTP 도우미 ------------------------------------------------------- */

type Message = WholesaleSchema<"ChatMessage">;
type ErrorBody = { errors: { field: string; code: string }[] };

const API = `${ORIGIN}/api/wholesale`;
const ASK = "미송 언제 와요?";
const ONE = "출고 준비 중인 주문이 있어요(#7002)";

async function call<T>(
  method: string,
  url: string,
  json?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text === "" ? null : JSON.parse(text)) as T,
  };
}

async function reset(input: Record<string, unknown> = {}) {
  return call<ErrorBody>("POST", `${ORIGIN}/__mock/chat/reset`, input);
}

function roomOneSize(): number {
  return chatStore.rooms().find((r) => r.roomId === 1)?.messages.length ?? -1;
}

/**
 * 방 1에 소매 질문 하나(판정 돌림). 돌려주는 건 그 요청이 만든 줄(소매 글 뒤). 방 메시지 증가 = 줄 수 + 1(소매 글)도
 * 여기서 본다 — 응답에만 있고 방에 안 남은 줄, 또는 그 반대를 잡으려고
 */
async function ask(body = ASK): Promise<Message[]> {
  const before = roomOneSize();
  const res = await call<{ data: Message[] }>(
    "POST",
    `${ORIGIN}/__mock/chat/rooms/1/incoming`,
    { body, autoReply: true },
  );
  expect(res.status).toBe(201);
  const generated = res.body.data.slice(1);
  expect(roomOneSize() - before).toBe(generated.length + 1);
  return generated;
}

const kinds = (lines: readonly Message[]) => lines.map((m) => m.kind);

/** 주문 탭 `포장 준비`. 만든 포장 id와 포장 줄 id */
async function pack(orderId: number, orderItemId: number, qty: number) {
  const res = await call<{
    data: { id: number; items: { id: number }[] };
  }>("POST", `${API}/orders/${orderId}/packings`, {
    items: [{ orderItemId, allocateQty: qty }],
  });
  expect(res.status).toBe(201);
  return {
    id: res.body.data.id,
    itemIds: res.body.data.items.map((i) => i.id),
  };
}

/** 출고 탭 봉투 담기 → 출고 확정 전 봉투 id */
async function bag(packingItemIds: number[]): Promise<number> {
  const res = await call<{ data: { id: number } }>("POST", `${API}/outbounds`, {
    packingItemIds,
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function ship(outboundId: number) {
  const res = await call("POST", `${API}/outbounds/${outboundId}/ship`);
  expect(res.status).toBe(200);
}

let keySeq = 0;
/** 도매 사장 직접 답(TEXT). 열린 넘김이 닫힌다 */
async function ownerText(body = "내일 보내 드릴게요") {
  keySeq += 1;
  const res = await call(
    "POST",
    `${API}/chat/rooms/1/messages`,
    { body, inquiry: null },
    {
      "Idempotency-Key": `00000000-0000-4000-b000-${String(keySeq).padStart(12, "0")}`,
    },
  );
  expect(res.status).toBe(201);
}

function expectPackingReply(lines: readonly Message[], body: string) {
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(body);
  expect(lines[0]?.autoReply?.intent).toBe("BACKORDER");
  expect(lines[1]?.handoff).toMatchObject({
    reason: "NO_BACKORDER",
    intent: "BACKORDER",
  });
}

describe("S2-2 목 HTTP 생명주기(도매, 새 reset)", () => {
  it("포장 → [A, H] → 봉투 → [A, H] → 출고 → [] → [] → 사장 TEXT → [HANDOFF]", async () => {
    expect((await reset({ noBackorders: true })).status).toBe(200);
    const a = await pack(7002, 8002, 1);
    expectPackingReply(await ask(), ONE);

    const outbound = await bag(a.itemIds);
    expectPackingReply(await ask(), ONE);

    await ship(outbound);
    expect(kinds(await ask())).toEqual([]);
    expect(kinds(await ask())).toEqual([]);

    await ownerText();
    const after = await ask();
    expect(kinds(after)).toEqual(["HANDOFF"]);
    expect(after[0]?.handoff?.reason).toBe("NO_BACKORDER");
  });
});

describe("S2-3 목 HTTP 원본 실패 복구(새 reset, 포장 먼저)", () => {
  it("7002 포장 → fail {op: packing} 1회 → [HANDOFF] → 다음 질문 [A, H](열린 같은 이유 넘김이 있어도 둘 다)", async () => {
    await reset({ noBackorders: true });
    await pack(7002, 8002, 1);
    const fail = await call("POST", `${ORIGIN}/__mock/chat/fail`, {
      op: "packing",
    });
    expect(fail.status).toBe(200);
    const failed = await ask();
    expect(kinds(failed)).toEqual(["HANDOFF"]);
    expect(failed[0]?.handoff).toMatchObject({
      reason: "NO_BACKORDER",
      intent: "BACKORDER",
    });
    expectPackingReply(await ask(), ONE);
  });
});

describe("S2-4 목 HTTP 삭제와 같은 주문 일부 출고(각자 새 reset)", () => {
  it("① 7002 포장 → DELETE /packings/{id} → [HANDOFF]", async () => {
    await reset({ noBackorders: true });
    const a = await pack(7002, 8002, 1);
    const del = await call("DELETE", `${API}/packings/${a.id}`);
    expect(del.status).toBe(204);
    expect(kinds(await ask())).toEqual(["HANDOFF"]);
  });

  it("② 7003 확정 1 → 포장 A, 추가 1 → 포장 B, A만 출고 → [A, H] (#7003). B도 출고 → [], 사장 TEXT 뒤 [HANDOFF]", async () => {
    await reset({ noBackorders: true });
    const confirm = await call("POST", `${API}/orders/7003/confirm`, {
      items: [{ orderItemId: 8003, allocateQty: 1 }],
    });
    expect(confirm.status).toBe(200);
    const queue = await call<{
      data: { id: number; items: { id: number }[] }[];
    }>("GET", `${API}/orders/7003/packings`);
    expect(queue.body.data).toHaveLength(1);
    const a = queue.body.data[0];
    if (a === undefined) throw new Error("포장 A");
    const b = await pack(7003, 8003, 1);
    expect(b.id).not.toBe(a.id);

    await ship(await bag(a.items.map((i) => i.id)));
    expectPackingReply(await ask(), "출고 준비 중인 주문이 있어요(#7003)");

    await ship(await bag(b.itemIds));
    expect(kinds(await ask())).toEqual([]);
    await ownerText();
    expect(kinds(await ask())).toEqual(["HANDOFF"]);
  });
});

describe("S2-5 reset readyPackings(도매)", () => {
  it("① {noBackorders, readyPackings: [7002]} → 포장 9100 + READY 7002(수량 1), 질문 [A, H]", async () => {
    expect(
      (await reset({ noBackorders: true, readyPackings: [7002] })).status,
    ).toBe(200);
    expect(
      inquiryPackings().map((r) => [r.orderId, r.packingStatus, r.qty]),
    ).toEqual([
      [7004, "PACKED", 3],
      [7002, "READY", 1],
    ]);
    expectPackingReply(await ask(), ONE);
  });

  it("② {readyPackings: [7002]}(미송 남김) → 미송 되묻기 [CLARIFY]", async () => {
    await reset({ readyPackings: [7002] });
    expect(kinds(await ask())).toEqual(["CLARIFY"]);
  });

  it("④ readyPackings [] 과 칸 없음 → 포장은 시드 9100 하나", async () => {
    await reset({ readyPackings: [] });
    expect(inquiryPackings().map((r) => r.packingId)).toEqual([9100]);
    await reset({});
    expect(inquiryPackings().map((r) => r.packingId)).toEqual([9100]);
  });

  /**
   * ③ 실패. 부르기 전 상태를 먼저 만든다: 미송 비움 + 7002를 op로 포장 + 방 1 소매 글 1. reset이 일어나면 셋 다
   * 바뀐다(미송 시드 복귀, 포장 9100만, 방 1 시드 메시지 수) — 검사를 reset 뒤로 옮기면 여기서 잡힌다
   */
  it.each([
    ["isPackable false(7003 신규)", [[7003]], "NOT_PACKABLE"],
    [
      "isPackable은 재고를 안 본다: 7001 상태는 되는데 재고 0",
      [[7001]],
      "INSUFFICIENT_STOCK",
    ],
    ["시드에 없음", [[9999]], "NOT_FOUND"],
    ["앞은 되고 뒤가 없음", [[7002, 9999]], "NOT_FOUND"],
    ["중복", [[7002, 7002]], "DUPLICATE"],
    ["0 이하, 정수 아님", [[-1], ["7002"]], "INVALID"],
  ] as const)(
    "③ %s → 400 field readyPackings, 포장 수, 방 1 메시지 수, 미송 수 그대로",
    async (_, values, code) => {
      await reset({ noBackorders: true });
      await pack(7002, 8002, 1);
      const injected = await call(
        "POST",
        `${ORIGIN}/__mock/chat/rooms/1/incoming`,
        { body: "안녕하세요" },
      );
      expect(injected.status).toBe(201);
      const before = {
        packings: inquiryPackings().length,
        room: roomOneSize(),
        backorders: inquiryBackorders().length,
      };
      expect(before.packings).toBe(2);
      expect(before.backorders).toBe(0);
      for (const value of values) {
        const res = await reset({ noBackorders: true, readyPackings: value });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([
          expect.objectContaining({ field: "readyPackings", code }),
        ]);
        expect({
          packings: inquiryPackings().length,
          room: roomOneSize(),
          backorders: inquiryBackorders().length,
        }).toEqual(before);
      }
    },
  );
});

describe("S2-6 기본 시드 회귀(도매)", () => {
  it("기본 reset → 방 1 되묻기 [CLARIFY], {noBackorders} → [HANDOFF](포장은 출고된 9100뿐)", async () => {
    await reset();
    expect(kinds(await ask())).toEqual(["CLARIFY"]);
    await reset({ noBackorders: true });
    expect(kinds(await ask())).toEqual(["HANDOFF"]);
  });
});

describe("S2-1 ③ 포장 줄 단위 분할 합성", () => {
  it("같은 주문 READY 행(남는 쪽) + 출고 전 PACKED 행(나간 쪽) → 판정 1건", () => {
    const rows = packingRowsOf({
      orders: [
        order(9701, [
          { id: 1, variantId: 3002 },
          { id: 2, variantId: 3011 },
        ]),
      ],
      packings: [
        packing(9801, 9701, [{ orderItemId: 1, qty: 1 }]),
        packing(
          9802,
          9701,
          [{ orderItemId: 2, qty: 1 }],
          "PACKED",
          OPEN_OUTBOUND,
        ),
      ],
      outboundShipped,
      ownerOf: mockVariantOwner,
    });
    expect(rows).toHaveLength(2);
    expect(packingOrdersOf(rows, 101, 1)).toEqual([9701]);
  });
});
