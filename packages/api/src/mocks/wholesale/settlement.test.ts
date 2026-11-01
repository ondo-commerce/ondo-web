import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import {
  mockOrders,
  mockOrderSettlement,
  resetOrderMock,
  type MockOrder,
} from "./order";
import {
  mockReceivable,
  recordMockSale,
  resetSettlementMock,
  settlementHandlers,
} from "./settlement";
import { resetShipmentMock } from "./shipment";

/**
 * 정산 목의 배분 규칙(loop-08c S4-1~S4-6, 기획 §4-5 1~5). 상한 = 이번 입금 + 남은 선수금, 배분 줄은 (주문, 입금)마다
 * 하나, 취소는 그 입금의 남은 몫으로 돌아간다, 같은 키 재요청은 처음 201 본문 그대로.
 * 봄봄상회(1)의 시드 주문 7004는 출고 37,500, 미수 37,500이다.
 */

const API = "http://mock.test/api/wholesale";
const RETAILER = 1;

type Payment = WholesaleSchema<"PaymentCreatedResponse">;
type Cancelled = WholesaleSchema<"AllocationCancelledResponse">;
type ErrorBody = { code: string };

const server = setupServer(...settlementHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetOrderMock();
  resetShipmentMock();
  resetSettlementMock();
});

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `00000000-0000-4000-b000-${String(keySeq).padStart(12, "0")}`;
}

async function post<T>(url: string, json: unknown, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

function paymentBody(
  amount: number,
  allocations: { orderId: number; amount: number }[],
  paidAt = "2026-09-10T10:00:00+09:00",
) {
  return {
    retailerId: RETAILER,
    amount,
    paidAt,
    paidBy: "RETAILER",
    method: "BANK_TRANSFER",
    allocations,
  };
}

async function pay(
  amount: number,
  allocations: { orderId: number; amount: number }[],
  paidAt?: string,
  key = newKey(),
) {
  return post<{ data: Payment } & ErrorBody>(
    `${API}/payments`,
    paymentBody(amount, allocations, paidAt),
    { "Idempotency-Key": key },
  );
}

async function payOk(...args: Parameters<typeof pay>): Promise<Payment> {
  const res = await pay(...args);
  expect(res.status).toBe(201);
  return res.body.data;
}

function cancel(allocationId: number) {
  return post<{ data: Cancelled } & ErrorBody>(
    `${API}/allocations/${allocationId}/cancel`,
    {},
  );
}

function order(id: number): MockOrder {
  const found = mockOrders().find((o) => o.id === id);
  if (!found) throw new Error(`시드에 주문 ${id} 없음`);
  return found;
}

const outstanding = (id: number) =>
  mockOrderSettlement(order(id)).outstandingAmount;
const prepaid = () => mockReceivable(101, RETAILER)?.prepaid;

async function paymentLineCount() {
  const res = await fetch(
    `${API}/receivables?retailerId=${RETAILER}&entryType=PAYMENT&size=100`,
  );
  return ((await res.json()) as { data: unknown[] }).data.length;
}

/** 배분 줄을 (주문, 입금, 금액)으로 — id·시각은 보지 않는다 */
const shape = (p: Payment) =>
  p.allocations.map((a) => [a.orderId, a.paymentId, a.amount]);

/**
 * 주문 7002(31,000 × 1)를 출고된 것으로 심는다. 시드엔 출고된 주문이 7004 하나라 두 주문 분할(S4-5)을 볼 수 없고,
 * 7002는 재고 0이라 출고 목 경로(포장 → 봉투 → ship)를 탈 수 없다. 출고 목이 남기는 것과 같은 두 가지만 한다
 */
function shipSeedOrder7002() {
  const o = order(7002);
  for (const l of o.items) l.shippedQty = l.qty;
  recordMockSale(o, 31_000, "2026-09-08T10:00:00+09:00");
}

describe("S4-1 S4-2 상한 = 이번 입금 + 남은 선수금", () => {
  it("S4-1 배분 0인 입금 A 10,000 → 5,000에 7004 15,000 → 201, 줄 2(이번 5,000, A 10,000), 미배분 0, 선수금 0", async () => {
    const a = await payOk(10_000, []);
    expect(a.prepaidRemaining).toBe(10_000);
    const res = await pay(5_000, [{ orderId: 7004, amount: 15_000 }]);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(shape(p)).toEqual([
      [7004, p.id, 5_000],
      [7004, a.id, 10_000],
    ]);
    expect(p.unallocatedAmount).toBe(0);
    expect(p.prepaidRemaining).toBe(0);
    expect(outstanding(7004)).toBe(37_500 - 15_000);
    expect(prepaid()).toBe(0);
  });

  it("S4-2 같은 상태에서 15,001 → 409 ALLOCATION_EXCEEDS_PAYMENT, 선수금 10,000과 입금 수 그대로", async () => {
    await payOk(10_000, []);
    const before = await paymentLineCount();
    const res = await pay(5_000, [{ orderId: 7004, amount: 15_001 }]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALLOCATION_EXCEEDS_PAYMENT");
    expect(prepaid()).toBe(10_000);
    expect(await paymentLineCount()).toBe(before);
    expect(outstanding(7004)).toBe(37_500);
  });

  it("S4-2 검사 순서: 상한을 넘으면서 남의 주문(400)·없는 주문(404)이면 400 → 404가 먼저", async () => {
    const mismatch = await pay(1, [{ orderId: 7005, amount: 99_999 }]);
    expect([mismatch.status, mismatch.body.code]).toEqual([
      400,
      "ORDER_RETAILER_MISMATCH",
    ]);
    const missing = await pay(1, [{ orderId: 9999, amount: 99_999 }]);
    expect([missing.status, missing.body.code]).toEqual([
      404,
      "RESOURCE_NOT_FOUND",
    ]);
  });
});

describe("S4-3 오래된 입금부터 끌어 쓴다", () => {
  it("A 3,000(9/1) + B 7,000(9/5), 이번 1,000에 6,000 → 1,000, A 3,000, B 2,000. 남은 몫 A 0, B 5,000, 선수금 5,000", async () => {
    // B를 먼저 등록한다 — id가 아니라 paidAt 순인지 본다
    const b = await payOk(7_000, [], "2026-09-05T10:00:00+09:00");
    const a = await payOk(3_000, [], "2026-09-01T10:00:00+09:00");
    const p = await payOk(1_000, [{ orderId: 7004, amount: 6_000 }]);
    expect(shape(p)).toEqual([
      [7004, p.id, 1_000],
      [7004, a.id, 3_000],
      [7004, b.id, 2_000],
    ]);
    expect(p.prepaidRemaining).toBe(5_000);
    // 남은 몫: 다음 배분이 A를 건너뛰고 B 5,000을 다 쓴다
    const next = await payOk(1, [{ orderId: 7004, amount: 5_001 }]);
    expect(shape(next)).toEqual([
      [7004, next.id, 1],
      [7004, b.id, 5_000],
    ]);
    expect(next.prepaidRemaining).toBe(0);
  });
});

describe("S4-4 배분 취소", () => {
  it("취소 → 200 {allocationId, orderId, paymentId, amount, cancelledAt, prepaidRemaining}, 미수와 선수금 + amount. 다시 → 409, 없는 id → 404", async () => {
    const p = await payOk(37_500, [{ orderId: 7004, amount: 37_500 }]);
    const [line] = p.allocations;
    if (!line) throw new Error("배분 줄 없음");
    expect(outstanding(7004)).toBe(0);
    expect(prepaid()).toBe(0);

    const res = await cancel(line.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      allocationId: line.id,
      orderId: 7004,
      paymentId: p.id,
      amount: 37_500,
      cancelledAt: expect.any(String) as string,
      prepaidRemaining: 37_500,
    });
    expect(outstanding(7004)).toBe(37_500);
    expect(prepaid()).toBe(37_500);
    expect(mockReceivable(101, RETAILER)?.unpaid).toBe(37_500);

    const again = await cancel(line.id);
    expect([again.status, again.body.code]).toEqual([409, "STATE_CONFLICT"]);
    const missing = await cancel(999_999);
    expect([missing.status, missing.body.code]).toEqual([
      404,
      "RESOURCE_NOT_FOUND",
    ]);
  });

  it("취소 줄은 다음 입금 응답 allocations에도, 남은 몫 셈에도 없다", async () => {
    const p = await payOk(37_500, [{ orderId: 7004, amount: 37_500 }]);
    const [line] = p.allocations;
    if (!line) throw new Error("배분 줄 없음");
    await cancel(line.id);
    const next = await payOk(1, [{ orderId: 7004, amount: 37_500 }]);
    expect(shape(next)).toEqual([
      [7004, next.id, 1],
      [7004, p.id, 37_499],
    ]);
    expect(next.allocations.map((a) => a.id)).not.toContain(line.id);
    expect(next.prepaidRemaining).toBe(1);
    expect(prepaid()).toBe(1);
  });
});

describe("S4-5 두 주문 분할과 일부 취소", () => {
  it("선수금 A 8,000 + 이번 4,000에 X 6,000, Y 6,000 → X(이번 4,000), X(A 2,000), Y(A 6,000). X의 A 줄만 취소 → X 미수 + 2,000, A 남은 몫 2,000, Y 그대로", async () => {
    shipSeedOrder7002();
    const a = await payOk(8_000, []);
    const p = await payOk(4_000, [
      { orderId: 7004, amount: 6_000 },
      { orderId: 7002, amount: 6_000 },
    ]);
    expect(shape(p)).toEqual([
      [7004, p.id, 4_000],
      [7004, a.id, 2_000],
      [7002, a.id, 6_000],
    ]);
    expect(p.unallocatedAmount).toBe(0);
    expect(p.prepaidRemaining).toBe(0);
    expect([outstanding(7004), outstanding(7002)]).toEqual([31_500, 25_000]);

    const xFromA = p.allocations.find(
      (l) => l.orderId === 7004 && l.paymentId === a.id,
    );
    if (!xFromA) throw new Error("X의 A 줄 없음");
    const res = await cancel(xFromA.id);
    expect(res.body.data.prepaidRemaining).toBe(2_000);
    expect([outstanding(7004), outstanding(7002)]).toEqual([33_500, 25_000]);
    // A 남은 몫 2,000: 다음 배분이 A에서 정확히 2,000을 끌어 쓴다
    const next = await payOk(1, [{ orderId: 7004, amount: 2_001 }]);
    expect(shape(next)).toEqual([
      [7004, next.id, 1],
      [7004, a.id, 2_000],
    ]);
  });
});

describe("S4-6 같은 키 재요청은 처음 201 본문 그대로", () => {
  it("S4-1 요청을 같은 키로 → 200 같은 본문. 그 배분을 취소한 뒤에도 같다. 본문이 다르면 409 IDEMPOTENCY_KEY_REUSED", async () => {
    await payOk(10_000, []);
    const key = newKey();
    const first = await pay(
      5_000,
      [{ orderId: 7004, amount: 15_000 }],
      undefined,
      key,
    );
    expect(first.status).toBe(201);
    const count = await paymentLineCount();

    const replay = await pay(
      5_000,
      [{ orderId: 7004, amount: 15_000 }],
      undefined,
      key,
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    for (const line of first.body.data.allocations) await cancel(line.id);
    const afterCancel = await pay(
      5_000,
      [{ orderId: 7004, amount: 15_000 }],
      undefined,
      key,
    );
    expect(afterCancel.status).toBe(200);
    expect(afterCancel.body).toEqual(first.body);
    expect(await paymentLineCount()).toBe(count);

    const other = await pay(
      5_000,
      [{ orderId: 7004, amount: 14_000 }],
      undefined,
      key,
    );
    expect([other.status, other.body.code]).toEqual([
      409,
      "IDEMPOTENCY_KEY_REUSED",
    ]);
  });
});
