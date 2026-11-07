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
import { mockOrders, mockPackings, orderHandlers } from "./order";
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
});
