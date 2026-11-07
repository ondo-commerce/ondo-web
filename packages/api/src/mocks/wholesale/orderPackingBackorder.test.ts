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
import { backorderHandlers, mockBackorders } from "./backorder";
import { chatHandlers, chatStore, resetChatMock } from "./chat";
import { notificationHandlers } from "./notification";
import { addMockOrder, mockOrders, mockPackings, orderHandlers } from "./order";
import { shipmentHandlers } from "./shipment";

/**
 * loop-08k S1 주문 탭 길 포장(포장 준비 op, 확정 op의 이번 출고, reset `readyPackings`)이 대응되는 미송을 줄이고,
 * 그 포장 삭제가 되살리는 목 HTTP 흐름. 채팅, 알림, 주문, 미송, 출고 목을 한 서버에 올린다(`index.ts` 순서, 08j와 같다).
 *
 * 시계: `Date`만 T0(2026-10-29 14:20 서울). 시나리오마다 새 reset(기획 §6 머리 11).
 * 도우미는 08j `backorderPacking.test.ts`에서 옮겨 적었다(그 파일은 기획 §3 표의 세 곳만 고친다).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;
const ASK = "미송 언제 와요?";

/** 되묻기 보기 글자(기획 §6 L1 L2 L6 L3) */
const L1 = "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001";
const L2 = "와이드 데님 팬츠 소라/M, 남은 1장, 9/6 주문 #7002";
const L6 = "빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006";
const L3 = (n: number) =>
  `린넨 셋업 자켓 베이지/L, 남은 ${n}장, 9/7 주문 #7003`;

const server = setupServer(
  ...chatHandlers,
  ...notificationHandlers,
  ...orderHandlers,
  ...backorderHandlers,
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

/* --- 목 HTTP 도우미 ------------------------------------------------------- */

type Message = WholesaleSchema<"ChatMessage">;
type ErrorBody = {
  code?: string;
  errors: { field: string; code: string }[];
};

async function call<T>(method: string, url: string, json?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
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

/** 방 1에 소매 질문 하나(판정 돌림). 돌려주는 건 그 요청이 만든 줄(소매 글 뒤) */
async function ask(body = ASK): Promise<Message[]> {
  const res = await call<{ data: Message[] }>(
    "POST",
    `${ORIGIN}/__mock/chat/rooms/1/incoming`,
    { body, autoReply: true },
  );
  expect(res.status).toBe(201);
  return res.body.data.slice(1);
}

const kinds = (lines: readonly Message[]) => lines.map((m) => m.kind);

/** 되묻기 보기 글자. NOT_LISTED는 뺀다 */
const choiceLabels = (lines: readonly Message[]) =>
  (lines[0]?.autoReply?.choices ?? [])
    .filter((c) => c.kind === "BACKORDER")
    .map((c) => c.label);

/** 미송 탭 `배분 확정` */
async function allocate(items: [backorderId: number, qty: number][]) {
  return call<{ data: WholesaleSchema<"AllocationBatchResponse"> } & ErrorBody>(
    "POST",
    `${API}/backorders/allocations`,
    {
      items: items.map(([backorderId, allocateQty]) => ({
        backorderId,
        allocateQty,
      })),
    },
  );
}

/** "아무것도 안 바뀜"을 값으로 본다(08j `snapshot()` 그대로) */
async function snapshot() {
  const available: Record<number, number> = {};
  for (const id of [3002, 3003, 3011, 3019]) {
    const res = await call<{
      stats: WholesaleSchema<"BackorderStatsResponse">;
    }>("GET", `${API}/variants/${id}/backorders`);
    available[id] = res.body.stats.availableQty;
  }
  return {
    backorders: mockBackorders().map((b) => ({
      id: b.id,
      remainingQty: b.remainingQty,
      status: b.status,
    })),
    available,
    packings: mockPackings().map((p) => ({
      id: p.id,
      orderId: p.orderId,
      status: p.status,
      items: p.items.map((i) => [i.id, i.orderItemId, i.qty]),
    })),
    orders: mockOrders().map((o) => ({
      id: o.id,
      status: o.status,
      lines: o.items.map((l) => [l.id, l.allocatedQty]),
    })),
    roomOne: roomOneSize(),
  };
}

async function skus() {
  const res = await call<{
    data: WholesaleSchema<"BackorderSkuResponse">[];
  }>("GET", `${API}/backorders/variants`);
  return res.body.data;
}

/** 미송 탭 SKU 한 행 [variantId, 미송 수, 가용재고]. 없으면 null */
async function skuRow(variantId: number) {
  const s = (await skus()).find((x) => x.variantId === variantId);
  return s === undefined ? null : [s.variantId, s.backorderQty, s.availableQty];
}

/** 미송 탭 펼친 표(OPEN만)와 SKU 통계 */
async function openBackorders(variantId: number) {
  const res = await call<{
    data: WholesaleSchema<"BackorderResponse">[];
    stats: WholesaleSchema<"BackorderStatsResponse">;
  }>("GET", `${API}/variants/${variantId}/backorders`);
  return res.body;
}

const availableOf = async (variantId: number) =>
  (await openBackorders(variantId)).stats.availableQty;

/** 주문 탭 상세의 줄 하나 */
async function orderLine(orderId: number, lineId: number) {
  const res = await call<{ data: WholesaleSchema<"OrderDetailResponse"> }>(
    "GET",
    `${API}/orders/${orderId}`,
  );
  const l = res.body.data.items.find((x) => x.id === lineId);
  if (l === undefined) throw new Error(`줄 ${lineId}`);
  return l;
}

/** 미송 목 행 하나 [남은 수량, 상태] */
function backorderRow(id: number) {
  const b = mockBackorders().find((x) => x.id === id);
  return b === undefined ? null : [b.remainingQty, b.status];
}

async function del(packingId: number) {
  return call<ErrorBody>("DELETE", `${API}/packings/${packingId}`);
}

/** 주문 탭 `포장 준비` 요청(상태 확인은 부르는 쪽) */
async function packRaw(orderId: number, orderItemId: number, qty: number) {
  return call<{ data: { id: number; items: { id: number }[] } } & ErrorBody>(
    "POST",
    `${API}/orders/${orderId}/packings`,
    { items: [{ orderItemId, allocateQty: qty }] },
  );
}

/** 주문 탭 `포장 준비` 201. 만든 포장 id와 포장 줄 id */
async function pack(orderId: number, orderItemId: number, qty: number) {
  const res = await packRaw(orderId, orderItemId, qty);
  expect(res.status).toBe(201);
  return {
    id: res.body.data.id,
    itemIds: res.body.data.items.map((i) => i.id),
  };
}

/** 주문 탭 `주문 확정`(이번 출고 수량) */
async function confirm(orderId: number, orderItemId: number, qty: number) {
  return call<ErrorBody>("POST", `${API}/orders/${orderId}/confirm`, {
    items: [{ orderItemId, allocateQty: qty }],
  });
}

/** 그 주문의 주문 목 포장 id(만든 순) */
const packingIdsOf = (orderId: number) =>
  mockPackings()
    .filter((p) => p.orderId === orderId)
    .map((p) => p.id);

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

/* --- S1-1 S1-2 포장 준비 → 해소, 삭제 → 부활 ------------------------------- */

describe("S1-1 주문 탭 포장 → 미송 해소", () => {
  it("기본 reset → 7002 포장 준비 8002 × 1 → 9002 [0, RESOLVED], 미송 탭 3011 없음, 가용 5, 7002 줄 미송 0 가용 5 → [CLARIFY] [L1, L6, L3(2)]", async () => {
    await pack(7002, 8002, 1);
    expect(backorderRow(9002)).toEqual([0, "RESOLVED"]);
    expect(await skuRow(3011)).toBeNull();
    expect(await availableOf(3011)).toBe(5);
    const l = await orderLine(7002, 8002);
    expect([l.backorderQty, l.variantAvailableQty]).toEqual([0, 5]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([L1, L6, L3(2)]);
  });
});

describe("S1-2 삭제 부활", () => {
  it("S1-1 준비 → 그 포장 삭제 204 → 9002 [1, OPEN], 3011 미송 1 가용 6, 7002 줄 미송 1 가용 6 → [CLARIFY] [L1, L2, L6, L3(2)]", async () => {
    const { id } = await pack(7002, 8002, 1);
    expect((await del(id)).status).toBe(204);
    expect(backorderRow(9002)).toEqual([1, "OPEN"]);
    expect(await skuRow(3011)).toEqual([3011, 1, 6]);
    const l = await orderLine(7002, 8002);
    expect([l.backorderQty, l.variantAvailableQty]).toEqual([1, 6]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([L1, L2, L6, L3(2)]);
  });
});

/* --- S1-3 부분 포장 두 길 ------------------------------------------------- */

describe("S1-3 부분 포장(수량 2 줄에서 1장)", () => {
  /** 두 길이 같은 끝 값에 닿는지 본다 */
  async function expectHalfPacked() {
    expect(backorderRow(9003)).toEqual([1, "OPEN"]);
    expect(await skuRow(3019)).toEqual([3019, 1, 3]);
    const l = await orderLine(7003, 8003);
    expect([l.allocatedQty, l.backorderQty, l.variantAvailableQty]).toEqual([
      1, 1, 3,
    ]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([L3(1)]);
    expect(JSON.stringify(lines)).not.toContain("출고 준비 중");
  }

  it("① reset [9003] → 7003 확정 이번 출고 1 → 9003 [1, OPEN], 3019 미송 1 가용 3, 줄 배분 1 미송 1 가용 3 → [CLARIFY] [L3(1)], 포장 답 0", async () => {
    await reset({ backorderIds: [9003] });
    expect((await confirm(7003, 8003, 1)).status).toBe(200);
    await expectHalfPacked();
  });

  it("② reset [9003] → 확정 0(9003 [2, OPEN] 그대로) → 포장 준비 1 → ①과 같은 값", async () => {
    await reset({ backorderIds: [9003] });
    expect((await confirm(7003, 8003, 0)).status).toBe(200);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
    expect(packingIdsOf(7003)).toEqual([]);
    await pack(7003, 8003, 1);
    await expectHalfPacked();
  });
});

/* --- S1-4 두 길이 섞임 --------------------------------------------------- */

describe("S1-4 미송 탭 배분과 주문 탭 포장이 섞임", () => {
  it("① 미송 탭 9003 × 1(A) → 7003 확정 1(B) → 9003 [0, RESOLVED], 가용 2, READY [A, B] → [A, H] (#7003) → B 삭제 [1, OPEN] 가용 3 → A 삭제 [2, OPEN] 가용 4", async () => {
    await reset({ backorderIds: [9003] });
    const res = await allocate([[9003, 1]]);
    expect(res.status).toBe(201);
    const a = res.body.data.packings[0]?.id ?? -1;
    expect((await confirm(7003, 8003, 1)).status).toBe(200);
    const b = packingIdsOf(7003).find((id) => id !== a) ?? -1;
    expect(backorderRow(9003)).toEqual([0, "RESOLVED"]);
    expect(await availableOf(3019)).toBe(2);
    expect(
      mockPackings()
        .filter((p) => p.orderId === 7003)
        .map((p) => [p.id, p.status]),
    ).toEqual([
      [a, "READY"],
      [b, "READY"],
    ]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe("출고 준비 중인 주문이 있어요(#7003)");

    expect((await del(b)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([1, "OPEN"]);
    expect(await availableOf(3019)).toBe(3);
    expect((await orderLine(7003, 8003)).allocatedQty).toBe(1);

    expect((await del(a)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
    expect(await availableOf(3019)).toBe(4);
    expect((await orderLine(7003, 8003)).allocatedQty).toBe(0);
  });

  it("② 확정 1 → 미송 탭 9003 × 2 409 ALLOCATION_EXCEEDS_REMAINING 불변 → 9003 × 1 201 해소 → 9003 × 1 409 BACKORDER_NOT_OPEN 불변", async () => {
    await reset({ backorderIds: [9003] });
    expect((await confirm(7003, 8003, 1)).status).toBe(200);

    let before = await snapshot();
    const over = await allocate([[9003, 2]]);
    expect([over.status, over.body.code]).toEqual([
      409,
      "ALLOCATION_EXCEEDS_REMAINING",
    ]);
    expect(await snapshot()).toEqual(before);

    const ok = await allocate([[9003, 1]]);
    expect(ok.status).toBe(201);
    expect(ok.body.data.resolvedBackorderIds).toEqual([9003]);

    before = await snapshot();
    const again = await allocate([[9003, 1]]);
    expect([again.status, again.body.code]).toEqual([
      409,
      "BACKORDER_NOT_OPEN",
    ]);
    expect(await snapshot()).toEqual(before);
  });
});

/* --- S1-5 reset readyPackings -------------------------------------------- */

describe("S1-5 reset readyPackings", () => {
  it("① {readyPackings: [7002]} → 9002 [0, RESOLVED] → [CLARIFY] [L1, L6, L3(2)]", async () => {
    expect((await reset({ readyPackings: [7002] })).status).toBe(200);
    expect(backorderRow(9002)).toEqual([0, "RESOLVED"]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([L1, L6, L3(2)]);
  });

  it("② {backorderIds: [9002], readyPackings: [7002]} → [AUTO_REPLY, HANDOFF] 출고 준비 중인 주문이 있어요(#7002)", async () => {
    await reset({ backorderIds: [9002], readyPackings: [7002] });
    const lines = await ask();
    expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe("출고 준비 중인 주문이 있어요(#7002)");
  });

  it("③ 같은 reset 뒤 질문 없이 9101 삭제 204 → 9002 [1, OPEN], 3011 가용 6 → [CLARIFY] [L2]", async () => {
    await reset({ backorderIds: [9002], readyPackings: [7002] });
    expect((await del(9101)).status).toBe(204);
    expect(backorderRow(9002)).toEqual([1, "OPEN"]);
    expect(await availableOf(3011)).toBe(6);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([L2]);
  });
});

/* --- S1-6 실패 원자성 ---------------------------------------------------- */

describe("S1-6 실패 원자성(미송 있는 기본 reset)", () => {
  it.each([
    ["7002 × 2", 7002, 8002, 2, 409, "ALLOCATION_EXCEEDS_ORDER"],
    ["7001 × 1(3003 재고 0)", 7001, 8001, 1, 409, "INSUFFICIENT_STOCK"],
    ["7003 × 1(신규)", 7003, 8003, 1, 409, "TRANSITION_NOT_ALLOWED"],
    ["7002 × 0", 7002, 8002, 0, 400, "INVARIANT_VIOLATED"],
  ] as const)(
    "① 포장 준비 %s → %i %s, snapshot() 그대로",
    async (_, orderId, lineId, qty, status, code) => {
      const before = await snapshot();
      const res = await packRaw(orderId, lineId, qty);
      expect(res.status).toBe(status);
      const got = res.body.code ?? res.body.errors[0]?.code;
      expect(got).toBe(code);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("② 7003 확정 × 3 409 ALLOCATION_EXCEEDS_ORDER 불변 → 7002 포장 뒤 reset {readyPackings: [7001]} 400 INSUFFICIENT_STOCK 불변", async () => {
    let before = await snapshot();
    const over = await confirm(7003, 8003, 3);
    expect([over.status, over.body.code]).toEqual([
      409,
      "ALLOCATION_EXCEEDS_ORDER",
    ]);
    expect(await snapshot()).toEqual(before);

    await pack(7002, 8002, 1);
    before = await snapshot();
    const res = await reset({ readyPackings: [7001] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        field: "readyPackings",
        code: "INSUFFICIENT_STOCK",
      }),
    ]);
    expect(await snapshot()).toEqual(before);
  });
});

/* --- S1-7 출고 뒤 -------------------------------------------------------- */

describe("S1-7 출고 뒤", () => {
  it("7002 포장 → 봉투 → 출고 → 9002 [0, RESOLVED], 3011 미송 목 가용 5 = 7002 줄 가용 5 → 삭제 409, snapshot() 그대로", async () => {
    const { id, itemIds } = await pack(7002, 8002, 1);
    await ship(await bag(itemIds));
    expect(backorderRow(9002)).toEqual([0, "RESOLVED"]);
    expect(await availableOf(3011)).toBe(5);
    expect((await orderLine(7002, 8002)).variantAvailableQty).toBe(5);
    const before = await snapshot();
    expect((await del(id)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
});

/* --- S1-13 min 경계 ------------------------------------------------------ */

describe("S1-13 min 경계(합성)", () => {
  /**
   * 대응 시드는 줄 미배분량 = 미송 남은 수량이라 min의 두 입력이 안 갈린다(Codex 1). `mockBackorders()`가 주는 행의
   * `remainingQty`만 1로 바꿔 미배분 2, 남은 1을 만든다. 주문 가용 2와 미송 가용 3이 다른 건 합성 상태라 기대값이다
   */
  it("reset [9003] → 확정 0 → 9003 남은 1로 → 7003 포장 8003 × 2 → 9003 [0, RESOLVED], 3019 가용 3, 줄 배분 2 미송 0 가용 2 → 삭제 → [1, OPEN], 가용 4, 배분 0", async () => {
    await reset({ backorderIds: [9003] });
    expect((await confirm(7003, 8003, 0)).status).toBe(200);
    const row = mockBackorders().find((b) => b.id === 9003);
    if (row === undefined) throw new Error("9003");
    row.remainingQty = 1;

    const { id } = await pack(7003, 8003, 2);
    expect(backorderRow(9003)).toEqual([0, "RESOLVED"]);
    expect(await availableOf(3019)).toBe(3);
    const l = await orderLine(7003, 8003);
    expect([l.allocatedQty, l.backorderQty, l.variantAvailableQty]).toEqual([
      2, 0, 2,
    ]);

    expect((await del(id)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([1, "OPEN"]);
    expect(await availableOf(3019)).toBe(4);
    expect((await orderLine(7003, 8003)).allocatedQty).toBe(0);
  });
});

/* --- S1-14 역방향 오매칭 ------------------------------------------------- */

describe("S1-14 역방향 오매칭(번호 겹침 7006/8006)", () => {
  it("알림 incoming 7006(줄 8006, variant 3002) → 확정 8006 × 1 → 9006 [2, OPEN], 미송 탭 SKU와 3003 stats 그대로 → 그 포장 삭제 → 여전히 그대로", async () => {
    const res = await call("POST", `${ORIGIN}/__mock/notifications/incoming`, {
      type: "NEW_ORDER",
    });
    expect(res.status).toBe(201);
    const o = mockOrders().find((x) => x.id === 7006);
    expect([o?.items[0]?.id, o?.items[0]?.variantId]).toEqual([8006, 3002]);

    const look = async () => ({
      row: backorderRow(9006),
      skus: await skus(),
      stats: (await openBackorders(3003)).stats,
    });
    const before = await look();
    expect(before.row).toEqual([2, "OPEN"]);

    expect((await confirm(7006, 8006, 1)).status).toBe(200);
    const [packingId, ...rest] = packingIdsOf(7006);
    expect(rest).toEqual([]);
    expect(await look()).toEqual(before);

    expect((await del(packingId ?? -1)).status).toBe(204);
    expect(await look()).toEqual(before);
  });
});

/* --- S1-15 같은 SKU 두 주문 한계 ---------------------------------------- */

describe("S1-15 같은 SKU 두 주문 한계 기록(합성, 기획 §3 out 11)", () => {
  /** 7006(variant 3011, 봄봄상회 1장)을 더 만든 뒤 7002 포장. 7006 줄 가용을 돌려준다 */
  async function prepare() {
    const o = addMockOrder({
      retailerId: 1,
      retailerName: "봄봄상회",
      variantId: 3011,
      qty: 1,
      unitPrice: 31000,
      orderedAt: new Date(GOLDEN_T0).toISOString(),
    });
    expect([o.id, o.items[0]?.id]).toEqual([7006, 8006]);
    await pack(7002, 8002, 1);
    return (await orderLine(7006, 8006)).variantAvailableQty;
  }

  it("① 현재 값: 미송 목 3011 가용 5, 7002 줄 가용 5, 7006 줄 가용 6(주문 목 가용이 줄마다 따로)", async () => {
    const other = await prepare();
    expect(await availableOf(3011)).toBe(5);
    expect((await orderLine(7002, 8002)).variantAvailableQty).toBe(5);
    expect(other).toBe(6);
  });

  // 바라는 값. 주문 목 가용을 SKU 전체로 고치는 회차에서 뒤집혀 알린다(기획 Q3 ①)
  it.fails("② 바라는 값: 7006 줄 가용 5(= 미송 목 3011 가용)", async () => {
    expect(await prepare()).toBe(5);
  });
});
