import { ACTIVE_ORDER_STATUSES, ACTIVE_SETTLEMENT_STATUSES } from "./constants";
import type { Order, OrderStatus, SettlementStatus } from "./types";

/*
 * 주문 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 공식이 목록 행·우측 카드·라인 표·확인 다이얼로그에서 쓰이는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다(재고 탭 derive.ts와 같은 이유).
 */

/** 주문 금액 = 라인 금액 합. 카드의 `주문 금액`은 반드시 이 값이다(Figma 목업은 안 맞는다) */
export function orderAmount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.lineAmount, 0);
}

/** 주문 수량 = 라인 주문수량 합 */
export function orderQty(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.qty, 0);
}

/**
 * 목록 `상품명` 셀 — `첫 라인 상품명 (색상) 외 N건`.
 * 라인이 1개면 `외 N건`이 붙지 않는다.
 */
export function orderProductSummary(order: Order): string {
  const first = order.lines[0];
  if (!first) return "-";
  const head = `${first.productName} (${first.color})`;
  const rest = order.lines.length - 1;
  return rest > 0 ? `${head} 외 ${rest}건` : head;
}

/**
 * 필터 칩의 건수.
 * **검색어·선택과 무관하게 전체 목록 기준이다** — 칩을 눌러 좁혔는데 다른 칩 숫자까지
 * 같이 줄면 "지금 안 보이는 게 몇 건인지"를 읽을 수 없다.
 */
export function countByStatus(
  orders: readonly Order[],
  status: OrderStatus,
): number {
  return orders.filter((o) => o.status === status).length;
}

/** 목록 검색 — 주문번호·거래처·상품명이 걸린다(01-pm.md 게이트 결정 Q3) */
export function matchesQuery(order: Order, keyword: string): boolean {
  if (keyword === "") return true;
  const lower = keyword.toLowerCase();
  return (
    order.id.toLowerCase().includes(lower) ||
    order.customerName.toLowerCase().includes(lower) ||
    order.lines.some((line) => line.productName.toLowerCase().includes(lower))
  );
}

/**
 * 배지 색. **파랑·회색 2색뿐이다** — 상태가 5종이어도 색을 늘리지 않는다.
 * 목록 행과 우측 카드가 같은 규칙을 쓰도록 여기 한 곳에서만 정한다.
 */
export function orderStatusTone(status: OrderStatus): "active" | "done" {
  return ACTIVE_ORDER_STATUSES.includes(status) ? "active" : "done";
}

/** 정산 배지도 같은 2색 규칙 — 받을 돈이 남았으면 파랑 */
export function settlementStatusTone(
  status: SettlementStatus,
): "active" | "done" {
  return ACTIVE_SETTLEMENT_STATUSES.includes(status) ? "active" : "done";
}
