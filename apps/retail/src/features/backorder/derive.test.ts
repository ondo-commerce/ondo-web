import { describe, expect, it } from "vitest";
import { backordersEmptyKind, pageOf } from "./derive";
import type { BackorderLine } from "./types";

/**
 * 미송은 서버 장을 다 받아 합친 뒤 화면이 100줄씩 나눈다(#451). 장 나누기와 빈 장의
 * 이유가 갈리는 경계(0줄, 딱 100줄, 101줄, 범위 밖 장)를 여기서 고정한다.
 */
function lines(count: number): BackorderLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    productName: "코듀로이 셔츠",
    wholesalerId: "101",
    wholesalerName: "무드온",
    colorName: "카멜",
    sizeName: "M",
    qty: 1,
    orderedAt: "2026-11-19T23:34:00+09:00",
    orderedDate: "2026-11-19",
    etaDate: null,
    orderNo: `R-${i + 1}`,
    orderId: i + 1,
  }));
}

describe("pageOf", () => {
  it("100줄이면 한 장, 페이저가 안 선다", () => {
    const { rows, paging } = pageOf(lines(100), 1);
    expect(rows).toHaveLength(100);
    expect(paging).toEqual({ page: 1, totalPages: 1, totalElements: 100 });
  });

  it("101줄이면 2장째에 101번째 줄 하나만 선다", () => {
    const { rows, paging } = pageOf(lines(101), 2);
    expect(rows.map((line) => line.id)).toEqual(["101"]);
    expect(paging).toEqual({ page: 2, totalPages: 2, totalElements: 101 });
  });

  it("0줄이어도 장 수는 1이다", () => {
    expect(pageOf([], 1).paging).toEqual({
      page: 1,
      totalPages: 1,
      totalElements: 0,
    });
  });
});

describe("backordersEmptyKind", () => {
  it("줄이 서면 빈 상태가 아니다", () => {
    const { rows, paging } = pageOf(lines(1), 1);
    expect(backordersEmptyKind({ shown: rows.length, paging })).toBe(null);
  });

  it("미송이 하나도 없으면 none", () => {
    const { rows, paging } = pageOf([], 1);
    expect(backordersEmptyKind({ shown: rows.length, paging })).toBe("none");
  });

  it("미송은 있는데 마지막 장을 넘으면 outOfRange", () => {
    const { rows, paging } = pageOf(lines(3), 5);
    expect(backordersEmptyKind({ shown: rows.length, paging })).toBe(
      "outOfRange",
    );
  });
});
