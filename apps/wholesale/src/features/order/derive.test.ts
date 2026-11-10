import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  ENTRY_LIST_PARAMS,
  formatPackingTime,
  isOrderNotFound,
  parseOrderParam,
  toListQuery,
  toPackingBatchViews,
} from "./derive";
import type { PackingQueueItem } from "./types";

/** 포장 대기열 한 칸. 시각과 id만 다르게 쓰고 나머지는 이 테스트와 상관없다 */
function packing(id: number, createdAt: string): PackingQueueItem {
  return {
    id,
    createdAt,
    isCancellable: true,
    items: [],
    outboundId: 0,
    status: "READY",
  };
}

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

/*
 * 포장 카드의 `#N`은 위치 번호라 앞 카드를 지우면 당겨진다. 사장이 상자에 적어 둘 표식은
 * 그 옆의 만든 시각과 포장 id다 — 이 둘이 지워도 안 바뀌는지가 여기서 지키는 것이다(F9).
 */
describe("#196 포장 회차 카드 만든 시각", () => {
  it("서울 시각 HH:mm으로 적는다. 브라우저 시간대에 기대지 않는다", () => {
    expect(formatPackingTime("2026-11-10T05:05:30Z")).toBe("14:05");
    expect(formatPackingTime("2026-11-10T14:05:30+09:00")).toBe("14:05");
  });

  it("서울 자정 직후는 24:05가 아니라 00:05다", () => {
    expect(formatPackingTime("2026-11-09T15:05:00Z")).toBe("00:05");
  });

  it("값이 깨졌으면 -", () => {
    expect(formatPackingTime("")).toBe("-");
    expect(formatPackingTime("not-a-date")).toBe("-");
  });

  it("같은 분에 둘이면 시각은 같고 포장 id로 갈린다. 만든 순서, 같으면 id 순이다", () => {
    const views = toPackingBatchViews([
      packing(42, "2026-11-10T14:05:40+09:00"),
      packing(41, "2026-11-10T14:05:10+09:00"),
    ]);
    expect(views.map((v) => [v.no, v.createdAtLabel, v.id])).toEqual([
      [1, "14:05", 41],
      [2, "14:05", 42],
    ]);
  });

  it("앞 카드를 지우면 #N은 당겨지지만 남은 카드의 시각과 id는 그대로다", () => {
    const before = toPackingBatchViews([
      packing(41, "2026-11-10T14:05:10+09:00"),
      packing(42, "2026-11-10T14:07:00+09:00"),
      packing(43, "2026-11-10T14:12:00+09:00"),
    ]);
    const after = toPackingBatchViews([
      packing(42, "2026-11-10T14:07:00+09:00"),
      packing(43, "2026-11-10T14:12:00+09:00"),
    ]);
    const mark = (v: { createdAtLabel: string; id: number }) =>
      `${v.createdAtLabel} · id ${v.id}`;

    expect(after.map(mark)).toEqual(before.slice(1).map(mark));
    expect(after.map((v) => v.no)).toEqual([1, 2]);
    expect(before.slice(1).map((v) => v.no)).toEqual([2, 3]);
  });
});
