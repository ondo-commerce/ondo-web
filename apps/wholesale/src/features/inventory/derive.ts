import type { StockMovement, StockQuantities } from "./types";

/*
 * 재고 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 공식이 좌측 표·우측 카드·확인 다이얼로그 세 곳에서 쓰이는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다.
 *
 * 입력이 비어 있을 수 있는 계산은 0이 아니라 **null**을 돌려준다.
 * 0원은 "공짜로 받았다"로 읽히기 때문에 화면에서 빈칸으로 그려야 한다(§7 Q5).
 */

/** 판매가능 = 현재고 − 주문처리중 − 미송대기. 음수를 0으로 감추지 않는다(§7 Q4) */
export function availableQty(q: StockQuantities): number {
  return q.stock - q.reservedQty - q.backorderQty;
}

/** 색상 그룹 접힘 행의 수량 3열. 판매가능은 이 합계끼리 다시 뺀 값이다 */
export function sumQuantities(
  list: readonly StockQuantities[],
): StockQuantities {
  return list.reduce<StockQuantities>(
    (acc, q) => ({
      stock: acc.stock + q.stock,
      reservedQty: acc.reservedQty + q.reservedQty,
      backorderQty: acc.backorderQty + q.backorderQty,
    }),
    { stock: 0, reservedQty: 0, backorderQty: 0 },
  );
}

/** 모드 A 예상 금액 = 입고수량 × 매입단가. 하나라도 비면 빈칸(null) */
export function estimatedAmount(
  qty: number | null,
  unitPrice: number | null,
): number | null {
  if (qty === null || unitPrice === null) return null;
  return qty * unitPrice;
}

/** 모드 B 총 금액 = 입력재고 × 매입단가. 하나라도 비면 빈칸(null) */
export function totalAmount(
  qty: number | null,
  unitPrice: number | null,
): number | null {
  return estimatedAmount(qty, unitPrice);
}

/** 모드 B 변동 후 재고 = 현재고 + 추가 재고. 아직 안 적었으면 현재고 그대로 */
export function stockAfterInbound(stock: number, added: number | null): number {
  return stock + (added ?? 0);
}

/**
 * 숫자 입력칸의 문자열 → 수량/금액.
 * 빈칸과 0을 구분해야 해서 빈칸은 null이다 — "안 적었다"와 "0을 적었다"는 다르다.
 */
export function parseNumberInput(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return Number(digits);
}

/** 이력 카드에 새로 끼울 입고 한 줄. 화면에서 만든 값도 이력 모양을 그대로 지킨다 */
export function inboundMovement(
  skuId: string,
  date: string,
  beforeQty: number,
  qty: number,
): StockMovement {
  return {
    id: `${skuId}-in-${date}-${beforeQty}-${qty}`,
    date,
    type: "stockIn",
    beforeQty,
    deltaQty: qty,
    afterQty: beforeQty + qty,
  };
}

/**
 * 이력 날짜 표시(`2023.10.24`).
 * **입고 처리 버튼을 누른 순간에만 부른다** — 렌더 중에 오늘 날짜를 만들면
 * 서버와 브라우저의 시각이 달라 하이드레이션이 깨진다.
 */
export function formatMovementDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}
