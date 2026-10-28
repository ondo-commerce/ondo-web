import { createServer, type Server } from "node:http";

/**
 * 소매 e2e용 **가짜 API 서버**. 소매는 Server Component가 `API_ORIGIN`으로 직접
 * fetch해서 브라우저 MSW(`NEXT_PUBLIC_API_MOCK=1`)가 닿지 않는다 — 이 브랜치에는
 * 소매 서버 쪽 목이 없고, dev 서버(`api-dev`)는 2026-10-28 지금 DB를 타는 요청이
 * 전부 500이다(기획 §1). 그래서 retail 서버를 이 주소로 띄우고 돌린다:
 *
 *   API_ORIGIN=http://localhost:3199 pnpm exec playwright test --project retail
 *
 * 계정은 쿠키 `stub_retailer`(bombom | miso)로 고른다. 실서버 세션 쿠키 대신이다 —
 * Next 서버가 들어온 쿠키를 그대로 이 서버로 넘긴다(`createServerApi`).
 * 정산 실패 경로는 쿠키 `stub_settlements=fail`로 고른다.
 *
 * 값은 스펙(`packages/api/openapi/retail.json`) 모양을 따른다. 화면이 읽는 필드만 채운다.
 */
export const STUB_PORT = 3199;
export const STUB_ORIGIN = `http://localhost:${STUB_PORT}`;

export const RETAILERS = {
  bombom: {
    retailerId: 1,
    email: "bombom@ondo.test",
    shopName: "봄봄 테스트상회",
    approvalStatus: "APPROVED",
  },
  miso: {
    retailerId: 2,
    email: "miso@ondo.test",
    shopName: "미소 테스트상회",
    approvalStatus: "APPROVED",
  },
  /** 상호가 빈 채로 내려오는 계정 — `상호 미등록` 경로 */
  noname: {
    retailerId: 3,
    email: "noname@ondo.test",
    shopName: "",
    approvalStatus: "APPROVED",
  },
  /** 승인 대기 화면(S2-5)용 */
  pending: {
    retailerId: 4,
    email: "pending@ondo.test",
    shopName: "대기 테스트상회",
    approvalStatus: "PENDING",
  },
} as const;

export type RetailerKey = keyof typeof RETAILERS;

export const WHOLESALER = { id: 101, name: "무드온" } as const;
export const ORDER_ID = 7001;

function cookieOf(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

const ok = (data: unknown) => ({ status: 200, body: { data } });

function route(
  method: string,
  path: string,
  cookie: string | undefined,
): { status: number; body: unknown } {
  const key = cookieOf(cookie, "stub_retailer");
  const retailer =
    key !== null && key in RETAILERS ? RETAILERS[key as RetailerKey] : null;

  if (retailer === null) {
    return {
      status: 401,
      body: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
    };
  }

  if (method !== "GET") {
    return { status: 405, body: { code: "STUB", message: "읽기만 흉내 낸다" } };
  }

  if (path === "/api/retail/auth/me") {
    return ok({
      ...retailer,
      appliedAt: "2026-10-01T01:05:00Z",
      approvedAt: "2026-10-02T01:00:00Z",
      rejection: null,
    });
  }

  if (path === "/api/retail/cart-items/count") return ok({ count: 0 });
  if (path === "/api/retail/categories") return ok([{ id: 1, name: "상의" }]);
  if (path === "/api/retail/filter-options") {
    return ok({
      colorGroups: [],
      sizes: [],
      priceRange: { min: 0, max: 100000 },
    });
  }

  if (path === "/api/retail/listings") {
    return {
      status: 200,
      body: {
        data: [
          {
            listingId: 11,
            title: "코튼 셔츠",
            thumbnailUrl: null,
            colorCount: 2,
            sizeCount: 3,
            minSalePrice: 12000,
            isSinglePieceAllowed: true,
            wholesaler: WHOLESALER,
          },
        ],
        meta: {
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
          hasNext: false,
        },
      },
    };
  }

  if (path === "/api/retail/settlements") {
    if (cookieOf(cookie, "stub_settlements") === "fail") {
      return { status: 500, body: { code: "INTERNAL", message: "stub 실패" } };
    }
    return ok([
      {
        wholesalerId: WHOLESALER.id,
        name: WHOLESALER.name,
        balance: 52000,
        overdue: null,
        lastPaidAt: "2026-10-20",
        paidLast7Days: 0,
        bank: null,
      },
    ]);
  }

  if (path === `/api/retail/orders/${ORDER_ID}`) {
    return ok({
      orderId: ORDER_ID,
      orderNo: "R-20261028-0001",
      orderedAt: "2026-10-28T01:00:00Z",
      totalAmount: 24000,
      agentName: null,
      agentPhone: null,
      wholesalerOrders: [
        {
          wholesaleOrderId: 9001,
          orderNumber: 1,
          amount: 24000,
          isCancellable: false,
          paymentTerm: "BANK_TRANSFER",
          receiveMethod: "RETAILER",
          status: { key: "SHIPPED", label: "출고 완료" },
          wholesaler: {
            ...WHOLESALER,
            storeBuilding: "청평화",
            storeUnit: "2층 24호",
            bankName: null,
            bankAccountNo: null,
            bankAccountHolder: null,
          },
          items: [
            {
              listingId: 11,
              title: "코튼 셔츠",
              colorName: "블랙",
              size: "M",
              qty: 2,
              receivedQty: 2,
              backorderQty: 0,
              unitPrice: 12000,
              lineAmount: 24000,
              expectedInboundDate: null,
            },
          ],
          outbounds: [
            {
              outboundId: 5001,
              statementNumber: "S-0001",
              shippedAt: "2026-10-28T03:00:00Z",
              items: [
                { title: "코튼 셔츠", colorName: "블랙", size: "M", qty: 2 },
              ],
            },
          ],
        },
      ],
    });
  }

  return { status: 404, body: { code: "RESOURCE_NOT_FOUND", message: path } };
}

export function startStubApi(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", STUB_ORIGIN);
    const { status, body } = route(
      req.method ?? "GET",
      url.pathname,
      req.headers.cookie,
    );
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) =>
    server.listen(STUB_PORT, () => resolve(server)),
  );
}
