import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { mockOrderAmount, mockOrders, mockPackings } from "./order";

/**
 * 대시보드 summary 목(#294). `GET /api/wholesale/dashboard/summary` 하나.
 *
 * 이 목이 없을 땐 스냅샷 뼈대(`handlersFromSpec`)가 답했는데, 뼈대는 `packing`을 포장 대기열
 * 모양(id·items…)으로 채운다(스냅샷의 스키마 이름 충돌, 화면 `types.ts` `PackingSummary` 주석).
 * 화면이 `today`·`packing`을 읽다 `TodayPanel`이 깨져 mock 모드 `/dashboard`에 콘솔 error가 났다.
 *
 * 값은 주문 목(`./order`)에서 센다 — 타일의 신규 주문 수와 확정 대기 큐(같은 주문 목)가 어긋나지
 * 않게. 출고 봉투와 미송은 그 목들이 상태를 밖으로 내지 않아 0으로 둔다(지어내지 않는다).
 */

type Wire = WholesaleSchema<"DashboardSummaryResponse">;
type ReceiveBy = WholesaleSchema<"OrderDetailResponse">["receiveBy"];

/** dev 실응답 모양(2026-09-18). 생성 타입의 `packing`은 위 이유로 틀려서 여기만 손으로 적는다 */
interface PackingSummaryWire {
  retailerCount: number;
  qty: number;
  byReceive: Record<ReceiveBy, number>;
}

/**
 * 생성 타입은 `oldestOrderedAt`·`oldestRetailerName`을 필수로 적지만 신규 주문이 0건이면 줄 값이 없다.
 * 그때는 빼서 보낸다 — 화면(`newOrdersTile`)은 `?? null`로 받는다.
 */
export type MockDashboardSummary = Omit<Wire, "packing" | "newOrders"> & {
  packing: PackingSummaryWire;
  newOrders: Pick<Wire["newOrders"], "count"> &
    Partial<Omit<Wire["newOrders"], "count">>;
};

/** 영업일은 KST 낮 12시에 바뀐다(스펙 설명). `now` 직전의 그 시각 */
export function businessDayStart(now: Date): Date {
  const KST_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_MS);
  const noon = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    12,
  );
  const start = kst.getTime() >= noon ? noon : noon - 24 * 60 * 60 * 1000;
  return new Date(start - KST_MS);
}

export function mockDashboardSummary(now: Date): MockDashboardSummary {
  const orders = mockOrders();
  const start = businessDayStart(now).getTime();

  const fresh = orders
    .filter((o) => o.status === "NEW")
    .sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
  const oldest = fresh[0];

  const ready = mockPackings().filter((p) => p.status === "READY");
  const readyOrders = ready
    .map((p) => orders.find((o) => o.id === p.orderId))
    .filter((o) => o !== undefined);
  const retailers = new Map<number, ReceiveBy>();
  for (const o of readyOrders) retailers.set(o.retailerId, o.receiveBy);
  const byReceive: Record<ReceiveBy, number> = { AGENT: 0, RETAILER: 0 };
  for (const receiveBy of retailers.values()) byReceive[receiveBy] += 1;

  const today = orders.filter((o) => Date.parse(o.orderedAt) >= start);
  const shipped = today.flatMap((o) => o.items).filter((l) => l.shippedQty > 0);

  return {
    now: now.toISOString(),
    newOrders: {
      count: fresh.length,
      ...(oldest && {
        oldestOrderedAt: oldest.orderedAt,
        oldestRetailerName: oldest.retailerName,
      }),
    },
    packing: {
      retailerCount: retailers.size,
      qty: ready.reduce(
        (sum, p) => sum + p.items.reduce((s, i) => s + i.qty, 0),
        0,
      ),
      byReceive,
    },
    outbound: { notShippedCount: 0, staleCount: 0 },
    backorder: { skuCount: 0, qty: 0, overdueSkuCount: 0, noDateSkuCount: 0 },
    today: {
      orders: {
        count: today.filter((o) => o.status !== "CANCELLED").length,
        amount: today
          .filter((o) => o.status !== "CANCELLED")
          .reduce((sum, o) => sum + mockOrderAmount(o), 0),
      },
      shipped: {
        count: shipped.length,
        qty: shipped.reduce((sum, l) => sum + l.shippedQty, 0),
      },
      cancelled: today.filter((o) => o.status === "CANCELLED").length,
    },
  };
}

/* --- 시험 손잡이 (목 전용, 스펙에 없음) ----------------------------------- */

/** `POST /__mock/dashboard/fail {status = 500, times = 1}` — 다음 n번의 summary를 그 상태로 실패시킨다 */
let failPlan: { status: number; times: number } | null = null;

export function resetDashboardMock() {
  failPlan = null;
}

const FAIL_BODY: Record<number, { code: string; message: string }> = {
  401: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
  403: {
    code: "ACCOUNT_NOT_APPROVED",
    message: "승인된 계정만 사용할 수 있습니다.",
  },
};

export const dashboardHandlers = [
  http.get("*/api/wholesale/dashboard/summary", () => {
    if (failPlan !== null && failPlan.times > 0) {
      failPlan.times -= 1;
      const { status } = failPlan;
      const body = FAIL_BODY[status] ?? {
        code: "INTERNAL_ERROR",
        message: "일시적인 오류입니다.",
      };
      return HttpResponse.json(
        { ...body, errors: [], traceId: "mock" },
        { status },
      );
    }
    return HttpResponse.json({ data: mockDashboardSummary(new Date()) });
  }),

  http.post("*/__mock/dashboard/fail", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      status?: number;
      times?: number;
    };
    failPlan = { status: input.status ?? 500, times: input.times ?? 1 };
    return HttpResponse.json({ data: failPlan });
  }),

  http.post("*/__mock/dashboard/reset", () => {
    resetDashboardMock();
    return HttpResponse.json({ data: { reset: true } });
  }),
];
