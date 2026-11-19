import { describe, expect, it } from "vitest";
import { FILTER_ALL, PAGE_SIZE } from "./constants";
import {
  catalogHref,
  catalogPageNumbers,
  resolveCatalogPage,
  toCatalogPaging,
  toListingParams,
} from "./derive";

/** 13쪽째에 5개가 남는 긴 목록 */
const LONG = PAGE_SIZE * 12 + 5;

const filter = {
  category: "12",
  color: FILTER_ALL,
  size: "M",
  price: FILTER_ALL,
};

describe("소매 상품 페이지", () => {
  it("필터를 유지해 선택한 한 페이지만 요청하고 필터 변경은 첫 페이지로 보낸다", () => {
    expect(catalogHref("/", filter, {}, 2)).toBe("/?category=12&size=M&page=2");
    expect(toListingParams(filter, 2)).toMatchObject({
      categoryId: 12,
      sizes: "M",
      page: 1,
      size: PAGE_SIZE,
    });
    expect(catalogHref("/", filter, { size: FILTER_ALL })).toBe(
      "/?category=12",
    );
  });

  it("기존 펼침 주소의 마지막 상품이 속한 페이지를 복원하고 새 페이지 값이 우선한다", () => {
    const shown = String(PAGE_SIZE * 2);
    expect(resolveCatalogPage({ shown })).toBe(2);
    expect(resolveCatalogPage({ shown, page: ["4", "3"] })).toBe(4);
    for (const value of ["0", "-1", "1e3", "2.5", "2147483649", "other"]) {
      expect(resolveCatalogPage({ page: value })).toBe(1);
    }
  });

  it("빈 결과는 첫 페이지에서 보이고 범위 밖 주소는 마지막 페이지로 보낸다", () => {
    expect(toCatalogPaging(99, 0)).toEqual({
      page: 1,
      total: 0,
      totalPages: 0,
    });
    expect(toCatalogPaging(99, LONG)).toEqual({
      page: 13,
      total: LONG,
      totalPages: 13,
    });
  });

  it("긴 목록에서도 현재와 인접한 번호만 보여준다", () => {
    expect(catalogPageNumbers(toCatalogPaging(1, 0))).toEqual([]);
    expect(catalogPageNumbers(toCatalogPaging(2, PAGE_SIZE * 2 - 1))).toEqual([
      1, 2,
    ]);
    expect(catalogPageNumbers(toCatalogPaging(1, LONG))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(catalogPageNumbers(toCatalogPaging(7, LONG))).toEqual([
      5, 6, 7, 8, 9,
    ]);
    expect(catalogPageNumbers(toCatalogPaging(13, LONG))).toEqual([
      9, 10, 11, 12, 13,
    ]);
  });
});
