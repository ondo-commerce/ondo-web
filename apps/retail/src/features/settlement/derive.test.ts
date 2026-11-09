import { describe, expect, it } from "vitest";
import { toBankAccount, toLedgerEntry, toPartnerSettlements } from "./derive";
import type { LedgerEntryWire, PartnerSettlementWire } from "./types";

/**
 * 서버 실측 모양(2026-11-09, bombom → 무드온 101)을 그대로 옮긴 줄.
 * 웹이 `bank.bankAccountNo`를 읽어 계좌가 있는데 "계좌 미등록"이 섰던 결함(wire-01 W1-1)의 회귀 방지다.
 */
const MOODON: PartnerSettlementWire = {
  wholesalerId: 101,
  name: "무드온",
  balance: 46000,
  overdue: { amount: 46000, count: 1, maxDays: 9 },
  lastPaidAt: null,
  paidLast7Days: 0,
  bank: { bankName: "국민은행", accountNo: "101-0101-0001", holder: "김무드" },
};

describe("toBankAccount (서버 bank 객체 모양, W1-1)", () => {
  it("계좌가 있으면 은행, 계좌번호, 예금주를 다 채운다", () => {
    expect(toBankAccount(MOODON)).toEqual({
      bankName: "국민은행",
      accountNo: "101-0101-0001",
      holder: "김무드",
    });
  });

  it("bank: null 이면 계좌 미등록(null)", () => {
    expect(toBankAccount({ ...MOODON, bank: null })).toBeNull();
  });

  it.each([
    ["은행", { bankName: "", accountNo: "101-0101-0001", holder: "김무드" }],
    ["계좌번호", { bankName: "국민은행", accountNo: "", holder: "김무드" }],
    [
      "예금주",
      { bankName: "국민은행", accountNo: "101-0101-0001", holder: "" },
    ],
  ])("%s 칸이 빈 문자열이면 null — 셋이 다 있어야 계좌다", (_, bank) => {
    expect(toBankAccount({ ...MOODON, bank })).toBeNull();
  });
});

describe("toPartnerSettlements", () => {
  it("서버 실측 줄을 뷰로 옮기면 bank 가 채워진다", () => {
    const [row] = toPartnerSettlements([MOODON]);
    expect(row?.wholesalerId).toBe("101");
    expect(row?.bank?.accountNo).toBe("101-0101-0001");
    expect(row?.lastPaidAt).toBeNull();
  });
});

describe("toLedgerEntry", () => {
  it("출고 줄 실측 모양을 그대로 옮긴다", () => {
    const wire: LedgerEntryWire = {
      id: 1,
      date: "2026-09-08",
      kind: "SHIPMENT",
      statementNo: "JG-20260908-001",
      orderNo: "20260908-0230-0002",
      method: null,
      delta: 46000,
      allocations: null,
      unallocated: null,
    };
    expect(toLedgerEntry(wire)).toEqual({
      id: "1",
      date: "2026-09-08",
      kind: "SHIPMENT",
      statementNo: "JG-20260908-001",
      orderNo: "20260908-0230-0002",
      method: null,
      delta: 46000,
      unallocated: null,
    });
  });
});
