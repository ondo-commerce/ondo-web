import type { LedgerQuery } from "./queries";

/**
 * 정산 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할
 * 대상을 여기서 가리킨다.
 *
 * 계층:
 *   `all` ⊃ `retailers()`                       ← 소매처별 미수(아코디언 머리)
 *         ⊃ `orders(retailerId)`                ← 확정 주문(정산 상태 표 + 배분 표가 **같은 키**)
 *         ⊃ `ledgers(retailerId)` ⊃ `ledger(q)` ← 원장(구분 필터별)
 *         ⊃ `bankAccounts()`
 *
 * 입금(POST /payments)은 그 소매처의 미수·주문 미수·원장을 전부 바꾸므로 `retailers()`·`orders(id)`·`ledgers(id)`를
 * 비운다. 판매 줄은 출고 탭이 만드는데 feature끼리 키를 못 비우니 탭 진입 때 `all`을 한 번 비운다(`useInvalidateOnMount`).
 */
export const settlementKeys = {
  all: ["settlement"] as const,
  retailers: () => [...settlementKeys.all, "retailers"] as const,
  orders: (retailerId: number) =>
    [...settlementKeys.all, "orders", retailerId] as const,
  ledgers: (retailerId: number) =>
    [...settlementKeys.all, "ledger", retailerId] as const,
  ledger: (query: LedgerQuery) =>
    [...settlementKeys.ledgers(query.retailerId), query.entryType] as const,
  bankAccounts: () => [...settlementKeys.all, "bank-accounts"] as const,
};
