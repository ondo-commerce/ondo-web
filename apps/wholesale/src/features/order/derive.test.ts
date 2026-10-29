import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  ENTRY_LIST_PARAMS,
  isOrderNotFound,
  parseOrderParam,
  toListQuery,
} from "./derive";

describe("#295 주문 탭 진입 인자 ?order=", () => {
  it("없거나 빈 값 → null(아무것도 안 함)", () => {
    expect(parseOrderParam(null)).toBeNull();
    expect(parseOrderParam("")).toBeNull();
  });

  it("양의 정수 → 그 id", () => {
    expect(parseOrderParam("7006")).toBe(7006);
    expect(parseOrderParam("99999")).toBe(99999);
  });

  it("숫자 아님, 0, 음수, 소수, 너무 큰 수 → invalid", () => {
    for (const raw of ["abc", "0", "-1", "1.5", "7006a", "9".repeat(20)])
      expect(parseOrderParam(raw)).toBe("invalid");
  });

  it("S11-6 진입 조건은 검색, 상태, 정산을 전부 풀고 1쪽 — 서버에 거는 조건이 없다", () => {
    expect(toListQuery(ENTRY_LIST_PARAMS)).toEqual({
      filter: undefined,
      q: undefined,
      settlementStatus: undefined,
      page: 0,
      size: expect.any(Number),
    });
  });

  it("S11-17 404만 '없는 주문'이다. 500은 아니다", () => {
    const notFound = new ApiError({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "",
      traceId: null,
    });
    const server = new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "",
      traceId: null,
    });
    expect(isOrderNotFound(notFound)).toBe(true);
    expect(isOrderNotFound(server)).toBe(false);
  });
});
