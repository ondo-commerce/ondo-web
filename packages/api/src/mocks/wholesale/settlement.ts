import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { daysBetween, seoulDate } from "../chat/backorderCandidates";
import type { InquiryReceivable } from "../chat/receivable";
import {
  allocateMockPayment,
  mockOrders,
  mockOrderSettlement,
  mockRetailer,
  mockShippedAmount,
  SEED_SHIPPED_AT,
  type MockOrder,
} from "./order";

/**
 * 정산 목 — 주문 목(`./order`)·출고 목(`./shipment`)과 **맞물린다.**
 *
 * BE 정산 컨트롤러는 스텁(MUL-83, `SettlementStubExamples`: 소매처 `서울유통`·`부산 상사` 2곳 · 원장 3줄 ·
 * 입금 응답 1건 고정)이라 그 값으로는 "출고 확정 → 미수 증가 → 입금·배분 → 미수 감소 → 원장" 흐름을 볼 수 없다.
 * 그래서 소매처는 V900 시드(주문 목이 옮긴 것: 봄봄상회 1 · 대기상회 2)에서 오고, 규칙은 스펙 설명을 따라 여기서 흉내 낸다:
 *
 *   - 판매(`SALE`) 원장 줄 = **출고 확정**(`POST /outbounds/{id}/ship`)이 남긴다 — 출고 목이 `recordMockSale`을 부른다.
 *     금액은 그 봉투에서 나간 수량 × 단가, 주문 단위로 한 줄. 미수는 여기서 는다
 *   - 입금(`PAYMENT`) 원장 줄 = `POST /payments`. `allocations`가 있으면 주문 목의 배정액을 올려
 *     정산 상태·미수 잔액(`GET /orders?retailerId`)이 함께 움직인다. 비면 선수금(스펙)
 *   - 주문별 미수 = **출고된 금액 − 배정액**(`mockOrderSettlement`). 판매 줄과 같은 식이라 주문별 미수의 합 =
 *     원장 잔액(선수금이 없을 때). 출고 안 된 확정 주문은 미수 0이고 배분하면 `ALLOCATION_EXCEEDS_OUTSTANDING`
 *   - `잔액` = 그 소매처 원장을 시각순으로 누적한 값. `meta.ledgerBalance`는 필터·페이지와 무관한 전체 잔액
 *   - 계좌 4종은 서로만 맞물린다(주계좌 승격·강등 규칙은 스펙 설명대로)
 *
 * 스텁에서 그대로 가져온 값: 원장 줄 id 시작 `10201`, 입금 id `4401`, 배정 id `7701`, 계좌 3건(`BankAccountStubExamples`).
 * 시드에 없어 **비워 둔 값**(지어내지 않는다): 소매처 코드 `retailerCode` → `""`, 원장 없는 소매처의 `lastOccurredAt` → `null`.
 *
 * 응답 모양은 스펙(`WholesaleSchema`)이 지킨다. 새로고침하면 시드로 돌아간다.
 */

type LedgerEntryType = WholesaleSchema<"LedgerEntryResponse">["entryType"];
type PaidBy = WholesaleSchema<"PaymentCreateRequest">["paidBy"];
type PaymentMethod = WholesaleSchema<"PaymentCreateRequest">["method"];

interface MockLedgerEntry {
  id: number;
  retailerId: number;
  entryType: LedgerEntryType;
  /** 부호 포함 — 판매 음수, 입금 양수(스펙) */
  balanceChange: number;
  occurredAt: string;
  /** SALE일 때만 */
  orderId: number | null;
  orderNumber: number | null;
  /** PAYMENT·PAYMENT_VOID일 때만(스펙). 목은 입금 취소가 없어 PAYMENT 줄만 채운다 */
  paymentId: number | null;
}

interface MockAllocation {
  id: number;
  orderId: number;
  orderNumber: number;
  amount: number;
  createdAt: string;
}

interface MockPayment {
  id: number;
  retailerId: number;
  amount: number;
  paidAt: string;
  paidBy: PaidBy;
  method: PaymentMethod;
  memo: string | null;
  allocations: MockAllocation[];
  createdAt: string;
  /** 같은 키 재요청은 같은 응답(스펙: 멱등). 본문이 다르면 409 */
  idempotencyKey: string;
  bodyJson: string;
}

interface MockBankAccount {
  id: number;
  bankName: string;
  accountNo: string;
  accountHolder: string;
  memo: string | null;
  isPrimary: boolean;
  createdAt: string;
}

/* --- 시드 --------------------------------------------------------------- */

/**
 * 시드 원장 = 시드에서 유일하게 출고까지 끝난 주문 7004(3 × 12,500)의 판매 줄 하나.
 * 출고 목의 시드 봉투 8801이 나간 시각과 같은 값이다. 입금은 시드에 없다.
 */
function seedLedger(): MockLedgerEntry[] {
  const shipped = mockOrders().find((o) => o.id === 7004);
  if (!shipped) return [];
  return [
    {
      id: 10201,
      retailerId: shipped.retailerId,
      entryType: "SALE",
      balanceChange: -mockShippedAmount(shipped),
      occurredAt: SEED_SHIPPED_AT,
      orderId: shipped.id,
      orderNumber: shipped.orderNumber,
      paymentId: null,
    },
  ];
}

/** `BankAccountStubExamples.accounts()` 그대로 — 자바 record 인자 순서 = 필드 순서 */
function seedBankAccounts(): MockBankAccount[] {
  return [
    {
      id: 91,
      bankName: "신한은행",
      accountNo: "110-482-948102",
      accountHolder: "서울유통",
      memo: "주거래 계좌",
      isPrimary: true,
      createdAt: "2025-01-15T10:00:00+09:00",
    },
    {
      id: 92,
      bankName: "국민은행",
      accountNo: "829102-01-294812",
      accountHolder: "김서울",
      memo: null,
      isPrimary: false,
      createdAt: "2025-02-10T09:20:00+09:00",
    },
    {
      id: 93,
      bankName: "기업은행",
      accountNo: "032-094812-01-011",
      accountHolder: "서울유통",
      memo: null,
      isPrimary: false,
      createdAt: "2025-04-02T14:05:00+09:00",
    },
  ];
}

let ledger = seedLedger();
let payments: MockPayment[] = [];
let bankAccounts = seedBankAccounts();
let nextLedgerId = 10202;
let nextPaymentId = 4401;
let nextAllocationId = 7701;
let nextBankAccountId = 94;

/* --- 출고 목이 쓰는 문 ----------------------------------------------------- */

/**
 * 출고 확정이 남기는 판매 줄. 출고 목의 `POST …/ship`이 주문마다 한 번 부른다 —
 * 미수는 주문 확정이 아니라 **물건이 나간 시점**에 는다(스펙: 출고 확정이 "재고가 실제로 줄어드는 유일한 지점").
 */
export function recordMockSale(
  order: MockOrder,
  amount: number,
  occurredAt: string,
): void {
  if (amount <= 0) return;
  ledger.push({
    id: nextLedgerId++,
    retailerId: order.retailerId,
    entryType: "SALE",
    balanceChange: -amount,
    occurredAt,
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentId: null,
  });
}

/** 입금 한 건을 저장소에 넣는다: 배정(주문 목 배정액), 입금, 원장 입금 줄. 검증은 부르는 쪽이 끝냈다 */
function pushPayment(
  p: Omit<MockPayment, "id" | "allocations" | "createdAt">,
  targets: readonly { order: MockOrder; amount: number }[],
): MockPayment {
  const createdAt = new Date().toISOString();
  const payment: MockPayment = {
    ...p,
    id: nextPaymentId++,
    allocations: targets.map(({ order, amount }) => {
      allocateMockPayment(order, amount);
      return {
        id: nextAllocationId++,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount,
        createdAt,
      };
    }),
    createdAt,
  };
  payments.push(payment);
  ledger.push({
    id: nextLedgerId++,
    retailerId: payment.retailerId,
    entryType: "PAYMENT",
    balanceChange: payment.amount,
    occurredAt: payment.paidAt,
    orderId: null,
    orderNumber: null,
    paymentId: payment.id,
  });
  return payment;
}

/**
 * 시험 손잡이용 입금(목 전용). 소매 앱 번들에는 정산 핸들러가 없어 소매 화면에서 갚을 돈 0(문장 C), 선수금(D)을
 * 만들 길이 없다 — 소매 채팅 목 `/__mock/chat/payment`가 이 함수로 같은 장부에 입금을 넣는다(loop-07 M5).
 * 규칙은 `POST /payments`와 같은 저장 경로(`pushPayment`)를 탄다. 배분이 미수를 넘거나 남의 주문이면 던진다
 */
export function recordMockPayment(input: {
  retailerId: number;
  amount: number;
  allocations: readonly { orderId: number; amount: number }[];
  paidAt?: string;
}): void {
  const targets = input.allocations.map((a) => {
    const order = mockOrders().find((o) => o.id === a.orderId);
    if (order === undefined || order.retailerId !== input.retailerId)
      throw new Error(`목: 배분할 주문 ${a.orderId}이 없다`);
    if (a.amount > mockOrderSettlement(order).outstandingAmount)
      throw new Error(`목: 주문 ${a.orderId} 미수를 넘는 배분`);
    return { order, amount: a.amount };
  });
  if (targets.reduce((s, t) => s + t.amount, 0) > input.amount)
    throw new Error("목: 배분 합계가 입금액을 넘었다");
  pushPayment(
    {
      retailerId: input.retailerId,
      amount: input.amount,
      paidAt: input.paidAt ?? new Date().toISOString(),
      paidBy: "RETAILER",
      method: "BANK_TRANSFER",
      memo: null,
      idempotencyKey: `mock-${nextPaymentId}`,
      bodyJson: "",
    },
    targets,
  );
}

/* --- 조회 --------------------------------------------------------------- */

/** 서버 에러 본문 모양. `packages/api` 런타임이 `code`·`message`로 읽는다 */
function fail(status: number, code: string, message: string, field?: string) {
  return HttpResponse.json(
    {
      code,
      message,
      errors: field ? [{ field, reason: message }] : [],
      traceId: "mock",
    },
    { status },
  );
}

function pageMeta(total: number, page: number, size: number) {
  const meta: WholesaleSchema<"PageMeta"> = {
    page,
    size,
    totalElements: total,
    totalPages: Math.max(Math.ceil(total / size), 1),
  };
  return meta;
}

/** 그 소매처의 원장 줄, 시각 오름차순(같은 시각은 id순). 잔액 누적의 기준 순서 */
function ledgerOf(retailerId: number | null): MockLedgerEntry[] {
  return ledger
    .filter((e) => retailerId === null || e.retailerId === retailerId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id);
}

function balanceOf(retailerId: number): number {
  return ledgerOf(retailerId).reduce((acc, e) => acc + e.balanceChange, 0);
}

/** 확정 주문(신규·취소 제외). 스펙: 소매처 목록은 "확정 주문만 센다" */
function confirmedOrdersOf(retailerId: number): MockOrder[] {
  return mockOrders().filter(
    (o) => o.retailerId === retailerId && o.status === "CONFIRMED",
  );
}

/** 목록에 서는 소매처 = 확정 주문이 있거나 원장 줄이 있는 곳. id 오름차순(정렬 규칙이 스펙에 없다) */
function receivableRetailerIds(): number[] {
  const ids = new Set<number>();
  for (const o of mockOrders())
    if (o.status === "CONFIRMED") ids.add(o.retailerId);
  for (const e of ledger) ids.add(e.retailerId);
  return [...ids].sort((a, b) => a - b);
}

function retailerResponse(
  retailerId: number,
): WholesaleSchema<"ReceivableRetailerResponse"> {
  const retailer = mockRetailer(retailerId);
  const entries = ledgerOf(retailerId);
  return {
    retailerId,
    retailerCode: retailer?.code ?? "",
    retailerName: retailer?.name ?? "",
    orderCount: confirmedOrdersOf(retailerId).length,
    ledgerBalance: balanceOf(retailerId),
    // 스펙에 nullable이 없어 타입은 string이지만 원장이 없으면 null이다
    lastOccurredAt: (entries.at(-1)?.occurredAt ?? null) as string,
  };
}

/** 원장 줄 + 그 시점 잔액. 소매처별로 시각순 누적한 뒤 응답 순서(최신순)로 뒤집는다 */
function ledgerResponses(
  retailerId: number | null,
): WholesaleSchema<"LedgerEntryResponse">[] {
  const byRetailer = new Map<number, number>();
  return ledgerOf(retailerId)
    .map((e) => {
      const after = (byRetailer.get(e.retailerId) ?? 0) + e.balanceChange;
      byRetailer.set(e.retailerId, after);
      return {
        id: e.id,
        entryType: e.entryType,
        balanceChange: e.balanceChange,
        balanceAfter: after,
        occurredAt: e.occurredAt,
        // 스펙에 nullable이 없어 타입은 number지만 종류에 따라 null이다
        orderId: e.orderId as number,
        orderNumber: e.orderNumber as number,
        paymentId: e.paymentId as number,
      };
    })
    .reverse();
}

function paymentResponse(
  payment: MockPayment,
): WholesaleSchema<"PaymentCreatedResponse"> {
  const retailer = mockRetailer(payment.retailerId);
  const allocated = payment.allocations.reduce((acc, a) => acc + a.amount, 0);
  return {
    id: payment.id,
    retailerId: payment.retailerId,
    retailerName: retailer?.name ?? "",
    amount: payment.amount,
    paidAt: payment.paidAt,
    paidBy: payment.paidBy,
    method: payment.method,
    memo: payment.memo as string,
    unallocatedAmount: payment.amount - allocated,
    // 등록 후 거래처 선수금 전체(스펙: `prepaid = totalPaid − totalAllocated`). 이번 입금만이 아니다
    prepaidRemaining: prepaidOf(payment.retailerId),
    allocations: payment.allocations.map((a) => ({
      id: a.id,
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      amount: a.amount,
      createdAt: a.createdAt,
      paymentId: payment.id,
    })),
    ledgerBalance: balanceOf(payment.retailerId),
    createdAt: payment.createdAt,
  };
}

/** 소매처의 남은 선수금 = Σ(입금액 − 그 입금의 배정 합). 목은 입금 취소가 없어 뺄 것이 없다 */
function prepaidOf(retailerId: number): number {
  return payments
    .filter((p) => p.retailerId === retailerId)
    .reduce(
      (acc, p) =>
        acc + p.amount - p.allocations.reduce((s, a) => s + a.amount, 0),
      0,
    );
}

function bankAccountResponse(
  account: MockBankAccount,
): WholesaleSchema<"BankAccountResponse"> {
  return {
    id: account.id,
    bankName: account.bankName,
    accountNo: account.accountNo,
    accountHolder: account.accountHolder,
    // 스펙에 nullable이 없어 타입은 string이지만 메모는 비어 있을 수 있다(`wholesale.ts` 머리 주석)
    memo: account.memo as string,
    isPrimary: account.isPrimary,
    createdAt: account.createdAt,
  };
}

/** 주계좌 먼저 → 등록순(스펙, `sort` 미지원) */
function sortedBankAccounts(): MockBankAccount[] {
  return [...bankAccounts].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id - b.id,
  );
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function isDuplicateAccount(
  bankName: string,
  accountNo: string,
  exceptId: number | null,
): boolean {
  return bankAccounts.some(
    (a) =>
      a.id !== exceptId && a.bankName === bankName && a.accountNo === accountNo,
  );
}

/** 주계좌 승격 — 나머지는 한 트랜잭션에서 내려간다(스펙) */
function promote(account: MockBankAccount) {
  for (const a of bankAccounts) a.isPrimary = a.id === account.id;
}

function findBankAccount(raw: string | readonly string[] | undefined) {
  const id = Number(raw);
  return bankAccounts.find((a) => a.id === id) ?? null;
}

const PAID_BY: readonly PaidBy[] = ["RETAILER", "AGENT"];
const METHODS: readonly PaymentMethod[] = ["CASH", "BANK_TRANSFER"];
/** 스펙 enum 4종. 목은 입금 취소·조정 줄을 만들지 않지만 필터 값으로는 받는다(서버가 400을 안 내는 값은 목도 안 낸다) */
const ENTRY_TYPES: readonly LedgerEntryType[] = [
  "SALE",
  "PAYMENT",
  "PAYMENT_VOID",
  "ADJUST",
];

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다.
 * `receivables/retailers`가 `receivables`보다 먼저다 — MSW는 경로를 정확히 맞추지만 순서를 두는 편이 읽기 쉽다.
 */
export const settlementHandlers = [
  http.get("*/api/wholesale/receivables/retailers", ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    if (size > 100)
      return fail(
        400,
        "VALIDATION_FAILED",
        "size는 100 이하여야 합니다.",
        "size",
      );
    const rows = receivableRetailerIds().map(retailerResponse);
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size),
      meta: pageMeta(rows.length, page, size),
    });
  }),

  http.get("*/api/wholesale/receivables", ({ request }) => {
    const url = new URL(request.url);
    const retailerId = url.searchParams.get("retailerId");
    const entryType = url.searchParams.get("entryType");
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    if (size > 100)
      return fail(
        400,
        "VALIDATION_FAILED",
        "size는 100 이하여야 합니다.",
        "size",
      );
    if (entryType !== null && !(ENTRY_TYPES as string[]).includes(entryType))
      return fail(
        400,
        "VALIDATION_FAILED",
        `entryType은 ${ENTRY_TYPES.join(", ")} 중 하나여야 합니다.`,
        "entryType",
      );
    // 404 없음 — 거래 이력 없는 소매처도 200 + [] + 잔액 0(스펙)
    const scope = retailerId === null ? null : Number(retailerId);
    const rows = ledgerResponses(scope).filter(
      (e) => entryType === null || e.entryType === entryType,
    );
    const total =
      scope === null
        ? ledger.reduce((acc, e) => acc + e.balanceChange, 0)
        : balanceOf(scope);
    const meta: WholesaleSchema<"LedgerMeta"> = {
      ...pageMeta(rows.length, page, size),
      ledgerBalance: total,
    };
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size),
      meta,
    });
  }),

  http.post("*/api/wholesale/payments", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key");
    if (!key)
      return fail(
        400,
        "VALIDATION_FAILED",
        "Idempotency-Key 헤더가 필요합니다.",
        "Idempotency-Key",
      );
    const bodyJson = await request.text();
    const body = JSON.parse(
      bodyJson,
    ) as WholesaleSchema<"PaymentCreateRequest">;

    // 같은 키 재요청 — 본문이 같으면 200 + 동일 본문(멱등), 다르면 409(스펙)
    const seen = payments.find((p) => p.idempotencyKey === key);
    if (seen) {
      if (seen.bodyJson === bodyJson)
        return HttpResponse.json({ data: paymentResponse(seen) });
      return fail(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "같은 키로 다른 입금을 보냈습니다.",
      );
    }

    // 스펙 설명의 에러 코드 순서대로 — 400(형식·정책) → 404 → 409(상태)
    if (typeof body.amount !== "number" || body.amount <= 0)
      return fail(
        400,
        "VALIDATION_FAILED",
        "입금액은 1 이상이어야 합니다.",
        "amount",
      );
    const paidAt =
      typeof body.paidAt === "string" ? new Date(body.paidAt) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime()))
      return fail(
        400,
        "VALIDATION_FAILED",
        "입금 일시 형식이 올바르지 않습니다.",
        "paidAt",
      );
    if (paidAt.getTime() > Date.now())
      return fail(
        400,
        "PAID_AT_IN_FUTURE",
        "입금 일시가 미래입니다.",
        "paidAt",
      );
    if (!PAID_BY.includes(body.paidBy))
      return fail(
        400,
        "VALIDATION_FAILED",
        "결제 주체가 올바르지 않습니다.",
        "paidBy",
      );
    if (!METHODS.includes(body.method))
      return fail(
        400,
        "VALIDATION_FAILED",
        "입금 방식이 올바르지 않습니다.",
        "method",
      );
    const retailer = mockRetailer(body.retailerId);
    if (!retailer)
      return fail(404, "RESOURCE_NOT_FOUND", "거래 이력이 없는 소매처입니다.");

    const allocations = body.allocations ?? [];
    const targets: { order: MockOrder; amount: number }[] = [];
    for (const a of allocations) {
      if (typeof a.amount !== "number" || a.amount <= 0)
        return fail(
          400,
          "VALIDATION_FAILED",
          "배분액은 1 이상이어야 합니다.",
          "allocations",
        );
      if (targets.some((t) => t.order.id === a.orderId))
        return fail(
          400,
          "DUPLICATE_ORDER",
          "같은 주문이 두 번 들어왔습니다.",
          "allocations",
        );
      const order = mockOrders().find((o) => o.id === a.orderId);
      if (!order)
        return fail(404, "RESOURCE_NOT_FOUND", "배분할 주문이 없습니다.");
      if (order.retailerId !== body.retailerId)
        return fail(
          400,
          "ORDER_RETAILER_MISMATCH",
          "다른 소매처의 주문입니다.",
          "allocations",
        );
      targets.push({ order, amount: a.amount });
    }
    for (const { order } of targets)
      if (order.status !== "CONFIRMED")
        return fail(
          409,
          "ORDER_NOT_CONFIRMED",
          "확정되지 않은 주문에는 배분할 수 없습니다.",
        );
    const allocated = targets.reduce((acc, t) => acc + t.amount, 0);
    if (allocated > body.amount)
      return fail(
        409,
        "ALLOCATION_EXCEEDS_PAYMENT",
        "배분 합계가 입금액을 넘었습니다.",
      );
    // 미수 = 출고된 금액 − 배정액. 출고 안 된 주문은 미수 0이라 1원만 붙여도 여기서 막힌다
    for (const { order, amount } of targets)
      if (amount > mockOrderSettlement(order).outstandingAmount)
        return fail(
          409,
          "ALLOCATION_EXCEEDS_OUTSTANDING",
          `주문 ${order.orderNumber}의 미수(${mockOrderSettlement(order).outstandingAmount})를 넘었습니다.`,
        );

    const payment = pushPayment(
      {
        retailerId: body.retailerId,
        amount: body.amount,
        paidAt: body.paidAt,
        paidBy: body.paidBy,
        method: body.method,
        memo: isBlank(body.memo) ? null : (body.memo ?? null),
        idempotencyKey: key,
        bodyJson,
      },
      targets,
    );
    return HttpResponse.json(
      { data: paymentResponse(payment) },
      { status: 201 },
    );
  }),

  http.get("*/api/wholesale/bank-accounts", () =>
    HttpResponse.json({ data: sortedBankAccounts().map(bankAccountResponse) }),
  ),

  http.post("*/api/wholesale/bank-accounts", async ({ request }) => {
    const body =
      (await request.json()) as WholesaleSchema<"BankAccountCreateRequest">;
    if (isBlank(body.bankName))
      return fail(
        400,
        "VALIDATION_FAILED",
        "은행명을 입력해 주세요.",
        "bankName",
      );
    if (isBlank(body.accountNo))
      return fail(
        400,
        "VALIDATION_FAILED",
        "계좌번호를 입력해 주세요.",
        "accountNo",
      );
    if (isBlank(body.accountHolder))
      return fail(
        400,
        "VALIDATION_FAILED",
        "예금주를 입력해 주세요.",
        "accountHolder",
      );
    if (isDuplicateAccount(body.bankName, body.accountNo, null))
      return fail(
        400,
        "DUPLICATE_BANK_ACCOUNT",
        "이미 등록된 계좌입니다.",
        "accountNo",
      );

    const account: MockBankAccount = {
      id: nextBankAccountId++,
      bankName: body.bankName.trim(),
      accountNo: body.accountNo.trim(),
      accountHolder: body.accountHolder.trim(),
      memo: isBlank(body.memo) ? null : (body.memo as string),
      // 첫 계좌는 `isPrimary`와 무관하게 주계좌(스펙)
      isPrimary: bankAccounts.length === 0 || body.isPrimary === true,
      createdAt: new Date().toISOString(),
    };
    bankAccounts.push(account);
    if (account.isPrimary) promote(account);
    return HttpResponse.json(
      { data: bankAccountResponse(account) },
      { status: 201 },
    );
  }),

  http.patch(
    "*/api/wholesale/bank-accounts/:bankAccountId",
    async ({ params, request }) => {
      const account = findBankAccount(params.bankAccountId);
      if (!account)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "계좌가 없거나 이미 삭제됐습니다.",
        );
      const body = (await request.json()) as Partial<
        WholesaleSchema<"BankAccountUpdateRequest">
      >;
      // 보낸 필드만 바뀐다(스펙 공통 §6). 빈 문자열은 검증 실패, `memo`만 null로 지운다
      if (body.bankName !== undefined && isBlank(body.bankName))
        return fail(
          400,
          "VALIDATION_FAILED",
          "은행명을 입력해 주세요.",
          "bankName",
        );
      if (body.accountNo !== undefined && isBlank(body.accountNo))
        return fail(
          400,
          "VALIDATION_FAILED",
          "계좌번호를 입력해 주세요.",
          "accountNo",
        );
      if (body.accountHolder !== undefined && isBlank(body.accountHolder))
        return fail(
          400,
          "VALIDATION_FAILED",
          "예금주를 입력해 주세요.",
          "accountHolder",
        );
      if (body.isPrimary === false && account.isPrimary)
        return fail(
          400,
          "PRIMARY_ACCOUNT_CANNOT_BE_UNSET",
          "주계좌는 직접 해제할 수 없습니다. 다른 계좌를 주계좌로 지정해 주세요.",
          "isPrimary",
        );
      const bankName = body.bankName?.trim() ?? account.bankName;
      const accountNo = body.accountNo?.trim() ?? account.accountNo;
      if (isDuplicateAccount(bankName, accountNo, account.id))
        return fail(
          400,
          "DUPLICATE_BANK_ACCOUNT",
          "이미 등록된 계좌입니다.",
          "accountNo",
        );

      account.bankName = bankName;
      account.accountNo = accountNo;
      if (body.accountHolder !== undefined)
        account.accountHolder = body.accountHolder.trim();
      if (body.memo !== undefined)
        account.memo = isBlank(body.memo) ? null : (body.memo as string);
      if (body.isPrimary === true) promote(account);
      return HttpResponse.json({ data: bankAccountResponse(account) });
    },
  ),

  http.delete("*/api/wholesale/bank-accounts/:bankAccountId", ({ params }) => {
    const account = findBankAccount(params.bankAccountId);
    if (!account)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "계좌가 없거나 이미 삭제됐습니다.",
      );
    bankAccounts = bankAccounts.filter((a) => a.id !== account.id);
    // 주계좌를 지우면 가장 먼저 등록된 계좌가 조용히 승격된다(스펙)
    if (account.isPrimary) {
      const oldest = [...bankAccounts].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
      )[0];
      if (oldest) promote(oldest);
    }
    return new HttpResponse(null, { status: 204 });
  }),
];

/* --- 채팅 미수 자동 답의 원본 (loop-07 §4-1, §5-4 1) ------------------------- */

/** 요약이 읽는 원장 줄. 목의 `MockLedgerEntry`가 그대로 맞는다 */
export type SummaryLedgerLine = Pick<
  MockLedgerEntry,
  "retailerId" | "entryType" | "balanceChange" | "occurredAt" | "orderId"
>;
/** 요약이 읽는 주문. `allocatedAmount` = 그 주문에 붙은 배정 합 */
export type SummaryOrder = Pick<
  MockOrder,
  "id" | "retailerId" | "status" | "allocatedAmount"
>;
export interface SummaryPayment {
  retailerId: number;
  amount: number;
  allocations: readonly { amount: number }[];
}

/**
 * 소매처 하나의 미수 요약(순수). 채팅 판정 원본 한 줄(`InquiryReceivable`)에서 쌍 id를 뺀 모양이다.
 * BE도 gateway 요약과 선수금 op로 같은 값을 만든다(§5-3 1).
 *
 *  - `balance` = −Σ 원장 증감(판매 음수, 입금 양수라 뒤집는다). 플러스 = 갚을 돈
 *  - `unpaid` = 판매 줄이 있는 주문마다 (판매 합 − 배정액)의 합
 *  - `prepaid` = Σ(입금액 − 그 입금의 배정 합). 목 `prepaidOf`와 같은 식
 *  - 연체 = 미수 > 0이고 판매 줄이 **서울 날짜 하나**뿐인 주문. 일수 = 오늘 − 출고일 − 1(외상 1일, MUL-128 전).
 *    1 이상이면 연체. 출고 다음 날은 아직 아니다. 근거는 dev 실측 1건(9/8 출고, 9/18 조회 maxDays 9)이다
 *  - `exact` false = 금액을 보장 못 한다: 미수가 남은 주문의 판매 줄이 서울 날짜 둘 이상(배정이 어느 출고분을
 *    갚았는지 규칙이 없다) / `PAYMENT_VOID`, `ADJUST` 줄 / 취소된 주문의 판매 줄 / 판매 줄의 주문이 `orders`에
 *    없음 / 배정액이 판매 합보다 큼
 *
 * 연체 일수 기준 날짜 `today`(서울 `YYYY-MM-DD`)와 조회 시각 `asOf`는 부르는 쪽이 넘긴다 — 같은 호출에서 나온
 * 값이어야 답의 금액과 조회 시각이 한 시점을 가리킨다(Codex 6).
 */
export function receivableSummary(input: {
  ledger: readonly SummaryLedgerLine[];
  orders: readonly SummaryOrder[];
  payments: readonly SummaryPayment[];
  retailerId: number;
  today: string;
  asOf: string;
}): Omit<InquiryReceivable, "wholesalerId" | "retailerId"> {
  const lines = input.ledger.filter((e) => e.retailerId === input.retailerId);
  // `0 −`로 뒤집는다. 단항 `-`는 합이 0일 때 -0을 낸다(toEqual 이 0과 가른다)
  const balance = 0 - lines.reduce((acc, e) => acc + e.balanceChange, 0);
  let exact = !lines.some(
    (e) => e.entryType === "PAYMENT_VOID" || e.entryType === "ADJUST",
  );

  const sales = new Map<number, { amount: number; dates: Set<string> }>();
  for (const e of lines) {
    if (e.entryType !== "SALE" || e.orderId === null) continue;
    const s = sales.get(e.orderId) ?? { amount: 0, dates: new Set<string>() };
    s.amount += -e.balanceChange;
    s.dates.add(seoulDate(Date.parse(e.occurredAt)));
    sales.set(e.orderId, s);
  }

  let unpaid = 0;
  const overdue = { amount: 0, count: 0, maxDays: 0 };
  for (const [orderId, s] of sales) {
    const order = input.orders.find((o) => o.id === orderId);
    // 주문 원본이 없으면 취소됐는지도, 얼마 배정됐는지도 모른다. 배정 0으로 치면 취소 방어를 건너뛰고 판매 합
    // 전체를 미수로 말한다(Codex M2). 금액은 계속 셈하되 보장하지 않는다
    if (order === undefined || order.status === "CANCELLED") exact = false;
    const left = s.amount - (order?.allocatedAmount ?? 0);
    if (left < 0) exact = false;
    if (left <= 0) continue;
    unpaid += left;
    const [only] = [...s.dates];
    if (s.dates.size > 1 || only === undefined) {
      exact = false;
      continue;
    }
    const days = daysBetween(only, input.today) - 1;
    if (days < 1) continue;
    overdue.amount += left;
    overdue.count += 1;
    overdue.maxDays = Math.max(overdue.maxDays, days);
  }

  const prepaid = input.payments
    .filter((p) => p.retailerId === input.retailerId)
    .reduce(
      (acc, p) =>
        acc + p.amount - p.allocations.reduce((s, a) => s + a.amount, 0),
      0,
    );

  return { balance, unpaid, prepaid, overdue, exact, asOf: input.asOf };
}

/** 정산 목은 도매처 하나("나" 101)의 장부다. 채팅 목 `CHAT_ME_WHOLESALER_ID`와 같은 값 */
export const SETTLEMENT_WHOLESALER_ID = 101;

/**
 * 채팅 판정 원본 — 이 장부의 소매처마다 한 줄(정산 소매처 목록과 같은 기준: 확정 주문이나 원장 줄이 있는 곳).
 * 저장소를 지금 읽는다. 그래서 정산 탭 입금이 다음 자동 답에 바로 쓰인다(S3-3). 소매 앱 번들에는 정산 핸들러가
 * 없어 늘 시드 값이다 — 두 탭이 같은 시드와 같은 함수를 쓰는 것까지가 목의 보장이다(§2-1)
 */
export function mockReceivableRows(now = Date.now()): InquiryReceivable[] {
  const asOf = new Date(now).toISOString();
  const today = seoulDate(now);
  return receivableRetailerIds().map((retailerId) => ({
    wholesalerId: SETTLEMENT_WHOLESALER_ID,
    retailerId,
    ...receivableSummary({
      ledger,
      orders: mockOrders(),
      payments,
      retailerId,
      today,
      asOf,
    }),
  }));
}

/** 쌍 하나. 테스트가 기대값을 읽을 때 쓴다(판정은 전체를 받아 스스로 고른다) */
export function mockReceivable(
  wholesalerId: number,
  retailerId: number,
  now = Date.now(),
): InquiryReceivable | null {
  return (
    mockReceivableRows(now).find(
      (r) => r.wholesalerId === wholesalerId && r.retailerId === retailerId,
    ) ?? null
  );
}

/** 화면 검증 중 시드로 되돌릴 때. 앱은 부르지 않는다. 주문·출고 목도 같이 되돌려야 맞물린다 */
export function resetSettlementMock() {
  ledger = seedLedger();
  payments = [];
  bankAccounts = seedBankAccounts();
  nextLedgerId = 10202;
  nextPaymentId = 4401;
  nextAllocationId = 7701;
  nextBankAccountId = 94;
}
