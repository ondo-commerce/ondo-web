import { ACTIVE_ORDER_STATUSES, ACTIVE_SETTLEMENT_STATUSES } from "./constants";
import type { Order, OrderLine, OrderStatus, SettlementStatus } from "./types";

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

/* ------------------------------------------------------------------------
 * 라인 표의 파생값. Figma 3프레임의 숫자를 역산해 확정한 공식이다(01-pm.md §1.4).
 * `n` = `이번 출고` 입력값이고, 입력이 없으면 n = 0이라 before와 after가 같아진다.
 * ---------------------------------------------------------------------- */

/**
 * 가용재고 = 현재고 − 주문처리중.
 *
 * ⚠️ **서버 계약 미확인 — glossary 미등재.** glossary §4.5의 `판매가능`은
 * `현재고 − 주문처리중 − 미송대기`로 다른 값이고, 그건 "마켓에 노출되는 값"이다.
 * 주문 라인 표의 이 열은 Figma 3프레임의 숫자가 이 정의로만 맞아떨어져서 이렇게 뒀다
 * (확정 프레임 2행: 가용 14 → 10, 이번 출고 4). 미송을 여기서 한 번 빼고 괄호에 또
 * 보여주면 같은 수량을 두 번 차감해 보여주는 화면이 된다.
 *
 * **`판매가능`과 이름을 섞지 않는다.** 서버 계약이 확인되면 그때 glossary에 올린다.
 */
export function assignableQty(line: OrderLine): number {
  return line.stockOnHand - line.reservedQty;
}

/** 미할당 = 주문수량 − 출고진행. **미송을 포함한 값이다**(01-pm.md §1.4) */
export function unallocatedQty(line: OrderLine): number {
  return line.qty - line.allocatedQty;
}

/** 출고진행: `alloc → alloc + n` */
export function allocatedAfter(line: OrderLine, n: number): number {
  return line.allocatedQty + n;
}

/** 미할당: `qty − alloc → qty − alloc − n` */
export function unallocatedAfter(line: OrderLine, n: number): number {
  return unallocatedQty(line) - n;
}

/** 가용재고: `avail → avail − n` */
export function assignableAfter(line: OrderLine, n: number): number {
  return assignableQty(line) - n;
}

/** 미송: `bo → bo − min(n, bo)`. 미송이 없는 라인에서는 그대로 0이다 */
export function backorderAfter(line: OrderLine, n: number): number {
  return line.backorderQty - Math.min(n, line.backorderQty);
}

/** 전량 할당된 라인. 입력칸 대신 완료 ✓가 들어간다 */
export function isLineAllocated(line: OrderLine): boolean {
  return unallocatedQty(line) === 0;
}

/** 가용재고가 0이라 지금은 아무것도 못 빼는 라인. 입력칸이 비활성이 된다 */
export function isLineOutOfStock(line: OrderLine): boolean {
  return assignableQty(line) <= 0;
}

/**
 * 수량을 입력할 수 있는 국면인가.
 * 취소된 주문과 이미 다 나간 주문은 읽기 전용이다 — 되돌릴 값이 없다.
 */
export function isEditablePhase(status: OrderStatus): boolean {
  return (
    status === "PLACED" ||
    status === "CONFIRMED" ||
    status === "PARTIALLY_SHIPPED"
  );
}

/**
 * 숫자 입력칸의 문자열 → 수량.
 * 빈칸과 0을 구분해야 해서 빈칸은 null이다 — "안 적었다"와 "0을 적었다"는 다르다
 * (재고 탭 derive.parseNumberInput과 같은 규칙).
 */
export function parseNumberInput(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return Number(digits);
}

/** 입력 맵(라인 id → 입력 문자열)에서 그 라인의 수량을 꺼낸다. 안 적었으면 0 */
export function shipQty(
  inputs: Readonly<Record<string, string>>,
  line: OrderLine,
): number {
  return parseNumberInput(inputs[line.id] ?? "") ?? 0;
}
