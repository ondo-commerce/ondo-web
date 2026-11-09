import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import {
  addMockPacking,
  mockOrders,
  mockOrderSettlement,
  shipMockPacking,
} from "../wholesale/order";
import { mockReceivable, recordMockPayment } from "../wholesale/settlement";
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * 소매 방 만들기 지연, 정산 손잡이 둘(입금 상한, 배분 취소)(loop-08e S1-1 ~ S1-3, #360).
 * 소매 브라우저 worker와 같은 구성(소매 핸들러만)으로 띄운다 — 도매 핸들러를 같이 올리면 `/__mock/chat/*`를
 * 도매 것이 먼저 잡는다(`chatHistoryKnobs.test.ts`와 같은 이유).
 *
 * 무엇을 지키나: 방 만들기 늦은 401(#361 입력 기억 시험)과 장면 3 소매 이어 받기 e2e가 이 손잡이로 장면을 만든다.
 * 손잡이가 `POST /payments`와 다른 상한을 쓰면 e2e가 서버에선 안 되는 배분으로 통과하고, 남의 배분을 취소하면
 * 다른 소매처 장부가 몰래 바뀐다. 지연은 기획의 3초 대신 600ms로 잰다(뜻은 같다).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/retail/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;
const SLOW_MS = 600;
/** 시드 미수 = 주문 7004(봄봄상회, 3 × 12,500) */
const ORDER = 7004;
const DUE = 37_500;
/** 방이 없는 도매처(시드 방은 101, 102뿐) */
const NEW_WHOLESALER = 103;
/** 미수 비교의 고정 시각. `asOf`, 연체 일수가 호출 시각에 따라 달라지지 않게 */
const NOW = Date.parse("2026-10-29T14:20:00+09:00");

type PaymentCreated = WholesaleSchema<"PaymentCreatedResponse">;
type AllocationCancelled = WholesaleSchema<"AllocationCancelledResponse">;
type AllocationLine = PaymentCreated["allocations"][number];

/* 응답 모양 = 스펙 스키마의 칸 전부. Record<keyof T, true>라 스키마에 칸이 늘면 여기서 타입 오류가 난다 */
const PAYMENT_KEYS: Record<keyof PaymentCreated, true> = {
  id: true,
  retailerId: true,
  retailerName: true,
  amount: true,
  paidAt: true,
  paidBy: true,
  method: true,
  memo: true,
  unallocatedAmount: true,
  prepaidRemaining: true,
  allocations: true,
  ledgerBalance: true,
  createdAt: true,
};
const LINE_KEYS: Record<keyof AllocationLine, true> = {
  id: true,
  orderId: true,
  orderNumber: true,
  amount: true,
  createdAt: true,
  paymentId: true,
};
const CANCEL_KEYS: Record<keyof AllocationCancelled, true> = {
  allocationId: true,
  orderId: true,
  paymentId: true,
  amount: true,
  cancelledAt: true,
  prepaidRemaining: true,
};
const keysOf = (o: object) => Object.keys(o).sort();

interface ErrorBody {
  code: string;
  errors: { field: string; code: string }[];
}

const server = setupServer(...retailChatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetRetailChatMock());

async function call<T>(method: string, url: string, json?: unknown) {
  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const body = (await res.json()) as T;
  return { status: res.status, body, ms: performance.now() - start };
}

const knob = <T = Record<string, unknown>>(path: string, json: unknown = {}) =>
  call<{ data: T } & ErrorBody>("POST", `${KNOB}${path}`, json);
const pay = (amount: number | undefined, allocate: number) =>
  knob<PaymentCreated>("/payment", {
    amount,
    allocations: [{ orderId: ORDER, amount: allocate }],
  });
const cancel = (allocationId: unknown) =>
  knob<AllocationCancelled>("/allocation-cancel", { allocationId });
interface RoomSummary {
  roomId: number;
  counterpart: { id: number };
}
const createRoom = () =>
  call<{ data: RoomSummary } & ErrorBody>("POST", `${API}/rooms`, {
    wholesalerId: NEW_WHOLESALER,
    listingId: null,
  });
const myWholesalers = async () =>
  (await call<{ data: RoomSummary[] }>("GET", `${API}/rooms`)).body.data.map(
    (r) => r.counterpart.id,
  );
const outstanding = (orderId: number) => {
  const order = mockOrders().find((o) => o.id === orderId);
  return order === undefined ? null : mockOrderSettlement(order);
};

describe("loop-08e S1-1 소매 delay {op: create}", () => {
  it("delay create → 방은 요청 시점에 생겨 그 사이 rooms에 보이고, 201 응답만 늦다", async () => {
    await knob("/delay", { op: "create", ms: SLOW_MS });
    const pending = createRoom();
    await expect.poll(myWholesalers).toContain(NEW_WHOLESALER);
    const created = await pending;
    expect(created.status).toBe(201);
    expect(created.body.data.counterpart.id).toBe(NEW_WHOLESALER);
    expect(created.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    /* 계획은 1회 — 다음 방 만들기(이미 있는 방이라 200)는 바로 */
    const again = await createRoom();
    expect(again.status).toBe(200);
    expect(again.ms).toBeLessThan(SLOW_MS - 50);
  });

  it("fail {op: create, 401} + 같은 지연 → 401이 지연 뒤, 방은 만들지 않는다", async () => {
    await knob("/fail", { op: "create", status: 401 });
    await knob("/delay", { op: "create", ms: SLOW_MS });
    const res = await createRoom();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect(await myWholesalers()).not.toContain(NEW_WHOLESALER);
  });

  it("모르는 op → 400 VALIDATION_FAILED(op), 기존 op 6개는 그대로 받는다", async () => {
    const unknown = await knob("/delay", { op: "payment", ms: 10 });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("VALIDATION_FAILED");
    expect(unknown.body.errors[0]?.field).toBe("op");
    for (const op of ["count", "read", "room", "messages", "rooms", "send"])
      expect((await knob("/delay", { op, ms: 0 })).status, op).toBe(200);
  });
});

describe("loop-08e S1-2 /__mock/chat/payment 상한 = 이번 입금 + 남은 선수금", () => {
  it("37,500 배분 → 취소 → 선수금 37,500 → 입금 10,000에 배분 37,500 → 201, 줄 2개(이번 10,000 먼저, 옛 입금 27,500)", async () => {
    const first = await pay(DUE, DUE);
    expect(first.status).toBe(201);
    const firstLine = first.body.data.allocations[0];
    expect(first.body.data.allocations).toHaveLength(1);
    expect(firstLine?.amount).toBe(DUE);
    expect((await cancel(firstLine?.id)).body.data.prepaidRemaining).toBe(DUE);

    const second = await pay(10_000, DUE);
    expect(second.status).toBe(201);
    const data = second.body.data;
    expect(keysOf(data)).toEqual(keysOf(PAYMENT_KEYS));
    expect(data.amount).toBe(10_000);
    expect(data.retailerId).toBe(1);
    expect(data.unallocatedAmount).toBe(0);
    expect(data.prepaidRemaining).toBe(10_000);
    expect(
      data.allocations.map((a) => ({
        orderId: a.orderId,
        paymentId: a.paymentId,
        amount: a.amount,
      })),
    ).toEqual([
      { orderId: ORDER, paymentId: data.id, amount: 10_000 },
      { orderId: ORDER, paymentId: first.body.data.id, amount: 27_500 },
    ]);
    for (const line of data.allocations)
      expect(keysOf(line)).toEqual(keysOf(LINE_KEYS));
    const ids = data.allocations.map((a) => a.id);
    expect(new Set([...ids, firstLine?.id]).size).toBe(3);
    expect(outstanding(ORDER)?.outstandingAmount).toBe(0);
  });

  it("reset 직후(선수금 0) 같은 요청 → 400 INVALID(allocations), 저장 0", async () => {
    const before = mockReceivable(101, 1, NOW);
    const res = await pay(10_000, DUE);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors[0]).toMatchObject({
      field: "allocations",
      code: "INVALID",
    });
    expect(mockReceivable(101, 1, NOW)).toEqual(before);
    expect(outstanding(ORDER)?.outstandingAmount).toBe(DUE);
    /* 입금도 배분 줄도 안 남았다 — 다음 입금이 시드 첫 id를 받는다 */
    const next = await pay(DUE, DUE);
    expect(next.body.data.id).toBe(4401);
    expect(next.body.data.allocations[0]?.id).toBe(7701);
  });

  it("amount 없음 → 400(amount), allocations가 배열이 아님 → 400(allocations)", async () => {
    const noAmount = await pay(undefined, DUE);
    expect(noAmount.status).toBe(400);
    expect(noAmount.body.errors[0]?.field).toBe("amount");
    const notArray = await knob("/payment", { amount: 1000, allocations: 1 });
    expect(notArray.status).toBe(400);
    expect(notArray.body.errors[0]?.field).toBe("allocations");
  });

  it("reset → 입금, 배분, 취소가 전부 처음으로(미수, 선수금, 다음 id)", async () => {
    const initial = mockReceivable(101, 1, NOW);
    const first = await pay(50_000, DUE);
    await cancel(first.body.data.allocations[0]?.id);
    expect(mockReceivable(101, 1, NOW)).not.toEqual(initial);
    await knob("/reset");
    expect(mockReceivable(101, 1, NOW)).toEqual(initial);
    expect(outstanding(ORDER)?.outstandingAmount).toBe(DUE);
    const again = await pay(DUE, DUE);
    expect(again.body.data.id).toBe(4401);
    expect(again.body.data.allocations[0]?.id).toBe(7701);
    expect(again.body.data.prepaidRemaining).toBe(0);
  });
});

describe("loop-08e 리뷰 R1 R2 R4 /__mock/chat/payment가 POST /payments와 같은 규칙", () => {
  it("R1 같은 주문 7004 두 줄(37,500 × 2, 입금 75,000) → 400 DUPLICATE_ORDER(allocations), 미수, 선수금, 다음 id 그대로", async () => {
    const before = mockReceivable(101, 1, NOW);
    const res = await knob<PaymentCreated>("/payment", {
      amount: DUE * 2,
      allocations: [
        { orderId: ORDER, amount: DUE },
        { orderId: ORDER, amount: DUE },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DUPLICATE_ORDER");
    expect(res.body.errors[0]).toMatchObject({
      field: "allocations",
      code: "DUPLICATE_ORDER",
    });
    expect(mockReceivable(101, 1, NOW)).toEqual(before);
    expect(outstanding(ORDER)?.outstandingAmount).toBe(DUE);
    const next = await pay(DUE, DUE);
    expect(next.body.data.id).toBe(4401);
    expect(next.body.data.allocations[0]?.id).toBe(7701);
  });

  it("R2 같은 idempotencyKey 같은 본문 → 200 + 처음 응답, 입금 한 건. 다른 본문 → 409 IDEMPOTENCY_KEY_REUSED, 저장 0", async () => {
    const body = {
      amount: 50_000,
      allocations: [{ orderId: ORDER, amount: DUE }],
      idempotencyKey: "r2-key",
    };
    const first = await knob<PaymentCreated>("/payment", body);
    expect(first.status).toBe(201);
    const afterFirst = mockReceivable(101, 1, NOW);
    expect(afterFirst?.prepaid).toBe(50_000 - DUE);

    const again = await knob<PaymentCreated>("/payment", body);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    expect(mockReceivable(101, 1, NOW)).toEqual(afterFirst);

    const changed = await knob<PaymentCreated>("/payment", {
      ...body,
      amount: 60_000,
    });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(mockReceivable(101, 1, NOW)).toEqual(afterFirst);

    /* 키 없는 입금은 예전처럼 매번 새 입금 — 다음 id가 하나만 올라 있다 */
    const plain = await knob<PaymentCreated>("/payment", { amount: 1_000 });
    expect(plain.body.data.id).toBe(first.body.data.id + 1);
  });

  it("R4 옛 입금 둘(늦게 저장한 쪽이 더 이른 날짜) → 이번 입금 → 이른 날짜 → 늦은 날짜 순으로 끌어 쓰고 남은 선수금 2,500", async () => {
    /* id 순서와 날짜 순서를 엇갈리게 둔다 — 최신순이나 id순으로 바꾼 변이가 같은 줄을 못 만든다 */
    const later = recordMockPayment({
      retailerId: 1,
      amount: 20_000,
      allocations: [],
      paidAt: "2026-10-20T10:00:00+09:00",
    });
    const earlier = recordMockPayment({
      retailerId: 1,
      amount: 15_000,
      allocations: [],
      paidAt: "2026-10-10T10:00:00+09:00",
    });
    expect(earlier.id).toBeGreaterThan(later.id);

    const res = await pay(5_000, DUE);
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(
      data.allocations.map((a) => ({
        paymentId: a.paymentId,
        amount: a.amount,
      })),
    ).toEqual([
      { paymentId: data.id, amount: 5_000 },
      { paymentId: earlier.id, amount: 15_000 },
      { paymentId: later.id, amount: 17_500 },
    ]);
    expect(data.prepaidRemaining).toBe(2_500);
    expect(mockReceivable(101, 1, NOW)?.prepaid).toBe(2_500);
    expect(outstanding(ORDER)?.outstandingAmount).toBe(0);
  });
});

describe("loop-08e S1-3 /__mock/chat/allocation-cancel", () => {
  it("내 배분 → 200 AllocationCancelledResponse(prepaidRemaining 37,500), 같은 id → 409 STATE_CONFLICT", async () => {
    const paid = await pay(DUE, DUE);
    const line = paid.body.data.allocations[0];
    const res = await cancel(line?.id);
    expect(res.status).toBe(200);
    expect(keysOf(res.body.data)).toEqual(keysOf(CANCEL_KEYS));
    expect(res.body.data).toMatchObject({
      allocationId: line?.id,
      orderId: ORDER,
      paymentId: paid.body.data.id,
      amount: DUE,
      prepaidRemaining: DUE,
    });
    expect(outstanding(ORDER)?.outstandingAmount).toBe(DUE);

    const twice = await cancel(line?.id);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("STATE_CONFLICT");
  });

  it("없는 id → 404 RESOURCE_NOT_FOUND, 정수 아님 → 400", async () => {
    const missing = await cancel(99_999);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("RESOURCE_NOT_FOUND");
    expect((await cancel("7701")).status).toBe(400);
  });

  it("소매처 2의 배분 → 404, 그 배분, 주문 미수, 선수금 그대로(소매처 2로 바꾸면 취소된다)", async () => {
    /* 시드엔 소매처 2의 출고분이 없다. 주문 7005(대기상회) 9장 중 2장을 출고 목 경로로 내보내 미수를 만든다 */
    const order = mockOrders().find((o) => o.id === 7005);
    const item = order?.items[0];
    if (order === undefined || item === undefined)
      throw new Error("시드 주문 7005가 없다");
    shipMockPacking(
      addMockPacking({
        orderId: order.id,
        createdAt: new Date(NOW).toISOString(),
        status: "PACKED",
        outboundId: null,
        items: [{ id: 1, orderItemId: item.id, qty: 2 }],
      }),
    );
    await knob("/me", { retailerId: 2 });
    const theirs = await knob<PaymentCreated>("/payment", {
      amount: 27_000,
      allocations: [{ orderId: 7005, amount: 20_000 }],
    });
    expect(theirs.status).toBe(201);
    const theirLine = theirs.body.data.allocations[0];
    await knob("/me", { retailerId: 1 });

    const receivable2 = mockReceivable(101, 2, NOW);
    const outstanding2 = outstanding(7005);
    const res = await cancel(theirLine?.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("RESOURCE_NOT_FOUND");
    expect(mockReceivable(101, 2, NOW)).toEqual(receivable2);
    expect(outstanding(7005)).toEqual(outstanding2);
    expect(receivable2?.prepaid).toBe(7_000);

    /* cancelledAt이 null로 남았다 = 주인이 취소하면 200(409가 아니다) */
    await knob("/me", { retailerId: 2 });
    expect((await cancel(theirLine?.id)).status).toBe(200);
  });
});

/**
 * loop-12 S1-5 `/__mock/chat/fail`의 `code` 인자. 화면은 영구 거절을 status가 아니라 code로 가른다 — 목이 건
 * code를 안 실으면 "403인데 FORBIDDEN은 다시 보낼 수 있다" 같은 반대 장면 e2e가 기본 code로 통과해 버린다
 */
describe("loop-12 S1-5 fail {op: send, code}", () => {
  let seq = 0;
  const sendOnce = async () => {
    seq += 1;
    const res = await fetch(`${API}/rooms/1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `00000000-0000-4000-9120-${String(seq).padStart(12, "0")}`,
      },
      body: JSON.stringify({ body: `영구 거절 ${seq}`, inquiry: null }),
    });
    return { status: res.status, body: (await res.json()) as ErrorBody };
  };

  it("code를 건 값 그대로 싣는다: 403 FORBIDDEN, 명시한 영구 code 넷", async () => {
    const pairs: [number, string][] = [
      [403, "FORBIDDEN"],
      [403, "ACCOUNT_NOT_APPROVED"],
      [404, "RESOURCE_NOT_FOUND"],
      [409, "IDEMPOTENCY_KEY_REUSED"],
      [400, "VALIDATION_FAILED"],
    ];
    for (const [status, code] of pairs) {
      expect((await knob("/fail", { op: "send", status, code })).status).toBe(
        200,
      );
      const res = await sendOnce();
      expect(res.status, code).toBe(status);
      expect(res.body.code, code).toBe(code);
    }
    /* 계획은 1회 — 다음 보내기는 201 */
    expect((await sendOnce()).status).toBe(201);
  });

  it("code 없음 → 상태별 기본 code 그대로(404 RESOURCE_NOT_FOUND, 500 INTERNAL_ERROR)", async () => {
    await knob("/fail", { op: "send", status: 404 });
    expect((await sendOnce()).body.code).toBe("RESOURCE_NOT_FOUND");
    await knob("/fail", { op: "send" });
    const server = await sendOnce();
    expect(server.status).toBe(500);
    expect(server.body.code).toBe("INTERNAL_ERROR");
  });

  it('code "" 또는 1 → 손잡이 400(code), receivable + code → 400, 어느 쪽도 계획을 남기지 않는다', async () => {
    for (const body of [
      { op: "send", status: 403, code: "" },
      { op: "send", status: 403, code: 1 },
      { op: "receivable", code: "X" },
    ]) {
      const res = await knob("/fail", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.errors[0]?.field).toBe("code");
    }
    expect((await sendOnce()).status).toBe(201);
  });
});
