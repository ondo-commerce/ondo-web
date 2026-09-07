import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import {
  allocateMockPayment,
  mockOrderAmount,
  mockOrders,
  mockOrderSettlement,
  mockRetailer,
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
  /** PAYMENT일 때만 */
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
      balanceChange: -shippedAmount(shipped),
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

/** 지금까지 출고된 수량 × 단가. 시드 판매 줄의 금액 */
function shippedAmount(order: MockOrder): number {
  return order.items.reduce((acc, l) => acc + l.shippedQty * l.unitPrice, 0);
}

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
    allocations: payment.allocations.map((a) => ({
      id: a.id,
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      amount: a.amount,
      createdAt: a.createdAt,
    })),
    ledgerBalance: balanceOf(payment.retailerId),
    createdAt: payment.createdAt,
  };
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
const ENTRY_TYPES: readonly LedgerEntryType[] = ["SALE", "PAYMENT"];

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
        "entryType은 SALE 또는 PAYMENT여야 합니다.",
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
    for (const { order, amount } of targets)
      if (amount > mockOrderSettlement(order).outstandingAmount)
        return fail(
          409,
          "ALLOCATION_EXCEEDS_OUTSTANDING",
          `주문 ${order.orderNumber}의 미수(${mockOrderAmount(order) - order.allocatedAmount})를 넘었습니다.`,
        );

    const createdAt = new Date().toISOString();
    const payment: MockPayment = {
      id: nextPaymentId++,
      retailerId: body.retailerId,
      amount: body.amount,
      paidAt: body.paidAt,
      paidBy: body.paidBy,
      method: body.method,
      memo: isBlank(body.memo) ? null : body.memo,
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
      idempotencyKey: key,
      bodyJson,
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
