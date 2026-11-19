import { describe, expect, it } from "vitest";
import { sellableQtyOf } from "./sellableQty";

describe("sellableQtyOf — 판매가능 = 현재고 − 주문처리중 − 미송대기 (#212)", () => {
  it("미송대기까지 뺀다 — dev 9-2 행(2, 0, 5)은 서버 availableQty 2가 아니라 −3", () => {
    expect(sellableQtyOf(2, 0, 5)).toBe(-3);
  });

  it("주문처리중도 뺀다", () => {
    expect(sellableQtyOf(10, 3, 2)).toBe(5);
  });

  it("음수를 0으로 감추지 않는다(PM Q4)", () => {
    expect(sellableQtyOf(0, 0, 5)).toBe(-5);
  });
});
