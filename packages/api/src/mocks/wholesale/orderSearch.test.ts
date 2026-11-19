import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import {
  addMockOrder,
  mockOrders,
  orderHandlers,
  resetOrderMock,
} from "./order";

/**
 * #196 주문 목 검색 `q`가 서버(ondo-api `OrderSpecs.searchLike`, MUL-150)와 같은 집합을 내는지.
 * 숫자뿐이고 int 범위면 주문번호 일치를 이름 검색에 OR로 더하고, int를 넘는 숫자는 글자로만 찾는다.
 * 시드 주문번호는 7001 7002 7003이 1, 7004가 2, 7005가 3이다.
 */

const API = "http://mock.test/api/wholesale";

type Page = { data: WholesaleSchema<"OrderSummaryResponse">[] };
type Filter = WholesaleSchema<"OrderFilterResponse">;

const server = setupServer(...orderHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetOrderMock();
});

async function ids(q: string): Promise<number[]> {
  const res = await fetch(`${API}/orders?q=${encodeURIComponent(q)}`);
  const body = (await res.json()) as Page;
  return body.data.map((o) => o.id);
}

async function allCount(q: string): Promise<number | undefined> {
  const res = await fetch(`${API}/orders/filters?q=${encodeURIComponent(q)}`);
  const body = (await res.json()) as { data: Filter[] };
  return body.data.find((f) => f.key === "ALL")?.count;
}

/** 시드 주문 하나를 고친다. 서버에서 못 만드는 번호를 심어 숫자 비교로 새는지 보려는 용도 */
function seedOrder(id: number) {
  const o = mockOrders().find((x) => x.id === id);
  if (o === undefined) throw new Error(`주문 ${id} 없음`);
  return o;
}

describe("주문 목 검색 q (#196)", () => {
  it("숫자 q는 주문번호 일치와 이름 부분 일치를 합쳐 낸다(3번 주문 + 3상회)", async () => {
    // 주문번호는 지금 최댓값 + 1이라 4가 된다. 이름에만 3이 들어간다
    const named = addMockOrder({
      retailerId: 3,
      retailerName: "3상회",
      variantId: 3003,
      qty: 1,
      unitPrice: 13500,
      orderedAt: "2026-09-08T10:00:00+09:00",
    });
    expect(named.orderNumber).toBe(4);

    expect(await ids("3")).toEqual([named.id, 7005]);
    expect(await allCount("3")).toBe(2);
    // 앞뒤 공백은 주문번호로 읽을 때만 뗀다(서버 trim). 이름 쪽은 " 3 "이 안 들어 있어 번호로만 걸린다
    expect(await ids(" 3 ")).toEqual([7005]);
    // 시드 이름에 없는 숫자면 주문번호만 남는다
    expect(await ids("2")).toEqual([7004]);
  });

  it("int를 넘는 숫자 q는 주문번호로 보지 않고 글자로만 찾는다", async () => {
    // 서버 orderNumber는 int라 실제로는 못 생기는 번호다. 목이 숫자 비교로 새면 7005가 같이 걸린다
    seedOrder(7005).orderNumber = 2_147_483_648;
    seedOrder(7004).orderNumber = 2_147_483_647;
    const named = addMockOrder({
      retailerId: 3,
      retailerName: "2147483648상회",
      variantId: 3003,
      qty: 1,
      unitPrice: 13500,
      orderedAt: "2026-09-08T10:00:00+09:00",
    });

    expect(await ids("2147483648")).toEqual([named.id]);
    expect(await allCount("2147483648")).toBe(1);
    // int 최댓값까지는 주문번호로 읽는다
    expect(await ids("2147483647")).toEqual([7004]);
  });

  it("문자 q는 전처럼 거래처명과 상품명 부분 일치만 본다", async () => {
    expect(await ids("봄봄")).toEqual([7003, 7002, 7001, 7004]);
    expect(await ids("셔츠")).toEqual([7005, 7001, 7004]);
    expect(await ids("DENIM")).toEqual([]);
    expect(await allCount("대기")).toBe(1);
    // 숫자와 글자가 섞이면 주문번호로 읽지 않는다
    expect(await ids("1번")).toEqual([]);
  });
});
