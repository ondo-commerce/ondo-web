import { describe, expect, it } from "vitest";
import { lineQty, lineSubtotal, totalsOf } from "./derive";
import type { CartLine } from "./types";

/**
 * 장바구니 합계는 서버 값이 아니라 칸의 **글자**에서 나온다(`qtyText`). 그래서
 * 못 읽는 글자를 0장으로 세는지, 주문 불가 행을 합계에서 빼는지는 순수 함수가 지킨다.
 * `45.5` 를 455장으로 세는 결함은 도매 5회차 내리 재발했다 — 여기서 고정한다.
 */
function line(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "1",
    cartItemId: 1,
    variantId: 3003,
    wholesalerId: "101",
    wholesalerName: "무드온",
    wholesalerLocation: "",
    productId: "L1",
    productName: "코튼 셔츠",
    colorLabel: "블랙",
    size: "M",
    price: 12000,
    soldOut: false,
    orderable: true,
    qty: 3,
    qtyText: "3",
    ...over,
  };
}

describe("lineQty / lineSubtotal", () => {
  it("정수 글자는 그대로 장수다", () => {
    expect(lineQty(line({ qtyText: "3" }))).toBe(3);
    expect(lineSubtotal(line({ qtyText: "3", price: 12000 }))).toBe(36000);
  });

  it("못 읽는 글자(45.5)는 455장이 아니라 0장이다", () => {
    expect(lineQty(line({ qtyText: "45.5" }))).toBe(0);
    expect(lineSubtotal(line({ qtyText: "45.5" }))).toBe(0);
  });

  it("주문 불가 행은 칸에 숫자가 있어도 0장, 0원이다", () => {
    const dead = line({ orderable: false, price: null, qtyText: "5" });
    expect(lineQty(dead)).toBe(0);
    expect(lineSubtotal(dead)).toBe(0);
  });
});

describe("totalsOf", () => {
  it("조합 수는 줄 수, 장수와 금액은 읽을 수 있는 줄만 더한다", () => {
    const totals = totalsOf([
      line({ lineId: "1", qtyText: "3", price: 12000 }),
      line({ lineId: "2", qtyText: "2", price: 8000 }),
      line({ lineId: "3", orderable: false, price: null, qtyText: "9" }),
    ]);
    expect(totals).toEqual({
      comboCount: 3,
      sheets: 5,
      amount: 52000,
      hasIssue: false,
    });
  });

  it("못 읽는 입력이 섞이면 hasIssue 로 알린다 — 합계가 그 줄을 0으로 센다는 뜻", () => {
    const totals = totalsOf([
      line({ lineId: "1", qtyText: "3" }),
      line({ lineId: "2", qtyText: "45.5" }),
    ]);
    expect(totals.sheets).toBe(3);
    expect(totals.hasIssue).toBe(true);
  });

  it("빈 묶음은 전부 0 이다", () => {
    expect(totalsOf([])).toEqual({
      comboCount: 0,
      sheets: 0,
      amount: 0,
      hasIssue: false,
    });
  });
});
