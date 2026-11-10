import { describe, expect, it } from "vitest";
import { sumQuantities, toProductView } from "./derive";
import type { ProductDetail, Variant } from "./types";

/*
 * #212 — 재고 탭 판매가능은 서버 `availableQty`(재고 − 예약)가 아니라
 * `현재고 − 주문처리중 − 미송대기`다. 서버 값이 다르게 와도 화면 숫자는 세 칸으로 정해진다.
 */

function variant(
  id: number,
  stockQty: number,
  allocatedQty: number,
  backorderQty: number,
  availableQty: number,
): Variant {
  return {
    id,
    variantNumber: id,
    size: "XS",
    stockQty,
    allocatedQty,
    backorderQty,
    availableQty,
    avgCost: 0,
    orderLimit: 0,
    salePrice: 0,
  };
}

function detailOf(variants: Variant[]): ProductDetail {
  // 재고 탭은 listing·categoryPath를 읽지 않는다 — 상품 탭 테스트와 같은 캐스팅 선례(product/derive.test.ts)
  return {
    id: 1014,
    productNumber: 9,
    name: "목 테스트 셔츠",
    colorOptions: [
      {
        color: { id: 1, name: "블랙", hex: "#000000", groupName: "블랙" },
        variants,
      },
    ],
  } as unknown as ProductDetail;
}

describe("toProductView — 판매가능을 공식으로 센다 (#212)", () => {
  it("dev 9-2 행: 서버 availableQty 2가 와도 판매가능은 2 − 0 − 5 = −3", () => {
    const view = toProductView(detailOf([variant(3074, 2, 0, 5, 2)]));
    expect(view.skus[0]?.sellableQty).toBe(-3);
  });
});

describe("sumQuantities — 합계 행의 판매가능 (#212)", () => {
  it("SKU 둘의 판매가능 합 = Σ현재고 − Σ주문처리중 − Σ미송대기", () => {
    const view = toProductView(
      detailOf([variant(1, 2, 0, 5, 2), variant(2, 10, 3, 1, 7)]),
    );
    expect(sumQuantities(view.skus)).toEqual({
      stock: 12,
      reservedQty: 3,
      backorderQty: 6,
      sellableQty: 3,
    });
  });
});
