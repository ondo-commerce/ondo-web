import { isApiError } from "@ondo/api";
import { BANK_ACCOUNT_ERROR_TEXT, DEPOSIT_ERROR_TEXT } from "./constants";
import { exceedsNumericMax } from "@/shared/lib/numericInput";
import type {
  BankAccount,
  BankAccountCreateRequest,
  BankAccountDraft,
  BankAccountUpdateRequest,
  BankAccountView,
  DepositDraft,
  DepositMode,
  LedgerRowView,
  LedgerView,
  OrderRowView,
  OrderStatus,
  PaymentAllocationRequest,
  PaymentCreateRequest,
  ReceivableLedgerPage,
  ReceivableRetailer,
  RetailerRowView,
  SettlementNotice,
  SettlementOrder,
  SettlementStatus,
} from "./types";
import { describeError } from "@/shared/api/describeError";
import { formatNumber } from "@/shared/lib/format";

/*
 * 정산 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 숫자가 거래처 행 · 정산 상태 표 · 미수원장 · 배분 표 네 곳에서 다시 쓰인다.
 *
 * wire → 뷰 변환도 여기다. 화면은 wire 모양을 모른다.
 *
 * 예전 fixtures 시절의 누적·파생 함수(`ledgerRows`·`settlementStatus`·`orderReceivable`·`applyAllocations`)는
 * **없다** — 잔액·정산 상태·미수는 서버값이다. 화면이 다시 계산하면 서버와 갈리는 순간이 생긴다.
 *
 * ⚠️ 날짜는 서버 ISO(date-time)를 **KST 고정** Intl로만 그린다. 렌더 중에 `new Date()`(지금)를 읽는
 *    함수는 없다 — 서버(UTC)와 브라우저의 값이 갈리면 하이드레이션이 깨진다.
 */

/* ------------------------------------------------------------------------
 * 날짜
 * ------------------------------------------------------------------------ */

const KST = "Asia/Seoul";

/** `8월 12일 11:42` */
const LABEL_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2026-09-07 15:30` — 입력칸 형식. `en-CA`가 `YYYY-MM-DD`를 준다 */
const INPUT_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2025.01.15` */
const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parts(format: Intl.DateTimeFormat, iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const list = format.formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) =>
    list.find((p) => p.type === type)?.value ?? "";
}

/** 표의 일시 열 `8월 12일 11:42`(KST). 못 읽는 값은 `-` */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return "-";
  const part = parts(LABEL_FORMAT, iso);
  if (!part) return "-";
  return `${part("month")}월 ${part("day")}일 ${part("hour")}:${part("minute")}`;
}

/** 계좌 등록일 `2025.01.15`(KST) */
export function formatDate(iso: string): string {
  const part = parts(DATE_FORMAT, iso);
  if (!part) return "-";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

/**
 * 입금 일시 텍스트 → 서버 `paidAt`(ISO, KST 고정 오프셋).
 * 받는 형식: `2025-08-14 15:30` · `2025-08-14T15:30` · `2025-08-14`(자정). 빈칸은 **버튼을 누른 시각**(`now`).
 * 형식이 안 맞으면 `null` — 보내기 전에 칸 오류로 막는다. 서버도 `VALIDATION_FAILED`·`PAID_AT_IN_FUTURE`로 뒤를 받친다.
 *
 * `now`는 인자로 받는다 — 렌더가 아니라 버튼을 누른 순간에만 `new Date()`를 읽는다.
 */
export function parsePaidAt(raw: string, now: Date): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return now.toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(
    trimmed,
  );
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00"] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // `2025-02-31` 같은 값은 Date가 3월로 넘겨 읽는다. 되돌려 비교해 걸러낸다
  const back = parts(INPUT_FORMAT, iso);
  if (!back) return null;
  const hour = back("hour") === "24" ? "00" : back("hour");
  if (
    back("year") !== y ||
    back("month") !== mo ||
    back("day") !== d ||
    hour !== h ||
    back("minute") !== mi
  ) {
    return null;
  }
  return iso;
}

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/**
 * 거래처 행의 미수 잔액 = `max(0, −ledgerBalance)`.
 *
 * 서버 `ledgerBalance`는 계정 잔액 관점(음수 = 소매처 채무, 양수 = 선수금)이고 화면 열은 미수 관점(양수)이라
 * 부호를 뒤집는다. 선수금으로 잔액이 +가 되면 "미수 −50,000원"이 되어야 하는데 그건 미수가 아니라
 * 예치금이므로 0으로 눕힌다 — 선수금 칸은 화면에 없다(#138, 04-wire §3).
 */
export function outstandingOf(ledgerBalance: number): number {
  return Math.max(0, -ledgerBalance);
}

export function toRetailerRow(row: ReceivableRetailer): RetailerRowView {
  return {
    retailer: {
      id: row.retailerId,
      name: row.retailerName,
      code: row.retailerCode ?? "",
    },
    orderCount: row.orderCount,
    receivable: outstandingOf(row.ledgerBalance),
  };
}

/** `RT-001` 코드가 비면(시드) `-`. 거래처 라벨은 `봄봄상회 · RT-001` 또는 이름만 */
export function retailerLabel(name: string, code: string): string {
  return code === "" ? name : `${name} · ${code}`;
}

/** 출고분이 있는 주문인가. 응답에 출고 금액이 없어 이행 상태로 근사한다 — 부분이라도 나갔으면 미수가 있다 */
export function hasShipped(status: OrderStatus): boolean {
  return status === "PARTIALLY_SHIPPED" || status === "SHIPPED";
}

/**
 * 주문 한 줄. **미수는 출고분 기준 한 정의**다 — 거래처 행(원장 잔액, 출고 확정이 남기는 SALE 줄)과 같은 기준이라
 * 표의 미수 합이 행의 미수와 같아야 한다(선수금이 없을 때).
 *
 * 출고 전 주문은 미수 0 · `UNSHIPPED`(미출고)로 눕히고 배분 표(`allocationTargets`)에도 안 올린다.
 * 서버가 그 주문에 `outstandingAmount`(주문 금액 기준)를 내려도 쓰지 않는다 — 원장에 없는 돈이라 배분하면
 * 행 `0원`·표 `부분 정산`·원장 `+선수금`이 동시에 서는 화면이 된다(F1).
 * 이미 배정이 붙은 출고 전 주문(서버가 허용했을 때)은 상태만 서버값을 남기고 미수는 역시 0이다.
 */
export function toOrderView(order: SettlementOrder): OrderRowView {
  const shipped = hasShipped(order.status.key);
  return {
    id: order.id,
    orderNumber: String(order.orderNumber),
    orderedAt: formatDateTime(order.orderedAt),
    orderedAtIso: order.orderedAt,
    orderAmount: order.orderAmount,
    status: order.status.key,
    statusLabel: order.status.label,
    settlementStatus:
      shipped || order.settlementStatus !== "UNPAID"
        ? order.settlementStatus
        : "UNSHIPPED",
    outstanding: shipped ? order.outstandingAmount : 0,
  };
}

/** 표에 보이는 주문들의 미수 합. 거래처 행(원장)과 같은 수여야 한다 — 다르면 정의가 갈린 것 */
export function outstandingTotal(orders: readonly OrderRowView[]): number {
  return orders.reduce((sum, o) => sum + o.outstanding, 0);
}

/**
 * 원장 페이지 → 표. 서버는 최신순으로 내리지만(스텁 example) 화면은 **오래된 순**(위에서 아래로 잔액이 흐르는
 * 사양)이라 페이지 안에서 뒤집는다. 잔액은 줄마다 서버가 확정한 값이라 순서를 바꿔도 틀리지 않는다.
 */
export function toLedgerView(page: ReceivableLedgerPage): LedgerView {
  const rows: LedgerRowView[] = [...page.data]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id)
    .map((e) => ({
      id: e.id,
      date: formatDateTime(e.occurredAt),
      entryType: e.entryType,
      amount: e.balanceChange,
      balanceAfter: e.balanceAfter,
    }));
  return {
    rows,
    balance: page.meta.ledgerBalance,
    totalElements: page.meta.totalElements,
    totalPages: page.meta.totalPages,
  };
}

/** 입금 일시 칸에 채울 `2026-09-07 15:30`(KST). 빈칸으로 보낸 뒤 재전송 때 시각이 바뀌지 않게 첫 제출에 굳힌다 */
export function formatInputDateTime(date: Date): string {
  const part = parts(INPUT_FORMAT, date.toISOString());
  if (!part) return "";
  const hour = part("hour") === "24" ? "00" : part("hour");
  return `${part("year")}-${part("month")}-${part("day")} ${hour}:${part("minute")}`;
}

export function toBankAccountView(account: BankAccount): BankAccountView {
  return {
    id: account.id,
    bankName: account.bankName,
    accountNo: account.accountNo,
    accountHolder: account.accountHolder,
    // 스펙에 nullable이 없어 타입은 string이지만 실제로 null이 온다
    memo: account.memo ?? "",
    isPrimary: account.isPrimary,
    createdAt: formatDate(account.createdAt),
  };
}

/** 수정 폼의 초기값 = 지금 값 */
export function toBankAccountDraft(account: BankAccountView): BankAccountDraft {
  return {
    bankName: account.bankName,
    accountNo: account.accountNo,
    accountHolder: account.accountHolder,
    memo: account.memo,
    isPrimary: account.isPrimary,
  };
}

/* ------------------------------------------------------------------------
 * 목록 안 필터
 * ------------------------------------------------------------------------ */

/**
 * 거래처 검색 — **화면 안에서** 이름·코드로 거른다. 서버에 `q`가 없다(스펙: "소매처 상호는 도매 DB 밖, 미수엔
 * 품명이 없다"). 그래서 placeholder도 `거래처 검색`이다 — 품명은 약속하지 않는다(04-wire §3, #196).
 */
export function filterRetailers(
  rows: readonly RetailerRowView[],
  keyword: string,
): RetailerRowView[] {
  const lower = keyword.trim().toLowerCase();
  if (lower === "") return [...rows];
  return rows.filter(
    (row) =>
      row.retailer.name.toLowerCase().includes(lower) ||
      row.retailer.code.toLowerCase().includes(lower),
  );
}

/** 정산 상태 필터 — 받은 목록 안에서. 배분 표가 같은 응답을 봐야 해서 서버 파라미터를 안 쓴다(④·②) */
export function filterOrders(
  orders: readonly OrderRowView[],
  status: SettlementStatus | null,
): OrderRowView[] {
  return status === null
    ? [...orders]
    : orders.filter((o) => o.settlementStatus === status);
}

/* ------------------------------------------------------------------------
 * 입금 폼
 * ------------------------------------------------------------------------ */

/**
 * 금액 칸의 문자열 → 자릿수만. 화면엔 콤마가 붙은 값(`37,500`)이 보이므로 `onChange`가 주는 문자열에서
 * 숫자만 남기고 앞의 0을 뗀다. 숫자 아닌 키는 `NumericInput`이 칸에 들어오기 전에 막는다.
 * **상한에서 자르지 않는다** — 14자리를 조용히 `999,999,999`로 바꾸면 사장은 그런 줄 모른다
 * (wire-settlement F3). 넘긴 값은 그대로 두고 `exceedsNumericMax`가 칸을 빨갛게 만들고 버튼을 잠근다.
 */
export function toAmountDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * 금액 입력칸의 문자열 → 금액. **빈칸과 0을 구분해야 해서 빈칸은 null이다** — "아직 안 적었다"와
 * "0원을 적었다"는 다른 상태고, 버튼 활성 조건이 둘을 갈라 본다.
 *
 * 재고 탭 `derive.ts`에 같은 취지의 함수가 있지만 **복사해 왔다** — feature 경계를 넘어 import 하지 않는다.
 */
export function parseNumberInput(raw: string): number | null {
  const digits = toAmountDigits(raw);
  if (digits === "") return null;
  return Number(digits);
}

/**
 * 입금액 칸에 보일 문자열. 상한 안이면 콤마를 붙이고, 넘겼으면 친 자릿수 그대로 — 25자리를 `Number`로
 * 바꿔 콤마를 붙이면 `1,234,567,890,123,456,800,000,000` 같은 다른 숫자가 보인다.
 */
export function formatAmountInput(amountRaw: string): string {
  if (amountRaw === "") return "";
  if (exceedsNumericMax(amountRaw)) return amountRaw;
  return formatNumber(Number(amountRaw));
}

/**
 * 배분 표에 올릴 주문 = **출고분의 미수가 남은 주문만**, 주문 일시 오래된 순.
 *
 * 정산 완료된 주문과 **출고 전 주문**(미수 0)을 빼는 이유: 붙일 돈이 없는 줄이라 입력칸이 있어 봐야 쓸 수 없고,
 * 출고 전 주문에 붙이면 원장에 없는 미수를 갚는 꼴이라 서버도 `ALLOCATION_EXCEEDS_OUTSTANDING`으로 거절한다.
 * 정렬이 FIFO인 이유: `settlement_data_model.md` §2.6의 `FIFO_AUTO`(오래된 미수부터)다.
 */
export function allocationTargets(
  orders: readonly OrderRowView[],
): OrderRowView[] {
  return orders
    .filter((o) => o.outstanding > 0)
    .sort((a, b) => a.orderedAtIso.localeCompare(b.orderedAtIso));
}

/**
 * 자동 배분(FIFO) — 위 행부터 미수 전액을 채우고 남은 금액이 그 다음 행에 들어간다.
 * 입금액이 미수 총합보다 크면 남는 돈은 어디에도 붙지 않는다(미배정 = 선수금).
 */
export function autoAllocate(
  targets: readonly OrderRowView[],
  amount: number,
): Record<number, number> {
  let left = Math.max(0, amount);
  const result: Record<number, number> = {};
  for (const order of targets) {
    const take = Math.min(order.outstanding, left);
    result[order.id] = take;
    left -= take;
  }
  return result;
}

/**
 * 한 행의 배분액을 **그 행의 미수 안, 그리고 남은 입금액 안**으로 가둔다(⑤).
 * 미수보다 많이 붙이면 서버가 409로 거절하고, 합계가 입금액을 넘으면 `ALLOCATION_EXCEEDS_PAYMENT`다 —
 * 둘 다 칸에서 먼저 막는다.
 */
export function clampAllocation(
  value: number,
  outstanding: number,
  budget: number,
): number {
  return Math.max(0, Math.min(value, outstanding, budget));
}

/** 배분 합계. 이 값이 입금액과 같아야 `입금 및 정산`을 누를 수 있다 */
export function allocationTotal(values: Record<number, number>): number {
  return Object.values(values).reduce((sum, v) => sum + v, 0);
}

/**
 * 표에 보일 배분값 = 사람이 고친 값이 있으면 그것, 없으면 자동 배분. **같은 규칙으로 요청을 만든다** —
 * 표와 요청이 다른 값을 보면 안 된다.
 */
export function resolveAllocations(
  targets: readonly OrderRowView[],
  edited: Readonly<Record<number, number>>,
  amount: number | null,
): Record<number, number> {
  const auto = autoAllocate(targets, amount ?? 0);
  return Object.fromEntries(
    targets.map((order) => [order.id, edited[order.id] ?? auto[order.id] ?? 0]),
  );
}

/** 배분 표 값 → 요청 `allocations[]`. 0원 행은 보내지 않는다(서버: `amount > 0`) */
export function toAllocationRequests(
  values: Readonly<Record<number, number>>,
): PaymentAllocationRequest[] {
  return Object.entries(values)
    .filter(([, amount]) => amount > 0)
    .map(([orderId, amount]) => ({ orderId: Number(orderId), amount }));
}

/**
 * 폼 → `POST /payments` 본문. `paymentOnly`는 `allocations: []`(스펙: 비면 선수금).
 * `paidAt`은 부르는 쪽이 `parsePaidAt`으로 먼저 검증한 값을 준다.
 */
export function toPaymentRequest(
  retailerId: number,
  draft: DepositDraft,
  amount: number,
  paidAt: string,
  mode: DepositMode,
  allocations: Readonly<Record<number, number>>,
): PaymentCreateRequest {
  const memo = draft.memo.trim();
  return {
    retailerId,
    amount,
    paidAt,
    paidBy: draft.payerType,
    method: draft.method,
    // 스펙에 nullable이 없어 타입은 string이지만 비면 안 보낸다
    ...(memo === "" ? {} : { memo }),
    allocations: mode === "settle" ? toAllocationRequests(allocations) : [],
  } as PaymentCreateRequest;
}

/** 새 폼. `idempotencyKey`는 부르는 쪽이 만든다(`crypto.randomUUID`, 렌더 밖) */
export function emptyDepositDraft(idempotencyKey: string): DepositDraft {
  return {
    amountRaw: "",
    receivedAt: "",
    payerType: "RETAILER",
    method: "CASH",
    memo: "",
    editedAllocations: {},
    idempotencyKey,
  };
}

/* ------------------------------------------------------------------------
 * 계좌 폼
 * ------------------------------------------------------------------------ */

export function toBankAccountCreateRequest(
  draft: BankAccountDraft,
): BankAccountCreateRequest {
  const memo = draft.memo.trim();
  return {
    bankName: draft.bankName.trim(),
    accountNo: draft.accountNo.trim(),
    accountHolder: draft.accountHolder.trim(),
    // 스펙에 nullable이 없어 타입은 string이지만 비면 안 보낸다
    ...(memo === "" ? {} : { memo }),
    isPrimary: draft.isPrimary,
  } as BankAccountCreateRequest;
}

/**
 * 수정은 **바뀐 칸만** 보낸다(스펙: "보낸 필드만 바뀐다"). `memo`는 비우면 `null`로 지운다(스펙).
 * 주계좌를 끄는 `isPrimary: false`는 보내지 않는다 — 서버가 `PRIMARY_ACCOUNT_CANNOT_BE_UNSET`으로 거절한다.
 * 아무것도 안 바뀌었으면 `null`(요청을 안 보낸다).
 */
export function toBankAccountUpdateRequest(
  draft: BankAccountDraft,
  original: BankAccountView,
): BankAccountUpdateRequest | null {
  const patch: Partial<Record<keyof BankAccountUpdateRequest, unknown>> = {};
  const bankName = draft.bankName.trim();
  const accountNo = draft.accountNo.trim();
  const accountHolder = draft.accountHolder.trim();
  const memo = draft.memo.trim();
  if (bankName !== original.bankName) patch.bankName = bankName;
  if (accountNo !== original.accountNo) patch.accountNo = accountNo;
  if (accountHolder !== original.accountHolder)
    patch.accountHolder = accountHolder;
  if (memo !== original.memo) patch.memo = memo === "" ? null : memo;
  if (draft.isPrimary && !original.isPrimary) patch.isPrimary = true;
  return Object.keys(patch).length === 0
    ? null
    : (patch as BankAccountUpdateRequest);
}

/** 계좌 폼의 필수 칸이 비었는가. 저장 버튼 조건 */
export function canSaveBankAccount(draft: BankAccountDraft): boolean {
  return (
    draft.bankName.trim() !== "" &&
    draft.accountNo.trim() !== "" &&
    draft.accountHolder.trim() !== ""
  );
}

/* ------------------------------------------------------------------------
 * 실패·결과 문구
 * ------------------------------------------------------------------------ */

/** 입금 거절 문구. 알려진 코드는 우리 문구, 나머지는 `describeError`의 종류별 제목 */
export function depositErrorText(error: unknown): string {
  if (isApiError(error)) {
    const known = DEPOSIT_ERROR_TEXT[error.code];
    if (known !== undefined) return known;
  }
  return describeError(error).title;
}

export function bankAccountErrorText(error: unknown): string {
  if (isApiError(error)) {
    const known = BANK_ACCOUNT_ERROR_TEXT[error.code];
    if (known !== undefined) return known;
  }
  return describeError(error).title;
}

/**
 * 서버 상태와 어긋나서 거절된 것인가(409·404). 이때는 화면이 든 값이 낡은 것이라
 * 다시 불러와야 한다 — 문구만 보이고 길이 없으면 같은 버튼을 다시 눌러 같은 답을 본다(wire-order F3).
 */
export function isStaleRejection(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

/** 입금 직후 문구. 재조회 실패면 옛 숫자임을 먼저 말한다(⑦) */
export function noticeText(notice: SettlementNotice): string {
  const amount = `${formatNumber(notice.amount)}원`;
  const tail =
    notice.unallocated > 0
      ? ` (미배정 ${formatNumber(notice.unallocated)}원)`
      : "";
  return notice.refreshed
    ? `${notice.retailerName}에 입금 ${amount} 등록했어요${tail} — 미수원장에서 확인하세요`
    : `${notice.retailerName}에 입금 ${amount}은 됐지만 목록을 새로 못 불러왔어요${tail}`;
}
