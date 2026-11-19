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
import {
  backorderHandlers,
  backorderSku,
  mockBackorders,
  orderLineOf,
} from "./backorder";
import { chatHandlers, chatStore, resetChatMock } from "./chat";
import { notificationHandlers } from "./notification";
import {
  addMockOrder,
  allocationPackingError,
  mockOrders,
  mockPackings,
  orderHandlers,
} from "./order";
import { shipmentHandlers } from "./shipment";

/**
 * loop-08j S1 미송 탭 배분과 주문 목 포장의 목 HTTP 흐름. 채팅, 알림, 주문, 미송, 출고 목을 **한 서버에** 올린다
 * (`index.ts` 순서 그대로) — 브라우저 도매 탭과 같은 구성이라 미송 탭 배분, 주문 탭 포장 삭제, 출고 탭 봉투가 다음
 * 자동 답과 다른 탭 숫자에 바로 쓰이는지 본다.
 *
 * 시계: `Date`만 T0(2026-10-29 14:20 서울)로 고정한다. 시나리오마다 새 reset(기획 §6 머리 11).
 * 도우미 `call` `reset` `ask` `pack` `bag` `ship` `ownerText` `kinds` `roomOneSize`는 08i `chatPacking.test.ts`에서
 * 옮겨 적었다(그 파일은 S1-9 회귀라 수정 없이 둔다).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;
const ASK = "미송 언제 와요?";

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

/** 방 1에 소매 질문 하나(판정 돌림). 돌려주는 건 그 요청이 만든 줄(소매 글 뒤) */
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

/** 되묻기 보기 글자. NOT_LISTED는 뺀다 */
const choiceLabels = (lines: readonly Message[]) =>
  (lines[0]?.autoReply?.choices ?? [])
    .filter((c) => c.kind === "BACKORDER")
    .map((c) => c.label);

type Allocation = WholesaleSchema<"AllocationBatchResponse">;

/** 미송 탭 `배분 확정` */
async function allocate(items: [backorderId: number, qty: number][]) {
  return call<{ data: Allocation } & ErrorBody>(
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

/**
 * "아무것도 안 바뀜"을 행 수가 아니라 값으로 본다(기획 §6 S1 머리, Codex 7 9): 미송 전체(id, 남은 수량, 상태),
 * 미송 목 SKU별 가용재고, 주문 목 포장 전체(id, 주문, 상태, 줄과 수량), 주문 상태와 줄 배분 수량, 방 1 메시지 수
 */
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

/** 미송 탭 펼친 표(OPEN만) */
async function openBackorders(variantId: number) {
  const res = await call<{
    data: WholesaleSchema<"BackorderResponse">[];
    stats: WholesaleSchema<"BackorderStatsResponse">;
  }>("GET", `${API}/variants/${variantId}/backorders`);
  return res.body;
}

/** 주문 탭 상세 */
async function orderDetail(orderId: number) {
  const res = await call<{ data: WholesaleSchema<"OrderDetailResponse"> }>(
    "GET",
    `${API}/orders/${orderId}`,
  );
  return res.body.data;
}

/** 미송 목 행 하나(상태 포함). RESOLVED는 OPEN 표에서 빠지므로 저장소 값으로 본다 */
function backorderRow(id: number) {
  const b = mockBackorders().find((x) => x.id === id);
  return b === undefined ? null : [b.remainingQty, b.status];
}

async function del(packingId: number) {
  return call<ErrorBody>("DELETE", `${API}/packings/${packingId}`);
}

/** 주문 탭 `포장 준비`. 만든 포장 id와 포장 줄 id */
async function pack(orderId: number, orderItemId: number, qty: number) {
  const res = await call<{
    data: { id: number; items: { id: number }[] };
  }>("POST", `${API}/orders/${orderId}/packings`, {
    items: [{ orderItemId, allocateQty: qty }],
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
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
      "Idempotency-Key": `00000000-0000-4000-b008-${String(keySeq).padStart(12, "0")}`,
    },
  );
  expect(res.status).toBe(201);
}

async function cancelOrder(orderId: number) {
  return call<ErrorBody>("POST", `${API}/orders/${orderId}/cancel`);
}

/** 배분 성공을 확인하고 응답 포장들 */
async function allocated(items: [backorderId: number, qty: number][]) {
  const res = await allocate(items);
  expect(res.status).toBe(201);
  return res.body.data.packings;
}

/* --- S1-1 대응 함수 ------------------------------------------------------- */

describe("S1-1 대응 함수 orderLineOf(순수)", () => {
  const lineOf = (id: number) => {
    const b = mockBackorders().find((x) => x.id === id);
    if (b === undefined) throw new Error(`미송 ${id}`);
    return orderLineOf(b, mockOrders())?.id ?? null;
  };
  const incoming = (variantId: 3002 | 3003) =>
    addMockOrder({
      retailerId: 1,
      retailerName: "봄봄상회",
      variantId,
      qty: 1,
      unitPrice: 12500,
      orderedAt: "2026-10-29T14:20:00+09:00",
    });

  it("① 시드 9001~9005 → 줄 8001~8005(9004 RESOLVED도 상태는 안 본다)", () => {
    expect([9001, 9002, 9003, 9004, 9005].map(lineOf)).toEqual([
      8001, 8002, 8003, 8004, 8005,
    ]);
  });

  it("② 9006 → null(주문 목 시드에 7006 없음), ④ 801 → null", () => {
    expect(lineOf(9006)).toBeNull();
    expect(lineOf(801)).toBeNull();
  });

  it("③ 알림 incoming 꼴 7006(줄 8006, variant 3002, 소매처 1)을 만든 뒤에도 9006 → null(variant 다름)", () => {
    const o = incoming(3002);
    expect([o.id, o.items[0]?.id]).toEqual([7006, 8006]);
    expect(lineOf(9006)).toBeNull();
  });

  it("⑤ 합성: 주문, 줄, variant 같고 소매처만 다름 → null", () => {
    const b = mockBackorders().find((x) => x.id === 9003);
    if (b === undefined) throw new Error("9003");
    expect(orderLineOf({ ...b, retailerId: 2 }, mockOrders())).toBeNull();
    expect(orderLineOf(b, mockOrders())?.id).toBe(8003);
  });

  it("⑥ 한계 기록: 넷 비교는 알림 fixture 3002 겹침 방어, 일반 증명 아님 — variant 3003, 소매처 1로 7006을 만들면 9006 → 줄 8006", () => {
    incoming(3003);
    expect(lineOf(9006)).toBe(8006);
  });
});

/* --- S1-2 ~ S1-4 배분 → 주문 목 포장과 답 ---------------------------------- */

describe("S1-2 다 배분 → 주문 목 포장과 포장 답", () => {
  it("reset [9003] → 9003 × 2 → 응답 포장 = 주문 목 7003 READY 포장, 줄 배분 2 미송 0, 포장 대기 2, 미송 탭 비움, [A, H] (#7003)", async () => {
    await reset({ backorderIds: [9003] });
    const res = await allocate([[9003, 2]]);
    expect(res.status).toBe(201);
    expect(res.body.data.resolvedBackorderIds).toEqual([9003]);
    const [p, ...rest] = res.body.data.packings;
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ orderId: 7003, orderNumber: 1, status: "READY" });
    expect(p?.items.map((i) => [i.orderItemId, i.qty])).toEqual([[8003, 2]]);

    const queue = await call<{
      data: { id: number; status: string; items: { id: number }[] }[];
    }>("GET", `${API}/orders/7003/packings`);
    expect(queue.body.data.map((q) => [q.id, q.status])).toEqual([
      [p?.id, "READY"],
    ]);
    expect(queue.body.data[0]?.items.map((i) => i.id)).toEqual(
      p?.items.map((i) => i.id),
    );

    const detail = await orderDetail(7003);
    expect(detail.status.key).toBe("NEW");
    expect(
      detail.items.map((l) => [l.id, l.allocatedQty, l.backorderQty]),
    ).toEqual([[8003, 2, 0]]);

    const items = await call<{
      data: WholesaleSchema<"PackingItemRowResponse">[];
    }>("GET", `${API}/packing-items?retailerId=1`);
    expect(
      items.body.data
        .filter((r) => r.orderId === 7003)
        .map((r) => [r.packingId, r.qty]),
    ).toEqual([[p?.id, 2]]);

    expect((await skus()).map((s) => s.variantId)).toEqual([]);

    const lines = await ask();
    expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe("출고 준비 중인 주문이 있어요(#7003)");
  });
});

describe("S1-3 두 주문 한 번에", () => {
  it("reset [9002, 9003] → [9002 × 1, 9003 × 2] → 포장 2장(7002, 7003) → [A, H] 2건 (#7002, #7003)", async () => {
    await reset({ backorderIds: [9002, 9003] });
    const packings = await allocated([
      [9002, 1],
      [9003, 2],
    ]);
    expect(packings.map((p) => p.orderId)).toEqual([7002, 7003]);
    expect(
      mockPackings()
        .filter((p) => p.status === "READY")
        .map((p) => p.id),
    ).toEqual(packings.map((p) => p.id));
    const lines = await ask();
    expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe(
      "출고 준비 중인 주문 2건이 있어요(#7002, #7003)",
    );
  });
});

describe("S1-4 부분 배분", () => {
  it("reset [9003] → 9003 × 1 → 포장 READY 1, 주문 목 미송 1 = 미송 목 남은 1, 가용 3 → [CLARIFY] 남은 1장, 포장 답 0", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 1]]);
    expect(
      mockPackings()
        .filter((x) => x.id === p?.id)
        .map((x) => [x.status, x.items.map((i) => i.qty)]),
    ).toEqual([["READY", [1]]]);
    const detail = await orderDetail(7003);
    expect(detail.items.map((l) => [l.allocatedQty, l.backorderQty])).toEqual([
      [1, 1],
    ]);
    const open = await openBackorders(3019);
    expect(open.data.map((b) => [b.id, b.remainingQty])).toEqual([[9003, 1]]);
    expect(
      (await skus()).map((s) => [s.variantId, s.backorderQty, s.availableQty]),
    ).toEqual([[3019, 1, 3]]);

    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([
      "린넨 셋업 자켓 베이지/L, 남은 1장, 9/7 주문 #7003",
    ]);
    expect(JSON.stringify(lines)).not.toContain("출고 준비 중");
  });
});

/* --- S1-6 삭제와 미송 부활 ----------------------------------------------- */

describe("S1-6 삭제와 미송 부활", () => {
  it("① 배분 포장 삭제 → 3019 미송 2 가용 4, 9003 남은 2, 줄 배분 0 미송 2 → [CLARIFY] 남은 2장", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 2]]);
    expect((await del(p?.id ?? -1)).status).toBe(204);
    expect(
      (await skus()).map((s) => [s.variantId, s.backorderQty, s.availableQty]),
    ).toEqual([[3019, 2, 4]]);
    expect(
      (await openBackorders(3019)).data.map((b) => [b.id, b.remainingQty]),
    ).toEqual([[9003, 2]]);
    const detail = await orderDetail(7003);
    expect(detail.items.map((l) => [l.allocatedQty, l.backorderQty])).toEqual([
      [0, 2],
    ]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([
      "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003",
    ]);
  });

  it("② 부분 배분 1장 뒤 삭제 → 9003 OPEN 남은 2(원래대로)", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 1]]);
    expect((await del(p?.id ?? -1)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
  });

  it("③ 배분 포장을 봉투에 담은 뒤(PACKED) 삭제 → 409, snapshot() 그대로, backorderSku(3019)의 9003 RESOLVED 남은 0", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 2]]);
    await bag(p?.items.map((i) => i.id) ?? []);
    const before = await snapshot();
    expect((await del(p?.id ?? -1)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect(backorderSku(3019)?.backorders).toEqual([
      { retailerId: 1, remainingQty: 0, status: "RESOLVED" },
    ]);
  });

  // loop-08k S1-9 ③: 주문 탭 길 포장도 9002를 줄이게 돼 이름을 고치고 포장 직후 값을 더 본다. 끝 값은 그대로
  it("④ 주문 탭 길 포장(7002 8002 × 1) → 9002 해소, 3011 가용 5 → 삭제 → 되살아남(9002 남은 1, 3011 가용 6)", async () => {
    await reset();
    const before = await snapshot();
    const id = await pack(7002, 8002, 1);
    expect(backorderRow(9002)).toEqual([0, "RESOLVED"]);
    expect((await snapshot()).available[3011]).toBe(5);
    expect((await del(id)).status).toBe(204);
    const after = await snapshot();
    expect([after.backorders, after.available]).toEqual([
      before.backorders,
      before.available,
    ]);
    expect(backorderRow(9002)).toEqual([1, "OPEN"]);
    expect(after.available[3011]).toBe(6);
  });

  it("⑤ 9003 × 1 두 번(포장 A, B) → A 삭제 → 남은 1, 줄 배분 1, READY는 B, 가용 3 → B 삭제 → 남은 2, 배분 0, 가용 4", async () => {
    await reset({ backorderIds: [9003] });
    const [a] = await allocated([[9003, 1]]);
    const [b] = await allocated([[9003, 1]]);
    expect(a?.id).not.toBe(b?.id);

    expect((await del(a?.id ?? -1)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([1, "OPEN"]);
    expect((await orderDetail(7003)).items[0]?.allocatedQty).toBe(1);
    expect(
      mockPackings()
        .filter((p) => p.orderId === 7003)
        .map((p) => [p.id, p.status, p.items.map((i) => i.qty)]),
    ).toEqual([[b?.id, "READY", [1]]]);
    expect((await openBackorders(3019)).stats.availableQty).toBe(3);

    expect((await del(b?.id ?? -1)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
    expect((await orderDetail(7003)).items[0]?.allocatedQty).toBe(0);
    expect((await openBackorders(3019)).stats.availableQty).toBe(4);
  });
});

/* --- S1-8 reset backorderIds -------------------------------------------- */

describe("S1-8 reset backorderIds", () => {
  it("① [9003] → 미송 9003만, 미송 탭 SKU 3019만", async () => {
    expect((await reset({ backorderIds: [9003] })).status).toBe(200);
    expect(mockBackorders().map((b) => b.id)).toEqual([9003]);
    expect((await skus()).map((s) => s.variantId)).toEqual([3019]);
  });

  it("② 칸 없음 → 시드 7행. {noBackorders: false, backorderIds: [9003]} → 200, [9003]", async () => {
    await reset({});
    expect(mockBackorders().map((b) => b.id)).toEqual([
      9001, 9002, 9003, 9005, 9004, 9006, 801,
    ]);
    expect(
      (await reset({ noBackorders: false, backorderIds: [9003] })).status,
    ).toBe(200);
    expect(mockBackorders().map((b) => b.id)).toEqual([9003]);
  });

  /**
   * ③ 실패. 부르기 전 상태를 먼저 만든다: 기본 시드에서 9002 × 1 배분 + 방 1 소매 글 1. reset이 일어나면 미송 잔량,
   * 가용재고, 포장, 방 1 메시지 수가 바뀐다 — 검사를 reset 뒤로 옮기면 여기서 잡힌다
   */
  it.each([
    ["빈 배열", { backorderIds: [] }, "INVALID"],
    ["0 이하", { backorderIds: [-1] }, "INVALID"],
    ["정수 아님", { backorderIds: ["9003"] }, "INVALID"],
    ["배열 아님", { backorderIds: "9003" }, "INVALID"],
    ["중복", { backorderIds: [9003, 9003] }, "DUPLICATE"],
    ["시드에 없음", { backorderIds: [9999] }, "NOT_FOUND"],
    ["앞은 있고 뒤가 없음", { backorderIds: [9003, 9999] }, "NOT_FOUND"],
    [
      "noBackorders: true와 같이",
      { noBackorders: true, backorderIds: [9003] },
      "CONFLICT",
    ],
  ] as const)(
    "③ %s → 400 field backorderIds, snapshot() 그대로",
    async (_, input, code) => {
      await reset();
      expect((await allocate([[9002, 1]])).status).toBe(201);
      const injected = await call(
        "POST",
        `${ORIGIN}/__mock/chat/rooms/1/incoming`,
        { body: "안녕하세요" },
      );
      expect(injected.status).toBe(201);
      const before = await snapshot();
      const res = await reset(input);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ field: "backorderIds", code }),
      ]);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("④ {backorderIds: [9003], readyPackings: [7002]} → 200, 미송은 9003만, 포장은 9100 + 7002, 질문 [CLARIFY](9003 열림)", async () => {
    expect(
      (await reset({ backorderIds: [9003], readyPackings: [7002] })).status,
    ).toBe(200);
    expect(mockBackorders().map((b) => b.id)).toEqual([9003]);
    expect(mockPackings().map((p) => p.orderId)).toEqual([7004, 7002]);
    const lines = await ask();
    expect(kinds(lines)).toEqual(["CLARIFY"]);
    expect(choiceLabels(lines)).toEqual([
      "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003",
    ]);
  });

  /**
   * ⑤ 성공 reset 뒤 포장 id 재사용(Codex 7). 9003 배분이 9101을 만든 뒤 reset이 주문 탭 길로 7002 포장을 다시 9101로
   * 만든다. 지난 배분 기록이 남아 있으면 9101 삭제가 9003을 2 → 4로 되살린다
   */
  it("⑤ 9003 배분(9101) → reset {[9003], readyPackings [7002]}(다시 9101) → 9101 삭제 → 9003 남은 2(4 아님), 3019 가용 4, 7002 배분 0", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 2]]);
    expect(p?.id).toBe(9101);
    await reset({ backorderIds: [9003], readyPackings: [7002] });
    expect(mockPackings().map((x) => [x.id, x.orderId])).toEqual([
      [9100, 7004],
      [9101, 7002],
    ]);
    expect((await del(9101)).status).toBe(204);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
    expect((await openBackorders(3019)).stats.availableQty).toBe(4);
    expect((await orderDetail(7002)).items[0]?.allocatedQty).toBe(0);
  });

  it("⑤ 보조: 9003 배분(9101) → reset {[9002], readyPackings [7002]} → 9101 삭제 → 9002 남은 1, 3011 가용 6", async () => {
    await reset({ backorderIds: [9003] });
    await allocated([[9003, 2]]);
    await reset({ backorderIds: [9002], readyPackings: [7002] });
    expect((await del(9101)).status).toBe(204);
    expect(backorderRow(9002)).toEqual([1, "OPEN"]);
    expect((await openBackorders(3011)).stats.availableQty).toBe(6);
  });
});

/* --- S1-5 출고 생명주기 --------------------------------------------------- */

describe("S1-5 출고 생명주기", () => {
  it("배분 → [A, H] → 봉투 → [A, H] → 출고 → [] → [] → 사장 TEXT → [HANDOFF], 9003 끝까지 RESOLVED 0, 끝에 7003 취소 409", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 2]]);
    const seen: string[][] = [];
    seen.push(kinds(await ask()));
    const outbound = await bag(p?.items.map((i) => i.id) ?? []);
    seen.push(kinds(await ask()));
    await ship(outbound);
    seen.push(kinds(await ask()));
    seen.push(kinds(await ask()));
    await ownerText();
    seen.push(kinds(await ask()));
    expect(seen).toEqual([
      ["AUTO_REPLY", "HANDOFF"],
      ["AUTO_REPLY", "HANDOFF"],
      [],
      [],
      ["HANDOFF"],
    ]);
    expect(backorderSku(3019)?.backorders).toEqual([
      { retailerId: 1, remainingQty: 0, status: "RESOLVED" },
    ]);
    // 출고 뒤에도 7003은 NEW지만 PACKED 포장이 남아 취소할 수 없다(Codex 1)
    expect((await orderDetail(7003)).status.key).toBe("NEW");
    const cancel = await cancelOrder(7003);
    expect([cancel.status, cancel.body.code]).toEqual([
      409,
      "TRANSITION_NOT_ALLOWED",
    ]);
  });
});

/* --- S1-7 부분 성공 없음 -------------------------------------------------- */

/**
 * ① ②는 loop-08k S1-9 ①에서 code가 `ALLOCATION_EXCEEDS_ORDER` → `BACKORDER_NOT_OPEN`으로 바뀌었다. 주문 탭 포장이
 * 9002를 해소해서 미송 OPEN 검사에 먼저 걸린다. 주문 줄 잔량 가드 자체는 S1-11 ⑤의 직접 부름 시험이 본다
 */
describe("S1-7 부분 성공 없음(주문 줄 잔량 초과와 재고 실패)", () => {
  it.each([
    [
      "① 주문 탭 7002 포장 뒤 9002 × 1",
      true,
      [[9002, 1]],
      "BACKORDER_NOT_OPEN",
    ],
    [
      "② 같은 준비 뒤 [9003 × 2, 9002 × 1]",
      true,
      [
        [9003, 2],
        [9002, 1],
      ],
      "BACKORDER_NOT_OPEN",
    ],
    [
      "③ 기본 reset [9003 × 2, 9001 × 1](3003 재고 0)",
      false,
      [
        [9003, 2],
        [9001, 1],
      ],
      "INSUFFICIENT_STOCK",
    ],
    [
      "④ 기본 reset [9001 × 1, 9006 × 1](같은 SKU 3003 합산)",
      false,
      [
        [9001, 1],
        [9006, 1],
      ],
      "INSUFFICIENT_STOCK",
    ],
  ] as [string, boolean, [number, number][], string][])(
    "%s → 409 code, snapshot() 그대로",
    async (_, packFirst, items, code) => {
      await reset();
      if (packFirst) await pack(7002, 8002, 1);
      const before = await snapshot();
      const res = await allocate(items);
      expect([res.status, res.body.code]).toEqual([409, code]);
      expect(await snapshot()).toEqual(before);
      expect(backorderRow(9003)).toEqual([2, "OPEN"]);
      expect(mockPackings().filter((p) => p.orderId === 7003)).toEqual([]);
    },
  );
});

/* --- S1-11 주문 취소와 배분 ----------------------------------------------- */

describe("S1-11 주문 취소와 배분", () => {
  it("① 9003 배분 뒤 7003 isCancellable false(상세, 목록), isConfirmable true, 취소 409, snapshot() 그대로, NEW", async () => {
    await reset({ backorderIds: [9003] });
    await allocated([[9003, 2]]);
    const detail = await orderDetail(7003);
    expect([detail.isCancellable, detail.isConfirmable]).toEqual([false, true]);
    const list = await call<{
      data: WholesaleSchema<"OrderSummaryResponse">[];
    }>("GET", `${API}/orders`);
    expect(list.body.data.find((o) => o.id === 7003)?.isCancellable).toBe(
      false,
    );
    const before = await snapshot();
    const res = await cancelOrder(7003);
    expect([res.status, res.body.code]).toEqual([
      409,
      "TRANSITION_NOT_ALLOWED",
    ]);
    expect(await snapshot()).toEqual(before);
    expect((await orderDetail(7003)).status.key).toBe("NEW");
  });

  it("② 같은 준비 → 알림 incoming ORDER_CANCELLED 7003 → 409, 7003 NEW, snapshot() 그대로", async () => {
    await reset({ backorderIds: [9003] });
    await allocated([[9003, 2]]);
    const before = await snapshot();
    const res = await call<ErrorBody>(
      "POST",
      `${ORIGIN}/__mock/notifications/incoming`,
      { type: "ORDER_CANCELLED", orderId: 7003 },
    );
    expect(res.status).toBe(409);
    expect((await orderDetail(7003)).status.key).toBe("NEW");
    expect(await snapshot()).toEqual(before);
  });

  it("③ 7003 먼저 취소(200) → 9003 × 2 → 409 BACKORDER_NOT_OPEN, snapshot() 그대로, 포장 대기에 7003 줄 0", async () => {
    await reset({ backorderIds: [9003] });
    const cancel = await call<{ data: WholesaleSchema<"OrderDetailResponse"> }>(
      "POST",
      `${API}/orders/7003/cancel`,
    );
    expect([cancel.status, cancel.body.data.status.key]).toEqual([
      200,
      "CANCELLED",
    ]);
    const before = await snapshot();
    const res = await allocate([[9003, 2]]);
    expect([res.status, res.body.code]).toEqual([409, "BACKORDER_NOT_OPEN"]);
    expect(await snapshot()).toEqual(before);
    expect(backorderRow(9003)).toEqual([2, "OPEN"]);
    expect((await openBackorders(3019)).stats.availableQty).toBe(4);
    const items = await call<{
      data: WholesaleSchema<"PackingItemRowResponse">[];
    }>("GET", `${API}/packing-items?retailerId=1`);
    expect(items.body.data.filter((r) => r.orderId === 7003)).toEqual([]);
  });

  it("④ 1장 배분 → 포장 삭제 → isCancellable true → 취소 200 → 다시 1장 배분 → 409 BACKORDER_NOT_OPEN, 불변", async () => {
    await reset({ backorderIds: [9003] });
    const [p] = await allocated([[9003, 1]]);
    expect((await del(p?.id ?? -1)).status).toBe(204);
    expect((await orderDetail(7003)).isCancellable).toBe(true);
    expect((await cancelOrder(7003)).status).toBe(200);
    const before = await snapshot();
    const res = await allocate([[9003, 1]]);
    expect([res.status, res.body.code]).toEqual([409, "BACKORDER_NOT_OPEN"]);
    expect(await snapshot()).toEqual(before);
  });

  /**
   * ⑤ loop-08k S1-9 ②: HTTP로는 주문 탭 포장이 9002를 해소해 미송 OPEN 검사에 먼저 걸려, 08j-R1(취소 검사가 잔량
   * 검사보다 먼저, D60)을 더는 증명하지 못한다. 그래서 가드 `allocationPackingError`를 직접 부른다(준비만 HTTP)
   */
  it("⑤ 직접 부름: 7002 주문 탭 포장 뒤 [7002 줄 × 1] → ALLOCATION_EXCEEDS_ORDER", async () => {
    await reset();
    await pack(7002, 8002, 1);
    expect(
      allocationPackingError([{ orderId: 7002, orderItemId: 8002, qty: 1 }]),
    ).toBe("ALLOCATION_EXCEEDS_ORDER");
  });

  it.each([
    ["[7002 줄, 7003 줄]", false],
    ["[7003 줄, 7002 줄]", true],
  ] as const)(
    "⑤ 직접 부름: 7002 주문 탭 포장 뒤 7003 취소 → %s → BACKORDER_NOT_OPEN(취소 검사가 잔량 검사보다 먼저, 순서 무관)",
    async (_, reversed) => {
      await reset({ backorderIds: [9002, 9003] });
      await pack(7002, 8002, 1);
      expect((await cancelOrder(7003)).status).toBe(200);
      const lines = [
        { orderId: 7002, orderItemId: 8002, qty: 1 },
        { orderId: 7003, orderItemId: 8003, qty: 1 },
      ];
      expect(
        allocationPackingError(reversed ? [...lines].reverse() : lines),
      ).toBe("BACKORDER_NOT_OPEN");
    },
  );
});
