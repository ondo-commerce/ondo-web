import { describe, expect, it } from "vitest";
import { STORE_NAME_FALLBACK } from "./constants";
import { consentRecords, storeNameLabel } from "./derive";

/**
 * 헤더 칩·설정·주문 상세 수령 상호가 전부 `storeNameLabel`을 지난다. 예전에는
 * 주문 상세가 설정 더미 보관소의 고정 상호를 읽어 어느 계정이든 같은 이름이었다
 * (`side-02` N5). 서버 값을 **그대로** 넘기는지, 빈 값만 자리 문구로 바꾸는지를 고정한다.
 */
describe("storeNameLabel", () => {
  it("/me.shopName을 그대로 넘긴다", () => {
    expect(storeNameLabel("미소상회")).toBe("미소상회");
    expect(storeNameLabel("Bom & Co.")).toBe("Bom & Co.");
  });

  it("앞뒤 공백만 뗀다", () => {
    expect(storeNameLabel("  미소 상회  ")).toBe("미소 상회");
  });

  it("비었으면 더미 상호가 아니라 '상호 미등록'이다", () => {
    expect(STORE_NAME_FALLBACK).toBe("상호 미등록");
    expect(storeNameLabel("")).toBe(STORE_NAME_FALLBACK);
    expect(storeNameLabel("   ")).toBe(STORE_NAME_FALLBACK);
    expect(storeNameLabel(null)).toBe(STORE_NAME_FALLBACK);
    expect(storeNameLabel(undefined)).toBe(STORE_NAME_FALLBACK);
  });
});

describe("consentRecords", () => {
  it("동의 일시가 /me.appliedAt을 서울 시각으로 다듬은 값이다", () => {
    const records = consentRecords("2026-10-01T01:05:00Z");
    expect(records.map((r) => r.kind)).toEqual(["service", "privacy"]);
    for (const record of records) {
      expect(record.agreedAt).toBe("2026.10.01 10:05");
    }
  });
});
