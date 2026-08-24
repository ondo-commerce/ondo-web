import { ACTIVE_ORDER_STATUSES, ACTIVE_SETTLEMENT_STATUSES } from "./constants";
import type {
  Order,
  OrderLine,
  OrderStatus,
  PackingBatchLine,
  SettlementStatus,
} from "./types";

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

/** 입력 맵 전체 합계. 0이면 확정해도 포장 회차가 생기지 않는다 */
export function totalShipQty(
  order: Order,
  inputs: Readonly<Record<string, string>>,
): number {
  return order.lines.reduce((sum, line) => sum + shipQty(inputs, line), 0);
}

/* ------------------------------------------------------------------------
 * 상태를 바꾸는 계산. 전부 순수 함수다 — 새 주문 객체를 돌려주고 컴포넌트가
 * 수량을 직접 만지지 않는다. 서버가 붙으면 이 함수들이 요청 본문을 만드는 자리가 된다.
 * ---------------------------------------------------------------------- */

/**
 * `이번 출고` 입력 상한 = `min(미할당, 가용재고)`.
 * 둘 중 하나라도 넘기면 `qty = shipped + 포장대기 + backorder` 항등식이 깨진다
 * (`settlement_data_model.md` §2.3).
 */
export function shipCap(line: OrderLine): number {
  return Math.max(0, Math.min(unallocatedQty(line), assignableQty(line)));
}

/** 입력칸 문자열을 상한으로 자른다. 빈칸은 빈칸으로 둔다(0과 구분) */
export function clampShipInput(line: OrderLine, raw: string): string {
  const parsed = parseNumberInput(raw);
  if (parsed === null) return "";
  return String(Math.min(parsed, shipCap(line)));
}

/** 포장 대기열 줄 표기 — `상품명 (색상 - 사이즈)`. SKU 코드가 아니다(Figma 실측) */
export function packingLabel(line: OrderLine): string {
  return `${line.productName} (${line.color} - ${line.size})`;
}

/** 확정 다이얼로그에 띄울 미송 예고 */
export interface BackorderPreview {
  /** 미송이 잡히는 SKU 수 */
  skuCount: number;
  /** 미송 합계(장) */
  totalQty: number;
}

/**
 * 지금 입력 상태로 확정하면 미송이 얼마나 잡히는가.
 * **입력하지 않은 잔량은 전부 미송이 된다** — Figma 프레임 1913:6060의 제목이 곧 규칙이다
 * ("가용재고를 다 입력하지 않고 주문 확정한 경우, 무조건 미송처리").
 */
export function backorderPreview(
  order: Order,
  inputs: Readonly<Record<string, string>>,
): BackorderPreview {
  return order.lines.reduce<BackorderPreview>(
    (acc, line) => {
      const rest = unallocatedAfter(line, shipQty(inputs, line));
      return rest > 0
        ? { skuCount: acc.skuCount + 1, totalQty: acc.totalQty + rest }
        : acc;
    },
    { skuCount: 0, totalQty: 0 },
  );
}

/**
 * 주문 확정(PLACED → CONFIRMED, `settlement_data_model.md` §3.1).
 *
 * 입력분은 `출고진행`으로 올라가며 포장 대기 회차 한 건이 되고,
 * **남은 잔량은 전부 미송으로 확정된다.** 되돌릴 수 없다.
 *
 * `reservedQty`를 같이 올리는 이유: 가용재고 = 현재고 − 주문처리중이라,
 * 잡아 둔 수량만큼 가용재고가 줄어야 다음에 같은 SKU를 또 빼가지 않는다.
 */
export function confirmOrder(
  order: Order,
  inputs: Readonly<Record<string, string>>,
): Order {
  const batchLines: PackingBatchLine[] = [];

  const lines = order.lines.map((line) => {
    const n = shipQty(inputs, line);
    const allocatedQty = line.allocatedQty + n;
    if (n > 0) {
      batchLines.push({
        lineId: line.id,
        skuId: line.skuId,
        label: packingLabel(line),
        qty: n,
        /* 확정 직후에는 미할당이 곧 미송이다. 이 회차를 지우면 그만큼 미송으로 되돌아간다 */
        backorderUsed: n,
      });
    }
    return {
      ...line,
      allocatedQty,
      reservedQty: line.reservedQty + n,
      backorderQty: line.qty - allocatedQty,
    };
  });

  const created = batchLines.length > 0;
  return {
    ...order,
    status: "CONFIRMED",
    lines,
    batches: created
      ? [
          ...order.batches,
          {
            id: `${order.id}-B${order.nextBatchNo}`,
            no: order.nextBatchNo,
            lines: batchLines,
          },
        ]
      : order.batches,
    nextBatchNo: order.nextBatchNo + (created ? 1 : 0),
  };
}

/**
 * 주문 취소(PLACED → CANCELED). 수량은 건드리지 않는다 —
 * 확정 전이라 잡아 둔 것도, 미송으로 넘긴 것도 없기 때문이다.
 */
export function cancelOrder(order: Order): Order {
  return { ...order, status: "CANCELED" };
}

/**
 * 포장 준비 — 지금 입력된 수량으로 포장 대기 회차를 하나 만든다.
 *
 * Figma 프레임 1913:8149의 제목이 곧 규칙이다:
 * "미송 건에 대해 미송 탭이 아닌 주문 탭에서 부분 포장 가능".
 * 확정한 주문의 잔량을 몇 번이고 나눠 담을 수 있어야 해서 회차가 쌓인다.
 *
 * **미송이 먼저 줄어든다.** 미송은 "팔았는데 못 보낸 것"이라 재고가 생기면
 * 새 할당보다 이쪽을 먼저 갚는 게 업무 순서다.
 */
export function addPackingBatch(
  order: Order,
  inputs: Readonly<Record<string, string>>,
): Order {
  const batchLines: PackingBatchLine[] = [];

  const lines = order.lines.map((line) => {
    const n = shipQty(inputs, line);
    if (n === 0) return line;

    const backorderUsed = Math.min(n, line.backorderQty);
    batchLines.push({
      lineId: line.id,
      skuId: line.skuId,
      label: packingLabel(line),
      qty: n,
      backorderUsed,
    });
    return {
      ...line,
      allocatedQty: line.allocatedQty + n,
      reservedQty: line.reservedQty + n,
      backorderQty: line.backorderQty - backorderUsed,
    };
  });

  if (batchLines.length === 0) return order;

  return {
    ...order,
    lines,
    batches: [
      ...order.batches,
      {
        id: `${order.id}-B${order.nextBatchNo}`,
        no: order.nextBatchNo,
        lines: batchLines,
      },
    ],
    // 번호는 재사용하지 않는다 — #2를 지우고 새로 만들면 #4다
    nextBatchNo: order.nextBatchNo + 1,
  };
}

/**
 * 회차 삭제 — 그 회차의 `포장 준비`를 **정확히 되돌린다.**
 * 미송을 얼마나 갚았는지는 회차 줄의 `backorderUsed`에 적혀 있다.
 * 다시 계산하려 들면(`min` 은 역함수가 없다) 되돌린 값이 원래와 달라진다.
 */
export function removePackingBatch(order: Order, batchId: string): Order {
  const target = order.batches.find((b) => b.id === batchId);
  if (!target) return order;

  const lines = order.lines.map((line) => {
    const undo = target.lines.find((l) => l.lineId === line.id);
    if (!undo) return line;
    return {
      ...line,
      allocatedQty: line.allocatedQty - undo.qty,
      reservedQty: line.reservedQty - undo.qty,
      backorderQty: line.backorderQty + undo.backorderUsed,
    };
  });

  return {
    ...order,
    lines,
    batches: order.batches.filter((b) => b.id !== batchId),
  };
}
