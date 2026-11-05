import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { daysBetween, seoulDate } from "../chat/backorderCandidates";
import type { InquiryReceivable } from "../chat/receivable";
import {
  allocateMockPayment,
  releaseMockAllocation,
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
 *     정산 상태·미수 잔액(`GET /orders?retailerId`)이 함께 움직인다. 비면 선수금(스펙). 배분 합계 상한은
 *     이번 입금 + 남은 선수금이고, 모자라면 옛 입금의 남은 몫을 끌어 쓴다(loop-08c S4)
 *   - 선수금 정산(`POST /allocations`) = 새 입금 없이 남은 선수금을 주문에 붙인다. 배분 줄만 생기고 입금, 원장은
 *     그대로(loop-08f §4-6)
 *   - 배분 취소(`POST /allocations/{id}/cancel`) = 줄에 취소 표시, 주문 배정액에서 빼고 그 입금 남은 몫으로 돌린다
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

/**
 * 배분 줄 = (주문, 돈이 나온 입금)마다 하나. 입금 배열 안에 두지 않고 따로 쌓는다 — 한 요청이 이번 입금과
 * 옛 입금의 남은 몫을 같이 쓰면(스펙: 상한 = 이번 입금 + 남은 선수금) 줄마다 `paymentId`가 다르기 때문이다
 */
interface MockAllocation {
  id: number;
  retailerId: number;
  orderId: number;
  orderNumber: number;
  /** 돈이 나온 입금. 이 줄을 만든 요청의 입금이 아닐 수 있다 */
  paymentId: number;
  amount: number;
  createdAt: string;
  /** 취소 표시. 줄은 지우지 않는다(스펙 `cancelAllocation`). 취소된 줄은 요약, 선수금, 남은 몫에서 빠진다 */
  cancelledAt: string | null;
}

interface MockPayment {
  id: number;
  retailerId: number;
  amount: number;
  paidAt: string;
  paidBy: PaidBy;
  method: PaymentMethod;
  memo: string | null;
  createdAt: string;
  /** 같은 키 재요청은 같은 응답(스펙: 멱등). 본문이 다르면 409 */
  idempotencyKey: string;
  bodyJson: string;
}

/** 배분 계획 한 줄. `paymentId` null = 이번에 저장할 입금 */
interface PlannedAllocation {
  order: MockOrder;
  paymentId: number | null;
  amount: number;
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
let allocations: MockAllocation[] = [];
/**
 * 입금 id → 처음 201 본문. 같은 키 재요청은 이것을 그대로 돌려준다 — 그 뒤 선수금이 쓰였거나 배분이 취소됐어도
 * 다시 셈하지 않는다(멱등은 "같은 요청에 같은 답", 기획 §4-5 5)
 */
let firstResponses = new Map<
  number,
  WholesaleSchema<"PaymentCreatedResponse">
>();
/**
 * 선수금 정산(`POST /allocations`) 키 → 처음 본문과 201 응답. 입금 키와 저장소를 나눈다 — 정산은 입금을 안 만들어
 * `payments`에 키를 둘 곳이 없다. 같은 키 같은 본문은 이 응답 그대로(다시 셈하지 않는다), 다른 본문은 409
 */
let allocationReplays = new Map<
  string,
  { bodyJson: string; response: WholesaleSchema<"AllocationCreatedResponse"> }
>();
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

/** 입금 하나의 남은 몫 = 입금액 − 그 입금에서 나간 취소 안 된 배분 줄 합 */
function remainingOf(payment: MockPayment): number {
  return allocations.reduce(
    (left, a) =>
      a.paymentId === payment.id && a.cancelledAt === null
        ? left - a.amount
        : left,
    payment.amount,
  );
}

/**
 * 배분 계획(스펙 `createPayment`). 요청 `allocations` 순서대로 주문을 채우고, 주문마다 이번 입금을 먼저 쓴 뒤
 * 모자라면 그 소매처의 옛 입금을 paidAt 오름차순(같으면 id)으로 남은 몫부터 끌어 쓴다.
 * 줄은 (주문, 입금)마다 하나. 합계가 이번 입금 + 남은 선수금을 넘으면 null — 아무것도 저장하지 않는다
 */
function planAllocations(
  retailerId: number,
  amount: number,
  targets: readonly { order: MockOrder; amount: number }[],
): PlannedAllocation[] | null {
  const sources: { paymentId: number | null; left: number }[] = [
    { paymentId: null, left: amount },
    ...payments
      .filter((p) => p.retailerId === retailerId)
      /* 시각으로 비교한다(리뷰 R6). paidAt은 요청이 준 문자열 그대로라 "+09:00"과 "Z"가 섞이면 글자 순이 시각 순과 다르다 */
      .sort(
        (a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id - b.id,
      )
      .map((p) => ({ paymentId: p.id, left: remainingOf(p) })),
  ];
  const plan: PlannedAllocation[] = [];
  for (const target of targets) {
    let need = target.amount;
    for (const source of sources) {
      if (need === 0) break;
      const take = Math.min(need, source.left);
      if (take <= 0) continue;
      source.left -= take;
      need -= take;
      plan.push({
        order: target.order,
        paymentId: source.paymentId,
        amount: take,
      });
    }
    if (need > 0) return null;
  }
  return plan;
}

/**
 * 배분 계획을 저장소에 넣는다: 배분 줄과 주문 목 배정액만. 입금과 원장은 건드리지 않는다.
 * `POST /payments`(`pushPayment`)와 `POST /allocations`가 같이 쓴다(loop-08f §4-6). 선수금 정산은 새 입금이
 * 없어서 `pushPayment`를 그대로 쓰면 입금과 원장 PAYMENT 줄이 하나씩 더 생긴다.
 * `thisPaymentId` = 계획의 "이번 입금" 몫(paymentId null)이 붙을 입금. 선수금 정산은 이번 입금이 0이라 null이고,
 * 그때 이번 입금 몫이 계획에 있으면 계획이 틀린 것이라 던진다(저장 전에)
 */
function pushAllocationLines(
  retailerId: number,
  plan: readonly PlannedAllocation[],
  thisPaymentId: number | null,
  createdAt: string,
): MockAllocation[] {
  if (thisPaymentId === null && plan.some((p) => p.paymentId === null))
    throw new Error("목: 이번 입금이 없는 배분 계획에 이번 입금 몫이 있다");
  return plan.map(({ order, paymentId, amount }) => {
    allocateMockPayment(order, amount);
    const line: MockAllocation = {
      id: nextAllocationId++,
      retailerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: (paymentId ?? thisPaymentId) as number,
      amount,
      createdAt,
      cancelledAt: null,
    };
    allocations.push(line);
    return line;
  });
}

/**
 * 입금 한 건을 저장소에 넣는다: 배분 줄(주문 목 배정액), 입금, 원장 입금 줄, 처음 응답. 검증과 계획은 부르는 쪽이
 * 끝냈다. 원장 입금 줄은 이번 입금액 그대로다 — 옛 입금의 남은 몫을 끌어 써도 원장은 안 바뀐다(받은 돈은 그대로)
 */
function pushPayment(
  p: Omit<MockPayment, "id" | "createdAt">,
  plan: readonly PlannedAllocation[],
): WholesaleSchema<"PaymentCreatedResponse"> {
  const createdAt = new Date().toISOString();
  const id = nextPaymentId++;
  const payment: MockPayment = { ...p, id, createdAt };
  const lines = pushAllocationLines(p.retailerId, plan, id, createdAt);
  ledger.push({
    id: nextLedgerId++,
    retailerId: p.retailerId,
    entryType: "PAYMENT",
    balanceChange: p.amount,
    occurredAt: p.paidAt,
    orderId: null,
    orderNumber: null,
    paymentId: id,
  });
  payments.push(payment);
  // 응답 셈(선수금, 원장 잔액)은 이 입금이 저장된 뒤라야 맞다
  const response = paymentResponse(payment, lines);
  firstResponses.set(id, response);
  return response;
}

/**
 * 시험 손잡이용 입금(목 전용). 소매 앱 번들에는 정산 핸들러가 없어 소매 화면에서 갚을 돈 0(문장 C), 선수금(D)을
 * 만들 길이 없다 — 소매 채팅 목 `/__mock/chat/payment`가 이 함수로 같은 장부에 입금을 넣는다(loop-07 M5).
 * 규칙은 `POST /payments`와 같은 저장 경로(`pushPayment`)를 탄다. 배분이 미수를 넘거나 남의 주문이면 던진다.
 * 상한도 `POST /payments`와 같다: 이번 입금 + 그 소매처 남은 선수금(loop-08e S1-2). 모자라면 옛 입금의 남은 몫을
 * 오래된 것부터 끌어 쓴다(`planAllocations`). 던지면 아무것도 저장하지 않는다. 돌려주는 값은 `POST /payments` 201의
 * `data`와 같은 모양이다 — 소매 e2e가 배분 줄 `id`를 받아 `allocation-cancel`에 넘긴다
 */
export function recordMockPayment(input: {
  retailerId: number;
  amount: number;
  allocations: readonly { orderId: number; amount: number }[];
  paidAt?: string;
  /** 있으면 `POST /payments`의 Idempotency-Key처럼 저장한다. 재전송 판정은 `replayMockPayment`가 먼저 한다 */
  idempotencyKey?: string;
  /** 같은 키 재전송의 본문 비교값 */
  bodyJson?: string;
}): WholesaleSchema<"PaymentCreatedResponse"> {
  const targets: { order: MockOrder; amount: number }[] = [];
  for (const a of input.allocations) {
    /* 주문마다 지금 미수와만 비교하므로 같은 주문 두 줄은 각자 통과해 미수를 두 번 채운다(loop-08e R1) */
    if (repeatsOrder(targets, a.orderId))
      throw new MockPaymentRejected(
        "DUPLICATE_ORDER",
        `목: 주문 ${a.orderId}이 두 번 들어왔다`,
      );
    const order = mockOrders().find((o) => o.id === a.orderId);
    if (order === undefined || order.retailerId !== input.retailerId)
      throw new Error(`목: 배분할 주문 ${a.orderId}이 없다`);
    if (typeof a.amount !== "number" || a.amount <= 0)
      throw new Error(`목: 주문 ${a.orderId} 배분액은 1 이상이어야 한다`);
    if (a.amount > mockOrderSettlement(order).outstandingAmount)
      throw new Error(`목: 주문 ${a.orderId} 미수를 넘는 배분`);
    targets.push({ order, amount: a.amount });
  }
  const plan = planAllocations(input.retailerId, input.amount, targets);
  if (plan === null)
    throw new Error("목: 배분 합계가 입금액과 남은 선수금을 넘었다");
  return pushPayment(
    {
      retailerId: input.retailerId,
      amount: input.amount,
      paidAt: input.paidAt ?? new Date().toISOString(),
      paidBy: "RETAILER",
      method: "BANK_TRANSFER",
      memo: null,
      idempotencyKey: input.idempotencyKey ?? `mock-${nextPaymentId}`,
      bodyJson: input.bodyJson ?? "",
    },
    plan,
  );
}

/** 손잡이 입금 거절 중 도매 `POST /payments`와 같은 코드를 내야 하는 것. 그 밖의 거절은 그냥 `Error`다 */
export class MockPaymentRejected extends Error {
  constructor(
    readonly code: "DUPLICATE_ORDER",
    message: string,
  ) {
    super(message);
  }
}

/** 이미 받은 배분 대상에 같은 주문이 있나. 도매 `POST /payments`와 소매 손잡이가 같은 검사를 탄다(loop-08e R1) */
function repeatsOrder(
  targets: readonly { order: MockOrder }[],
  orderId: number,
): boolean {
  return targets.some((t) => t.order.id === orderId);
}

/** 스펙 배분액 = 양의 int32. 문자열 "100", 0.5, 2^31은 전부 아니다 */
const INT32_MAX = 2_147_483_647;
function isPositiveInt32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= INT32_MAX
  );
}

/** 같은 Idempotency-Key 재전송 판정. null = 처음 보는 키 */
export type MockPaymentReplay =
  | { status: 200; data: WholesaleSchema<"PaymentCreatedResponse"> }
  | { status: 409 }
  | null;

/**
 * 같은 키 재전송 — 본문이 같으면 처음 응답(멱등), 다르면 409(스펙). 도매 `POST /payments`와 소매 손잡이가 같이 쓴다
 * (loop-08e R2). 손잡이가 키를 무시하면 재전송마다 입금이 쌓여 선수금이 두 배가 된다
 */
export function replayMockPayment(
  key: string,
  bodyJson: string,
): MockPaymentReplay {
  const seen = payments.find((p) => p.idempotencyKey === key);
  if (seen === undefined) return null;
  const first = firstResponses.get(seen.id);
  if (seen.bodyJson !== bodyJson || first === undefined) return { status: 409 };
  return { status: 200, data: first };
}

/** 배분 취소 결과. 응답 본문은 부르는 쪽이 자기 어휘로 만든다(도매 핸들러, 소매 손잡이) */
export type MockAllocationCancel =
  | { status: 200; data: WholesaleSchema<"AllocationCancelledResponse"> }
  | { status: 404 }
  | { status: 409 };

/**
 * 배분 취소 저장 경로 하나(스펙 `cancelAllocation`). 줄은 지우지 않고 `cancelledAt`만 찍는다. 원장은 안 바뀐다 —
 * 그 돈은 줄의 입금 남은 몫(선수금)으로 돌아가고 주문 미수가 다시 는다. 검사 순서 404 → 409.
 * `ownerRetailerId`가 있으면 그 소매처 배분만 찾는다 — 남의 배분은 없는 것과 같이 404이고 아무것도 안 바뀐다.
 * 도매 핸들러는 소유 검사가 없어 null을 넘긴다(소매 손잡이만 "나"를 넘긴다, loop-08e §5-2 3)
 */
function cancelAllocationLine(
  allocationId: number,
  ownerRetailerId: number | null,
): MockAllocationCancel {
  const line = allocations.find(
    (a) =>
      a.id === allocationId &&
      (ownerRetailerId === null || a.retailerId === ownerRetailerId),
  );
  if (line === undefined) return { status: 404 };
  if (line.cancelledAt !== null) return { status: 409 };
  const cancelledAt = new Date().toISOString();
  line.cancelledAt = cancelledAt;
  const order = mockOrders().find((o) => o.id === line.orderId);
  if (order) releaseMockAllocation(order, line.amount);
  return {
    status: 200,
    data: {
      allocationId: line.id,
      orderId: line.orderId,
      paymentId: line.paymentId,
      amount: line.amount,
      cancelledAt,
      prepaidRemaining: prepaidOf(line.retailerId),
    },
  };
}

/**
 * 시험 손잡이용 배분 취소(목 전용). 소매 채팅 목 `/__mock/chat/allocation-cancel`이 "나"의 배분만 취소한다
 * (loop-08e S1-3). 저장 경로는 도매 `POST /allocations/{id}/cancel`과 같다
 */
export function cancelMockAllocation(
  retailerId: number,
  allocationId: number,
): MockAllocationCancel {
  return cancelAllocationLine(allocationId, retailerId);
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

/** `lines` = 이 요청이 만든 배분 줄. 옛 입금에서 끌어온 줄도 들어간다(`paymentId`가 다르다) */
function paymentResponse(
  payment: MockPayment,
  lines: readonly MockAllocation[],
): WholesaleSchema<"PaymentCreatedResponse"> {
  const retailer = mockRetailer(payment.retailerId);
  // 이번 입금에서 안 쓴 돈. 옛 입금에서 끌어온 줄은 빼지 않는다(스펙)
  const fromThis = lines
    .filter((a) => a.paymentId === payment.id)
    .reduce((acc, a) => acc + a.amount, 0);
  return {
    id: payment.id,
    retailerId: payment.retailerId,
    retailerName: retailer?.name ?? "",
    amount: payment.amount,
    paidAt: payment.paidAt,
    paidBy: payment.paidBy,
    method: payment.method,
    memo: payment.memo as string,
    unallocatedAmount: payment.amount - fromThis,
    // 등록 후 거래처 선수금 전체(스펙: `prepaid = totalPaid − totalAllocated`). 이번 입금만이 아니다
    prepaidRemaining: prepaidOf(payment.retailerId),
    allocations: lines.map((a) => ({
      id: a.id,
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      amount: a.amount,
      createdAt: a.createdAt,
      paymentId: a.paymentId,
    })),
    ledgerBalance: balanceOf(payment.retailerId),
    createdAt: payment.createdAt,
  };
}

/** 소매처의 남은 선수금 = Σ 입금별 남은 몫. 취소된 배분 줄은 그 입금으로 돌아와 있다. 목은 입금 취소가 없다 */
function prepaidOf(retailerId: number): number {
  return payments
    .filter((p) => p.retailerId === retailerId)
    .reduce((acc, p) => acc + remainingOf(p), 0);
}

/**
 * 요약(`receivableSummary`)이 읽는 입금 모양. 배분 줄을 **돈이 나온 입금** 아래로 모으고 취소 줄은 뺀다 —
 * 그래야 요약의 선수금 식(입금액 − 그 입금의 배정 합)이 `prepaidOf`와 같은 값을 낸다
 */
function summaryPayments(): SummaryPayment[] {
  return payments.map((p) => ({
    retailerId: p.retailerId,
    amount: p.amount,
    allocations: allocations.filter(
      (a) => a.paymentId === p.id && a.cancelledAt === null,
    ),
  }));
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

  /**
   * 선수금 3카드(스펙 `prepaidSummary`). 이 핸들러가 없으면 스펙 뼈대가 0을 돌려줘 목 모드 정산 탭의
   * `선수금으로 정산`이 늘 잠긴다(loop-08f S1-6에서 발견). 목은 입금 취소가 없어 totalPaid = 입금 합,
   * totalAllocated = 취소 안 된 배분 줄 합, prepaid = `prepaidOf`(같은 식)
   */
  http.get(
    "*/api/wholesale/receivables/retailers/:retailerId/prepaid",
    ({ params }) => {
      const retailerId = Number(params.retailerId);
      if (!mockRetailer(retailerId))
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "거래 관계가 없는 소매처입니다.",
        );
      const totalPaid = payments
        .filter((p) => p.retailerId === retailerId)
        .reduce((acc, p) => acc + p.amount, 0);
      const totalAllocated = allocations
        .filter((a) => a.retailerId === retailerId && a.cancelledAt === null)
        .reduce((acc, a) => acc + a.amount, 0);
      const data: WholesaleSchema<"PrepaidSummaryResponse"> = {
        retailerId,
        totalPaid,
        totalAllocated,
        prepaid: prepaidOf(retailerId),
      };
      return HttpResponse.json({ data });
    },
  ),

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
    const replay = replayMockPayment(key, bodyJson);
    if (replay?.status === 200) return HttpResponse.json({ data: replay.data });
    if (replay?.status === 409)
      return fail(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "같은 키로 다른 입금을 보냈습니다.",
      );

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

    const requested = body.allocations ?? [];
    const targets: { order: MockOrder; amount: number }[] = [];
    for (const a of requested) {
      if (typeof a.amount !== "number" || a.amount <= 0)
        return fail(
          400,
          "VALIDATION_FAILED",
          "배분액은 1 이상이어야 합니다.",
          "allocations",
        );
      if (repeatsOrder(targets, a.orderId))
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
    // 상한 = 이번 입금액 + 그 소매처 남은 선수금(스펙). 넘으면 아무것도 저장하지 않는다
    const plan = planAllocations(body.retailerId, body.amount, targets);
    if (plan === null)
      return fail(
        409,
        "ALLOCATION_EXCEEDS_PAYMENT",
        "배분 합계가 입금액과 남은 선수금을 넘었습니다.",
      );
    // 미수 = 출고된 금액 − 배정액. 출고 안 된 주문은 미수 0이라 1원만 붙여도 여기서 막힌다
    for (const { order, amount } of targets)
      if (amount > mockOrderSettlement(order).outstandingAmount)
        return fail(
          409,
          "ALLOCATION_EXCEEDS_OUTSTANDING",
          `주문 ${order.orderNumber}의 미수(${mockOrderSettlement(order).outstandingAmount})를 넘었습니다.`,
        );

    const created = pushPayment(
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
      plan,
    );
    return HttpResponse.json({ data: created }, { status: 201 });
  }),

  /**
   * 선수금으로 정산(스펙 `createAllocation`, loop-08f §4-6). 새 입금 없이 그 소매처의 남은 선수금을 주문에 붙인다.
   * 오래된 입금부터(paidAt, 같으면 id) 꺼내고, 주문별 상한은 미수, 원장과 입금은 안 바뀐다.
   *
   * 검사 순서는 `POST /payments`와 같은 꼴이다(스펙은 오류 코드만 적었고 순서, 빈 배열, field는 목이 정한 계약
   * 결정이다, §5-4 2. G2 승인 뒤 BE에 전달):
   *   키 없음 400 → 같은 키(200 / 409) → 본문 형식 400(retailerId, allocations 배열·빈 배열, 줄 금액이 양의 int32 아님)
   *   → 소매처 404 → 줄 순서대로(같은 주문 400, 없는 주문 404, 남의 주문 400) → 확정 아님 409
   *   → 선수금 넘음 409 → 미수 넘음 409.
   * 선수금 넘음이 미수 넘음보다 먼저다 — 돈의 출처를 먼저 본다(`POST /payments`가 계획을 미수보다 먼저 보는 것과 같다)
   */
  http.post("*/api/wholesale/allocations", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key");
    if (!key)
      return fail(
        400,
        "VALIDATION_FAILED",
        "Idempotency-Key 헤더가 필요합니다.",
        "Idempotency-Key",
      );
    const bodyJson = await request.text();
    const body = JSON.parse(bodyJson) as Partial<
      Record<keyof WholesaleSchema<"AllocationCreateRequest">, unknown>
    >;

    const seen = allocationReplays.get(key);
    if (seen !== undefined)
      return seen.bodyJson === bodyJson
        ? HttpResponse.json({ data: seen.response })
        : fail(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "같은 키로 다른 정산을 보냈습니다.",
          );

    if (
      typeof body.retailerId !== "number" ||
      !Number.isInteger(body.retailerId)
    )
      return fail(
        400,
        "VALIDATION_FAILED",
        "소매처 id가 올바르지 않습니다.",
        "retailerId",
      );
    // 빈 배열은 할 일이 없어 받지 않는다(스키마에 minItems가 없다 — 계약 결정 1)
    if (!Array.isArray(body.allocations) || body.allocations.length === 0)
      return fail(
        400,
        "VALIDATION_FAILED",
        "정산할 주문이 없습니다.",
        "allocations",
      );
    const requested = body.allocations as {
      orderId?: unknown;
      amount?: unknown;
    }[];
    // 스펙 amount는 int32다. 원 단위 밑(0.5)이나 int32 밖이 저장되면 미수와 선수금이 소수로 남는다(08f R1)
    if (requested.some((a) => !isPositiveInt32(a.amount)))
      return fail(
        400,
        "VALIDATION_FAILED",
        "배분액은 1 이상의 정수여야 합니다.",
        "allocations",
      );
    const retailerId = body.retailerId;
    const retailer = mockRetailer(retailerId);
    if (!retailer)
      return fail(404, "RESOURCE_NOT_FOUND", "거래 이력이 없는 소매처입니다.");

    const targets: { order: MockOrder; amount: number }[] = [];
    for (const a of requested) {
      const orderId = a.orderId as number;
      if (repeatsOrder(targets, orderId))
        return fail(
          400,
          "DUPLICATE_ORDER",
          "같은 주문이 두 번 들어왔습니다.",
          "allocations",
        );
      const order = mockOrders().find((o) => o.id === orderId);
      if (!order)
        return fail(404, "RESOURCE_NOT_FOUND", "정산할 주문이 없습니다.");
      if (order.retailerId !== retailerId)
        return fail(
          400,
          "ORDER_RETAILER_MISMATCH",
          "다른 소매처의 주문입니다.",
          "allocations",
        );
      targets.push({ order, amount: a.amount as number });
    }
    for (const { order } of targets)
      if (order.status !== "CONFIRMED")
        return fail(
          409,
          "ORDER_NOT_CONFIRMED",
          "확정되지 않은 주문에는 정산할 수 없습니다.",
        );
    // 이번 입금 0 = 남은 선수금만으로 계획한다. 모자라면 아무것도 저장하지 않는다
    const plan = planAllocations(retailerId, 0, targets);
    if (plan === null)
      return fail(
        409,
        "ALLOCATION_EXCEEDS_PREPAID",
        "정산액이 남은 선수금을 넘었습니다.",
      );
    for (const { order, amount } of targets)
      if (amount > mockOrderSettlement(order).outstandingAmount)
        return fail(
          409,
          "ALLOCATION_EXCEEDS_OUTSTANDING",
          `주문 ${order.orderNumber}의 미수(${mockOrderSettlement(order).outstandingAmount})를 넘었습니다.`,
        );

    const lines = pushAllocationLines(
      retailerId,
      plan,
      null,
      new Date().toISOString(),
    );
    const response: WholesaleSchema<"AllocationCreatedResponse"> = {
      retailerId,
      retailerName: retailer.name,
      allocations: lines.map((a) => ({
        id: a.id,
        orderId: a.orderId,
        orderNumber: a.orderNumber,
        amount: a.amount,
        createdAt: a.createdAt,
        paymentId: a.paymentId,
      })),
      prepaidRemaining: prepaidOf(retailerId),
    };
    allocationReplays.set(key, { bodyJson, response });
    return HttpResponse.json({ data: response }, { status: 201 });
  }),

  /**
   * 배분 취소(스펙 `cancelAllocation`). 줄은 지우지 않고 `cancelledAt`만 찍는다. 원장은 안 바뀐다 — 그 돈은 줄의
   * 입금 남은 몫(선수금)으로 돌아가고 주문 미수가 다시 는다. 검사 순서 404 → 409
   */
  http.post(
    "*/api/wholesale/allocations/:allocationId/cancel",
    ({ params }) => {
      const result = cancelAllocationLine(Number(params.allocationId), null);
      if (result.status === 404)
        return fail(404, "RESOURCE_NOT_FOUND", "배분이 없습니다.");
      if (result.status === 409)
        return fail(409, "STATE_CONFLICT", "이미 취소된 배분입니다.");
      return HttpResponse.json({ data: result.data });
    },
  ),

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
      payments: summaryPayments(),
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

/**
 * 시험용 저장소 사진(loop-08f S1-3). 입금 수, 원장 줄 내용, 다음 입금 id처럼 HTTP로 다 볼 수 없는 값을 꺼낸다.
 * 선수금 정산이 입금과 원장을 안 건드리는지를 이 값의 전후 비교로 잰다. 앱은 부르지 않는다
 */
export function mockSettlementSnapshot() {
  return {
    paymentCount: payments.length,
    ledger: ledger.map((e) => ({ ...e })),
    allocationCount: allocations.length,
    nextPaymentId,
    nextAllocationId,
    nextLedgerId,
  };
}

/** 화면 검증 중 시드로 되돌릴 때. 앱은 부르지 않는다. 주문·출고 목도 같이 되돌려야 맞물린다 */
export function resetSettlementMock() {
  ledger = seedLedger();
  payments = [];
  allocations = [];
  firstResponses = new Map();
  allocationReplays = new Map();
  bankAccounts = seedBankAccounts();
  nextLedgerId = 10202;
  nextPaymentId = 4401;
  nextAllocationId = 7701;
  nextBankAccountId = 94;
}
