import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  businessDayStart,
  dashboardHandlers,
  resetDashboardMock,
  type MockDashboardSummary,
} from "./dashboard";
import { mockOrders } from "./order";

/**
 * 대시보드 summary 목 계약 테스트(#294). 화면 `derive.ts`가 읽는 칸이 전부 숫자로 오는지,
 * 실패 손잡이가 다음 한 번만 실패시키는지 본다.
 */

const ORIGIN = "http://mock.test";
const SUMMARY = `${ORIGIN}/api/wholesale/dashboard/summary`;

const server = setupServer(...dashboardHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetDashboardMock());

async function summary() {
  const res = await fetch(SUMMARY);
  return {
    status: res.status,
    body: (await res.json()) as { data: MockDashboardSummary; code?: string },
  };
}

describe("GET /dashboard/summary", () => {
  it("화면이 읽는 칸이 전부 있고 신규 주문 수는 주문 목의 NEW 수와 같다", async () => {
    const { status, body } = await summary();
    expect(status).toBe(200);
    const s = body.data;
    expect(Number.isNaN(Date.parse(s.now ?? ""))).toBe(false);
    expect(s.newOrders.count).toBe(
      mockOrders().filter((o) => o.status === "NEW").length,
    );
    for (const n of [
      s.packing.retailerCount,
      s.packing.qty,
      s.packing.byReceive.AGENT,
      s.packing.byReceive.RETAILER,
      s.outbound.notShippedCount,
      s.outbound.staleCount,
      s.backorder.skuCount,
      s.backorder.qty,
      s.backorder.overdueSkuCount,
      s.backorder.noDateSkuCount,
      s.today.orders?.count,
      s.today.orders?.amount,
      s.today.shipped?.count,
      s.today.shipped?.qty,
      s.today.cancelled,
    ])
      expect(typeof n).toBe("number");
  });

  it("실패 손잡이는 다음 한 번만 그 상태로 실패시킨다", async () => {
    await fetch(`${ORIGIN}/__mock/dashboard/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 500 }),
    });
    const failed = await summary();
    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe("INTERNAL_ERROR");
    expect((await summary()).status).toBe(200);
  });
});

describe("businessDayStart", () => {
  it("KST 낮 12시 전이면 전날 낮 12시, 뒤면 그날 낮 12시", () => {
    expect(
      businessDayStart(new Date("2026-10-29T11:59:00+09:00")).toISOString(),
    ).toBe("2026-10-28T03:00:00.000Z");
    expect(
      businessDayStart(new Date("2026-10-29T12:00:00+09:00")).toISOString(),
    ).toBe("2026-10-29T03:00:00.000Z");
  });
});
