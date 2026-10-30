import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

/**
 * 소매 e2e용 **가짜 API 서버**. 소매는 Server Component가 `API_ORIGIN`으로 직접
 * fetch해서 브라우저 MSW(`NEXT_PUBLIC_API_MOCK=1`)가 닿지 않는다 — 이 브랜치에는
 * 소매 서버 쪽 목이 없고, dev 서버(`api-dev`)는 2026-10-28 지금 DB를 타는 요청이
 * 전부 500이다(기획 §1). `playwright.stub.config.ts`의 webServer가 이 서버
 * (`stub-server.ts`)와 `API_ORIGIN=http://localhost:3199`인 retail 서버를 같이 띄운다:
 *
 *   pnpm e2e:stub
 *
 * 계정은 쿠키 `stub_retailer`(bombom | miso | noname | pending)로 고른다. 실서버 세션 쿠키 대신이다 —
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

/**
 * 채팅 e2e(loop-05a)용 도매처 둘. 이름은 소매 채팅 목(`packages/api/src/mocks/retail/chat.ts`
 * `CHAT_WHOLESALERS`)과 같다. 102는 거래 이력 없음(정산 줄 없음), 103은 30자 상호.
 * 도매처 홈은 "첫 장에 게시글이 있는 도매처"만 서므로 상품을 하나씩 둔다.
 */
export const CHAT_WHOLESALERS = {
  raon: { id: 102, name: "라온" },
  cotton: {
    id: 103,
    name: "코튼클럽 동대문 신평화패션타운 삼층 본점 직영 도매상회",
  },
} as const;

/** 상품 id → 도매처. 11은 무드온(side-02부터 있던 것), 21·31은 채팅 e2e가 더한 것 */
export const LISTINGS = [
  { listingId: 11, title: "코튼 셔츠", wholesaler: WHOLESALER },
  { listingId: 21, title: "린넨 팬츠", wholesaler: CHAT_WHOLESALERS.raon },
  { listingId: 31, title: "니트 조끼", wholesaler: CHAT_WHOLESALERS.cotton },
] as const;

/**
 * loop-05b 재고 자동 답 장면의 상품(빈티지 플라워 셔츠, 도매처 무드온). 브라우저 채팅 목의 판정이 읽는 도매
 * 상품 목 시드(`packages/api/src/mocks/wholesale/product.ts`, 골든셋 재고 표)와 같은 id, 색상, 사이즈, 한도다.
 * 목록(`/listings`)에는 넣지 않는다 — 목록 개수를 세는 side-02 spec이 그대로 돌게.
 */
export const STOCK_LISTING = {
  listingId: 2001,
  title: "빈티지 플라워 셔츠",
  salePrice: 18000,
  wholesaler: WHOLESALER,
  variants: [
    { id: 3001, color: "레드", size: "S", orderLimit: 500 },
    { id: 3002, color: "레드", size: "M", orderLimit: 500 },
    { id: 3003, color: "레드", size: "L", orderLimit: 0 },
    { id: 3004, color: "네이비", size: "S", orderLimit: 500 },
    { id: 3005, color: "네이비", size: "M", orderLimit: 500 },
  ],
} as const;

/**
 * 장바구니(loop-05b S8-5). 메모리, 같은 SKU는 합산, `count` = 담긴 종류 수.
 * 쿠키 `stub_cart`(없으면 `default`)마다 따로다 — 여러 spec 파일이 병렬로 돌아도 서로의 헤더 숫자를 바꾸지
 * 않게. `POST /__stub/reset?cart=<키>`가 그 장바구니와 걸어 둔 실패를 비운다(키 없으면 전부).
 */
interface StubCartLine {
  cartItemId: number;
  variantId: number;
  qty: number;
}
const carts = new Map<string, Map<number, StubCartLine>>();
/** `POST /__stub/cart-fail?cart=<키> {status, times = 1}` — 다음 n번의 담기를 그 상태로 실패시킨다 */
const cartFails = new Map<string, { status: number; times: number }>();
/** `POST /__stub/cart-slow?cart=<키> {ms}` — 다음 담기 1번의 응답을 ms만큼 늦춘다(담는 중 상태를 보려고) */
const cartSlow = new Map<string, number>();
let nextCartItemId = 1;

function cartOf(key: string): Map<number, StubCartLine> {
  let cart = carts.get(key);
  if (cart === undefined) {
    cart = new Map();
    carts.set(key, cart);
  }
  return cart;
}

/* --- 미송 대기 현황(loop-06b S1-8) ---------------------------------------- */

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;

/** stub 실제 시계의 서울 날짜 + n일. Next 서버(`todayKst(new Date())`)와 같은 시계를 쓴다(기획 §5-4 6) */
function seoulDatePlus(days: number): string {
  return new Date(Date.now() + SEOUL_OFFSET_MS + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

interface StubBackorder {
  backorderId: number;
  /** eta 손잡이가 고르는 SKU. 응답에는 없다(스펙 `BackorderResponse`에 칸이 없다) */
  variantId: number;
  orderId: number;
  orderNo: string;
  orderedAt: string;
  listingId: number;
  title: string;
  colorName: string;
  size: string;
  /** 원래 미송량(스펙: 배분돼도 안 변한다) */
  qty: number;
  expectedInboundDate: string | null;
  expectedInboundReason: string | null;
}

/**
 * 봄봄(쿠키 bombom)의 OPEN 미송. 브라우저 미송 목(`packages/api/src/mocks/wholesale/backorder.ts`)의
 * 봄봄 × 무드온 몫과 같은 id, 상품, 원래 수량, 입고일 상대값이다(9001 −3일, 9002 미정, 9003 +7일, 9006 −3일).
 * 시각은 reset 때 다시 잰다 — 자정을 넘긴 stub 이 옛 날짜를 들고 있지 않게.
 */
function seedBackorders(): StubBackorder[] {
  const base = (
    backorderId: number,
    variantId: number,
    orderId: number,
    orderedAt: string,
  ) => ({
    backorderId,
    variantId,
    orderId,
    orderNo: `R-${orderedAt.slice(0, 10).replaceAll("-", "")}-${String(orderId).slice(-4)}`,
    orderedAt,
  });
  return [
    {
      ...base(9001, 3003, 7001, "2026-09-04T10:00:00+09:00"),
      listingId: 2001,
      title: "빈티지 플라워 셔츠",
      colorName: "레드",
      size: "L",
      qty: 4,
      expectedInboundDate: seoulDatePlus(-3),
      expectedInboundReason: "공장 재입고 예정",
    },
    {
      ...base(9002, 3011, 7002, "2026-09-06T10:00:00+09:00"),
      listingId: 2003,
      title: "와이드 데님 팬츠",
      colorName: "소라",
      size: "M",
      qty: 1,
      expectedInboundDate: null,
      expectedInboundReason: null,
    },
    {
      ...base(9006, 3003, 7006, "2026-09-06T15:00:00+09:00"),
      listingId: 2001,
      title: "빈티지 플라워 셔츠",
      colorName: "레드",
      size: "L",
      qty: 4,
      expectedInboundDate: seoulDatePlus(-3),
      expectedInboundReason: "공장 재입고 예정",
    },
    {
      ...base(9003, 3019, 7003, "2026-09-07T08:00:00+09:00"),
      listingId: 2005,
      title: "린넨 셋업 자켓",
      colorName: "베이지",
      size: "L",
      qty: 2,
      expectedInboundDate: seoulDatePlus(7),
      expectedInboundReason: "원단 수급 지연",
    },
  ];
}

let backorders = seedBackorders();

/** `GET /api/retail/backorders` — `PageResponseBackorderResponse`. 봄봄만 행이 있다. 오래된 순 */
function backorderPage(retailerId: number, page: number, size: number) {
  const mine =
    retailerId === RETAILERS.bombom.retailerId
      ? [...backorders].sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))
      : [];
  const data = mine.slice(page * size, page * size + size).map((b) => ({
    backorderId: b.backorderId,
    orderId: b.orderId,
    orderNo: b.orderNo,
    orderedAt: b.orderedAt,
    listingId: b.listingId,
    title: b.title,
    colorName: b.colorName,
    size: b.size,
    qty: b.qty,
    expectedInboundDate: b.expectedInboundDate,
    expectedInboundReason: b.expectedInboundReason,
    wholesaler: WHOLESALER,
  }));
  const totalPages = Math.max(Math.ceil(mine.length / size), 1);
  return {
    status: 200,
    body: {
      data,
      meta: {
        page,
        size,
        totalElements: mine.length,
        totalPages,
        hasNext: page + 1 < totalPages,
      },
    },
  };
}

/** eta 손잡이: 그 SKU 줄 전부의 날짜를 바꾼다(입고일은 SKU 단위). 날짜를 지우면 사유도 비운다 */
function setBackorderEta(raw: string): { status: number; body: unknown } {
  let input: { variantId?: unknown; expectedInboundDate?: unknown } = {};
  try {
    input = JSON.parse(raw || "{}") as typeof input;
  } catch {
    // 아래 검사가 400을 낸다
  }
  const { variantId, expectedInboundDate: date } = input;
  const rows = backorders.filter((b) => b.variantId === variantId);
  if (rows.length === 0)
    return { status: 400, body: { code: "STUB", message: "없는 variantId" } };
  if (
    date !== null &&
    (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
  )
    return {
      status: 400,
      body: {
        code: "STUB",
        message: "expectedInboundDate는 YYYY-MM-DD | null",
      },
    };
  for (const b of rows) {
    b.expectedInboundDate = date;
    if (date === null) b.expectedInboundReason = null;
  }
  return { status: 200, body: { data: { updated: rows.length } } };
}

function resetStub(key: string | null) {
  // 미송 표는 쿠키별이 아니라 하나다. reset 이면 키와 상관없이 시드로 돌린다
  backorders = seedBackorders();
  if (key === null) {
    carts.clear();
    cartFails.clear();
    cartSlow.clear();
    return;
  }
  carts.delete(key);
  cartFails.delete(key);
  cartSlow.delete(key);
}

const CART_FAIL_BODY: Record<number, { code: string; message: string }> = {
  400: { code: "VALIDATION_FAILED", message: "담을 수 없는 수량입니다." },
  401: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
  403: {
    code: "ACCOUNT_NOT_APPROVED",
    message: "승인된 계정만 사용할 수 있습니다.",
  },
};

function stockVariant(variantId: number) {
  return STOCK_LISTING.variants.find((v) => v.id === variantId) ?? null;
}

function addToCart(
  key: string,
  raw: string,
): { status: number; body: unknown } {
  const plan = cartFails.get(key);
  if (plan !== undefined && plan.times > 0) {
    plan.times -= 1;
    return {
      status: plan.status,
      body: CART_FAIL_BODY[plan.status] ?? {
        code: "INTERNAL_ERROR",
        message: "stub 실패",
      },
    };
  }
  let input: { variantId?: unknown; qty?: unknown } = {};
  try {
    input = JSON.parse(raw) as typeof input;
  } catch {
    // 본문이 JSON이 아니면 아래 검사가 400을 낸다
  }
  const { variantId, qty } = input;
  if (typeof variantId !== "number" || stockVariant(variantId) === null)
    return {
      status: 400,
      body: {
        code: "VALIDATION_FAILED",
        message: "입력값이 올바르지 않습니다.",
        errors: [
          {
            field: "variantId",
            code: "NOT_FOUND",
            message: "없는 옵션입니다.",
          },
        ],
      },
    };
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1)
    return {
      status: 400,
      body: {
        code: "VALIDATION_FAILED",
        message: "입력값이 올바르지 않습니다.",
        errors: [
          { field: "qty", code: "MIN", message: "1장 이상 담을 수 있어요." },
        ],
      },
    };
  const cart = cartOf(key);
  const line = cart.get(variantId) ?? {
    cartItemId: nextCartItemId++,
    variantId,
    qty: 0,
  };
  line.qty += qty;
  cart.set(variantId, line);
  return {
    status: 201,
    body: {
      data: { cartItemId: line.cartItemId, count: cart.size, qty: line.qty },
    },
  };
}

/** `GET /cart-items` — `CartResponse`. 담긴 것은 전부 무드온 것이라 묶음 하나 */
function cartResponse(key: string) {
  const lines = [...cartOf(key).values()];
  const items = lines.map((line) => {
    const v = stockVariant(line.variantId);
    return {
      cartItemId: line.cartItemId,
      variantId: line.variantId,
      listingId: STOCK_LISTING.listingId,
      title: STOCK_LISTING.title,
      colorName: v?.color ?? "",
      size: v?.size ?? "",
      qty: line.qty,
      salePrice: STOCK_LISTING.salePrice,
      lineAmount: line.qty * STOCK_LISTING.salePrice,
      orderLimit: v?.orderLimit ?? 0,
      isOrderable: true,
      thumbnailUrl: null,
    };
  });
  const total = items.reduce((sum, item) => sum + item.lineAmount, 0);
  return {
    groups:
      items.length === 0
        ? []
        : [{ wholesaler: WHOLESALER, items, subtotal: total }],
    totalAmount: total,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
  };
}

function stockListingDetail() {
  const colors = [...new Set(STOCK_LISTING.variants.map((v) => v.color))];
  return {
    listingId: STOCK_LISTING.listingId,
    title: STOCK_LISTING.title,
    productNumber: 3001,
    description: "",
    categoryPath: [
      { id: 1, name: "여성" },
      { id: 2, name: "의류" },
      { id: 3, name: "상의" },
    ],
    images: [],
    isSinglePieceAllowed: true,
    minSalePrice: STOCK_LISTING.salePrice,
    maxSalePrice: STOCK_LISTING.salePrice,
    listedVariantCount: STOCK_LISTING.variants.length,
    totalVariantCount: STOCK_LISTING.variants.length,
    colorOptions: colors.map((name, i) => ({
      color: { id: i + 1, name, hex: name === "레드" ? "#c0392b" : "#1f2a44" },
      variants: STOCK_LISTING.variants
        .filter((v) => v.color === name)
        .map((v) => ({
          id: v.id,
          size: v.size,
          salePrice: STOCK_LISTING.salePrice,
          orderLimit: v.orderLimit,
        })),
    })),
    wholesaler: {
      ...STOCK_LISTING.wholesaler,
      storeBuilding: "신평화패션타운",
      storeUnit: "3층 12호",
    },
  };
}

/**
 * 받은 요청 경로 기록. `GET /__stub/requests`로 읽는다(쿠키 없이). 채팅 요청이 가짜 API까지
 * 새어 나오지 않고 브라우저 목에서 끝났는지(S5-12) 본다. 프로세스가 살아 있는 동안 쌓인다.
 */
const requestLog: string[] = [];

function listingDetail(listing: (typeof LISTINGS)[number]) {
  return {
    listingId: listing.listingId,
    title: listing.title,
    productNumber: 1000 + listing.listingId,
    description: "",
    categoryPath: [
      { id: 1, name: "여성" },
      { id: 2, name: "의류" },
      { id: 3, name: "상의" },
    ],
    images: [],
    isSinglePieceAllowed: true,
    minSalePrice: 12000,
    maxSalePrice: 12000,
    listedVariantCount: 1,
    totalVariantCount: 1,
    colorOptions: [
      {
        color: { id: 1, name: "블랙", hex: "#000000" },
        variants: [
          {
            id: listing.listingId * 10,
            size: "M",
            salePrice: 12000,
            orderLimit: 0,
          },
        ],
      },
    ],
    wholesaler: {
      ...listing.wholesaler,
      storeBuilding: "신평화패션타운",
      storeUnit: "3층 12호",
    },
  };
}

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
  rawBody: string,
  query: URLSearchParams = new URLSearchParams(),
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

  const cartKey = cookieOf(cookie, "stub_cart") ?? "default";
  if (method === "POST" && path === "/api/retail/cart-items")
    return addToCart(cartKey, rawBody);

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

  if (path === "/api/retail/backorders")
    return backorderPage(
      retailer.retailerId,
      Number(query.get("page") ?? 0),
      Number(query.get("size") ?? 20),
    );

  if (path === "/api/retail/cart-items/count")
    return ok({ count: cartOf(cartKey).size });
  if (path === "/api/retail/cart-items") return ok(cartResponse(cartKey));
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
        data: LISTINGS.map((listing) => ({
          listingId: listing.listingId,
          title: listing.title,
          thumbnailUrl: null,
          colorCount: 2,
          sizeCount: 3,
          minSalePrice: 12000,
          isSinglePieceAllowed: true,
          wholesaler: listing.wholesaler,
        })),
        meta: {
          page: 0,
          size: 100,
          totalElements: LISTINGS.length,
          totalPages: 1,
          hasNext: false,
        },
      },
    };
  }

  const detail = /^\/api\/retail\/listings\/(\d+)$/.exec(path);
  if (detail && Number(detail[1]) === STOCK_LISTING.listingId)
    return ok(stockListingDetail());
  if (detail) {
    const listing = LISTINGS.find((l) => l.listingId === Number(detail[1]));
    if (listing) return ok(listingDetail(listing));
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
        /* `PartnerSettlementWire.overdue`는 null이 아니라 객체다 — 연체 없음 = 0, 0, 0 */
        overdue: { amount: 0, count: 0, maxDays: 0 },
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * 시험 손잡이(쿠키 없이, 스펙에 없음). `?cart=<키>`로 장바구니 하나를 고른다.
 * - `POST /__stub/reset` 장바구니와 걸어 둔 실패를 비운다(loop-05b `beforeEach`가 200을 단언한다)
 * - `POST /__stub/cart-fail {status, times}` 다음 n번의 담기 실패(400, 401, 403, 500)
 * - `POST /__stub/cart-slow {ms}` 다음 담기 1번의 응답을 늦춘다
 * - `POST /__stub/backorders/eta {variantId, expectedInboundDate}` 그 SKU 미송 줄의 예상 입고일(loop-06b S1-8).
 *   reset 은 키와 상관없이 미송 표도 시드로 되돌린다
 */
async function knob(
  req: IncomingMessage,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  const key = url.searchParams.get("cart");
  if (url.pathname === "/__stub/reset") {
    resetStub(key);
    return { status: 200, body: { data: { reset: key ?? "all" } } };
  }
  if (req.method === "POST" && url.pathname === "/__stub/backorders/eta")
    return setBackorderEta(await readBody(req));
  if (url.pathname === "/__stub/cart-fail") {
    const input = JSON.parse((await readBody(req)) || "{}") as {
      status?: number;
      times?: number;
    };
    const plan = { status: input.status ?? 500, times: input.times ?? 1 };
    cartFails.set(key ?? "default", plan);
    return { status: 200, body: { data: plan } };
  }
  if (url.pathname === "/__stub/cart-slow") {
    const input = JSON.parse((await readBody(req)) || "{}") as { ms?: number };
    cartSlow.set(key ?? "default", input.ms ?? 1_000);
    return {
      status: 200,
      body: { data: { ms: cartSlow.get(key ?? "default") } },
    };
  }
  return { status: 404, body: { code: "STUB", message: url.pathname } };
}

/** 이번 담기를 늦출 시간(1회용). 늦추지 않으면 0 */
function takeCartDelay(
  method: string,
  path: string,
  cookie: string | undefined,
) {
  if (method !== "POST" || path !== "/api/retail/cart-items") return 0;
  const key = cookieOf(cookie, "stub_cart") ?? "default";
  const ms = cartSlow.get(key) ?? 0;
  cartSlow.delete(key);
  return ms;
}

export function startStubApi(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", STUB_ORIGIN);
    if (url.pathname === "/__stub/requests") {
      send(res, 200, { data: requestLog });
      return;
    }
    if (url.pathname.startsWith("/__stub/")) {
      void knob(req, url).then(({ status, body }) => send(res, status, body));
      return;
    }
    requestLog.push(`${req.method ?? "GET"} ${url.pathname}`);
    void readBody(req).then((raw) => {
      const method = req.method ?? "GET";
      const { status, body } = route(
        method,
        url.pathname,
        req.headers.cookie,
        raw,
        url.searchParams,
      );
      const delay = takeCartDelay(method, url.pathname, req.headers.cookie);
      if (delay > 0) setTimeout(() => send(res, status, body), delay);
      else send(res, status, body);
    });
  });
  return new Promise((resolve) =>
    server.listen(STUB_PORT, () => resolve(server)),
  );
}
