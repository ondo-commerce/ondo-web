import { describe, expect, it } from "vitest";
import {
  dateChangeNotifications,
  etaLabel,
  type DateChangeBackorder,
  type DateChangeInput,
} from "./dateChangeNotice";

/**
 * S1-4 입고일 변경 알림 생성 규칙(loop-06b §5-3 1). BE에 넘길 규칙 원본이라 미송 목 시드 값을 그대로 넣는다.
 * 오늘은 인자로 준다(10/29) — 시계를 읽지 않는다.
 */

const TODAY = "2026-10-29";
const MOODON = { id: 101, name: "무드온" };

const LINEN = { productName: "린넨 셋업 자켓", color: "베이지", size: "L" };
const FLOWER = { productName: "빈티지 플라워 셔츠", color: "레드", size: "L" };

const open = (
  retailerId: number,
  remainingQty: number,
): DateChangeBackorder => ({
  retailerId,
  remainingQty,
  status: "OPEN",
});

/** 미송 목 시드의 3019(9003 봄봄 2) */
const SKU_3019: DateChangeBackorder[] = [open(1, 2)];
/** 미송 목 시드의 3003(9001 봄봄 4, 9005 대기상회 9, 9006 봄봄 남은 2) */
const SKU_3003: DateChangeBackorder[] = [open(1, 4), open(2, 9), open(1, 2)];

function input(overrides: Partial<DateChangeInput>): DateChangeInput {
  return {
    variant: LINEN,
    before: "2026-11-05",
    after: "2026-11-08",
    backorders: SKU_3019,
    wholesaler: MOODON,
    today: TODAY,
    ...overrides,
  };
}

describe("S1-4 입고일 변경 알림 생성 규칙", () => {
  it("3019 today+7 → D(+10): 봄봄 1건, 제목 도매처 이름, 본문 남은 2장과 옛 날짜 → 새 날짜, target BACKORDERS + 도매처", () => {
    expect(dateChangeNotifications(input({}))).toEqual([
      {
        retailerId: 1,
        title: "무드온 미송 입고일 변경",
        body: "린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 11/8(일)",
        target: { kind: "BACKORDERS", wholesalerId: 101 },
      },
    ]);
  });

  it("3003 변경: 봄봄 '남은 6장'(9001 4 + 9006 2), 대기상회 '남은 9장'. 봄봄 본문에 9장, 15장 0", () => {
    const out = dateChangeNotifications(
      input({
        variant: FLOWER,
        before: "2026-10-26",
        after: "2026-11-02",
        backorders: SKU_3003,
      }),
    );
    expect(out.map((n) => [n.retailerId, n.body])).toEqual([
      [1, "빈티지 플라워 셔츠 레드/L 남은 6장, 10/26(월) → 11/2(월)"],
      [2, "빈티지 플라워 셔츠 레드/L 남은 9장, 10/26(월) → 11/2(월)"],
    ]);
    const mine = out.find((n) => n.retailerId === 1);
    expect(JSON.stringify(mine)).not.toMatch(/(?<![~\d])9장/);
    expect(JSON.stringify(mine)).not.toMatch(/(?<![~\d])15장/);
    // 소매처 이름은 입력에도 출력에도 없다
    expect(JSON.stringify(out)).not.toContain("대기상회");
  });

  it("같은 날짜 0건(사유만 바뀐 저장도 날짜가 같아 0건), null → null 0건", () => {
    expect(dateChangeNotifications(input({ after: "2026-11-05" }))).toEqual([]);
    expect(
      dateChangeNotifications(input({ before: null, after: null })),
    ).toEqual([]);
  });

  it("미정 → 날짜 1건 '입고일 미정 → …', 날짜 → 미정(해제) 1건 '… → 입고일 미정'", () => {
    expect(
      dateChangeNotifications(input({ before: null, after: "2026-11-08" }))[0]
        ?.body,
    ).toBe("린넨 셋업 자켓 베이지/L 남은 2장, 입고일 미정 → 11/8(일)");
    expect(
      dateChangeNotifications(input({ before: "2026-11-05", after: null }))[0]
        ?.body,
    ).toBe("린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 입고일 미정");
  });

  it("RESOLVED 와 남은 0(배분이 먼저 커밋돼 다 나간 소매처)은 대상 밖", () => {
    const out = dateChangeNotifications(
      input({
        variant: FLOWER,
        backorders: [
          { retailerId: 1, remainingQty: 0, status: "RESOLVED" },
          { retailerId: 1, remainingQty: 3, status: "RESOLVED" },
          open(2, 0),
          open(3, 1),
        ],
      }),
    );
    expect(out.map((n) => n.retailerId)).toEqual([3]);
    expect(dateChangeNotifications(input({ backorders: [] }))).toEqual([]);
  });

  it("배분이 날짜보다 먼저 커밋되면 줄어든 잔량으로 1건(9006 처럼 4장 중 2장 배분 → 남은 2장)", () => {
    expect(
      dateChangeNotifications(input({ backorders: [open(1, 1)] }))[0]?.body,
    ).toBe("린넨 셋업 자켓 베이지/L 남은 1장, 11/5(목) → 11/8(일)");
  });

  it("다른 해는 YYYY/M/D(요일). 연도 경계도 같은 함수", () => {
    expect(
      dateChangeNotifications(input({ after: "2027-01-05" }))[0]?.body,
    ).toBe("린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 2027/1/5(화)");
    expect(etaLabel("2026-12-31", "2026-12-31")).toBe("12/31(목)");
    expect(etaLabel("2027-01-01", "2026-12-31")).toBe("2027/1/1(금)");
    expect(etaLabel(null, TODAY)).toBe("입고일 미정");
  });
});
