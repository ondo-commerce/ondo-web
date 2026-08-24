import type {
  LedgerEntry,
  LedgerRow,
  SettlementOrder,
  SettlementStatus,
} from "./types";
import { formatNumber } from "@/shared/lib/format";

/*
 * 정산 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 숫자가 아코디언 tail · 정산 상태 표 · 미수원장 · 배분 표 네 곳에서 다시 쓰인다.
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다(Figma 더미가 실제로 그랬다).
 */

/** 그 거래관계의 주문만. 화면은 항상 거래처 하나를 기준으로 본다(§1 정산 단위) */
export function relationOrders(
  orders: readonly SettlementOrder[],
  relationId: string,
): SettlementOrder[] {
  return orders.filter((o) => o.relationId === relationId);
}

/** 그 거래관계의 원장 엔트리만 */
export function relationLedger(
  entries: readonly LedgerEntry[],
  relationId: string,
): LedgerEntry[] {
  return entries.filter((e) => e.relationId === relationId);
}

/** 주문 한 건의 미수 잔액 = 주문 금액 − 배정액. 정산 완료면 0이다 */
export function orderReceivable(order: SettlementOrder): number {
  return order.totalAmount - order.allocatedAmount;
}

/**
 * 거래처 계정 잔액 = 원장 엔트리 금액의 합.
 * **입금 +, 판매 −** 이므로 미수가 남아 있으면 음수다(`types.ts` LedgerEntry.amount 주석).
 */
export function ledgerBalance(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * 아코디언 tail에 쓰는 미수 잔액 = `max(0, −계정 잔액)`.
 *
 * 원장은 계정 잔액 관점(음수)이고 tail은 미수 관점(양수)이라 부호를 뒤집는다.
 * 선입금으로 잔액이 +가 되면 "미수 −50,000원"이 되어야 하는데 그건 미수가 아니라
 * 예치금이므로 0으로 눕힌다 — 미배정 잔액 화면은 이번 범위 밖이다(01-pm.md §5 Q7).
 */
export function outstandingReceivable(entries: readonly LedgerEntry[]): number {
  return Math.max(0, -ledgerBalance(entries));
}

/**
 * 주문 하나의 정산 상태. **저장값이 아니라 배정액에서 매번 계산한다**
 * (`settlement_data_model.md` §3.2). 서버가 캐시(`settlement_status`)로 내려주더라도
 * 화면은 이 함수를 믿는다 — 입금 직후 캐시와 배정액이 어긋나는 순간이 실제로 있다.
 */
export function settlementStatus(order: SettlementOrder): SettlementStatus {
  if (order.allocatedAmount <= 0) return "unpaid";
  if (order.allocatedAmount < order.totalAmount) return "partial";
  return "settled";
}

/**
 * `2025-08-12T09:14` → `8월 12일 09:14`.
 * **Date로 파싱하지 않고 문자열을 자른다** — 저 문자열에는 시간대가 없어서
 * `new Date()`에 넣으면 서버와 브라우저가 다른 날짜로 읽어 하이드레이션이 깨진다.
 */
export function formatDateTime(value: string): string {
  const month = Number(value.slice(5, 7));
  const day = value.slice(8, 10);
  const time = value.slice(11, 16);
  return `${month}월 ${day}일 ${time}`;
}

/**
 * 원장 표의 행 = 엔트리를 **날짜 오름차순으로 정렬한 뒤 위에서부터 누적**한 잔액.
 *
 * `balanceAfter`를 fixtures에 적어 두지 않는 이유: 입금 한 건만 끼어들어도
 * 그 아래 모든 줄의 잔액이 틀어지기 때문이다. 원장은 append-only라 순서가 곧 계산이다.
 *
 * ⚠️ 필터를 걸기 **전에** 이 함수를 부른다. 걸러진 줄만 누적하면 잔액이 거짓이 된다.
 */
export function ledgerRows(entries: readonly LedgerEntry[]): LedgerRow[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  return sorted.map((entry) => {
    balance += entry.amount;
    return { ...entry, balanceAfter: balance };
  });
}

/**
 * 부호를 붙인 금액 표시(`+200,000` / `-350,000`).
 * 배지 색을 늘리지 않기로 했으므로(게이트 Q2) **이 부호가 입금과 판매를 가르는 두 번째 단서**다.
 * 마진율의 `formatRate`와 같은 규칙으로 양수에만 `+`를 붙인다.
 */
export function formatSignedAmount(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

/**
 * 금액 입력칸의 문자열 → 금액.
 * **빈칸과 0을 구분해야 해서 빈칸은 null이다** — "아직 안 적었다"와 "0원을 적었다"는
 * 다른 상태고, 버튼 활성 조건이 둘을 갈라 본다.
 *
 * 재고 탭 `derive.ts`에 같은 취지의 함수가 있지만 **복사해 왔다** —
 * feature 경계를 넘어 import 하지 않는다(ESLint가 막는다).
 */
export function parseNumberInput(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return Number(digits);
}
