/**
 * 미송 입고일 변경 알림을 만드는 규칙(loop-06b `01-plan.md` §5-3 1, §5-4 2). **목 규칙 = BE 규칙**이다.
 * 순수 함수만 둔다. BE는 `expected-inbound` PUT 커밋 안에서 이 규칙대로 알림 행을 만든다.
 *
 * 규칙:
 *  1. 날짜가 바뀔 때만 만든다. 미정 → 날짜, 날짜 → 미정(해제)도 바뀐 것이다. 사유는 입력에 없다 —
 *     사유만 바뀐 저장은 before === after 라 0건이다(Q1, 사유 변경 통지는 후속 요구)
 *  2. 그 SKU에 OPEN이고 남은 수량이 0보다 큰 미송이 있는 소매처마다 1건. 본문 수량은 그 소매처의 남은 합이다.
 *     배분이 먼저 커밋돼 남은 수량이 0이 된 소매처는 0건(커밋 순서대로, Codex 7)
 *  3. 본문에 남의 소매처 이름, 수량, SKU 합계, 판매가능을 싣지 않는다 — 입력 한 줄에 소매처 이름이 없고,
 *     합은 소매처마다 따로 낸다(06a §4-2 8)
 *
 * 날짜 표시는 `M/D(요일)`, 오늘과 해가 다르면 `YYYY/M/D(요일)`, 미정은 "입고일 미정"이다.
 * 오늘은 부르는 쪽이 서울 날짜로 넘긴다(목은 `Date.now()`, unit은 고정값) — 시계를 함수 안에서 읽지 않는다.
 */

export interface DateChangeVariant {
  productName: string;
  color: string;
  size: string;
}

/** 그 SKU의 미송 한 줄. 소매처 이름은 일부러 없다 */
export interface DateChangeBackorder {
  retailerId: number;
  remainingQty: number;
  status: "OPEN" | "RESOLVED";
}

export interface DateChangeInput {
  variant: DateChangeVariant;
  /** 바뀌기 전 입고 예정일 `YYYY-MM-DD`. 미정이면 null */
  before: string | null;
  /** 바뀐 뒤 입고 예정일. 해제면 null */
  after: string | null;
  /** 그 SKU의 미송 전부(상태 포함). 거르는 건 이 함수가 한다 */
  backorders: readonly DateChangeBackorder[];
  wholesaler: { id: number; name: string };
  /** 오늘(서울) `YYYY-MM-DD`. 해가 다른지 가를 때만 쓴다 */
  today: string;
}

export interface DateChangeNotice {
  retailerId: number;
  title: string;
  body: string;
  target: { kind: "BACKORDERS"; wholesalerId: number };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "11/5(목)", 해가 다르면 "2027/1/5(화)", 미정이면 "입고일 미정" */
export function etaLabel(date: string | null, today: string): string {
  if (date === null) return "입고일 미정";
  const [y = 0, m = 0, d = 0] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const head = String(y) === today.slice(0, 4) ? "" : `${y}/`;
  return `${head}${m}/${d}(${weekday})`;
}

/** 본문 한 줄. 시드도 이 함수로 만들어 주입과 글자가 같다 */
export function dateChangeBody(
  variant: DateChangeVariant,
  remainingQty: number,
  before: string | null,
  after: string | null,
  today: string,
): string {
  return `${variant.productName} ${variant.color}/${variant.size} 남은 ${remainingQty}장, ${etaLabel(before, today)} → ${etaLabel(after, today)}`;
}

/** 소매처별 알림. 소매처 id 오름차순. 날짜가 같으면 빈 배열 */
export function dateChangeNotifications(
  input: DateChangeInput,
): DateChangeNotice[] {
  if (input.before === input.after) return [];
  const remaining = new Map<number, number>();
  for (const b of input.backorders) {
    if (b.status !== "OPEN" || b.remainingQty <= 0) continue;
    remaining.set(
      b.retailerId,
      (remaining.get(b.retailerId) ?? 0) + b.remainingQty,
    );
  }
  return [...remaining.entries()]
    .sort(([a], [b]) => a - b)
    .map(([retailerId, qty]) => ({
      retailerId,
      title: `${input.wholesaler.name} 미송 입고일 변경`,
      body: dateChangeBody(
        input.variant,
        qty,
        input.before,
        input.after,
        input.today,
      ),
      target: { kind: "BACKORDERS", wholesalerId: input.wholesaler.id },
    }));
}
