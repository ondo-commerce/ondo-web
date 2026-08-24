import type { LedgerEntry, SettlementOrder } from "./types";

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
