import type { LedgerEntry, SettlementOrder, TradeRelation } from "./types";

/*
 * 정산 목업. API가 붙으면 이 파일만 지운다.
 *
 * ⚠️ 이 파일의 규칙 하나: **화면에서 서로 계산되는 숫자는 반드시 맞아야 한다.**
 *    Figma 더미는 아코디언 tail(`부산 상사 · 4건 / 267,000`)과 펼친 표(6행 · 합계 589,000),
 *    원장 요약(`-235,000`)이 전부 어긋나 있었다(01-pm.md §1.8). 그래서 여기서는
 *    **주문만 손으로 적고 원장은 주문에서 만든다** — 잔액이 어긋날 방법 자체를 없앤다.
 *      · 주문 1건 → `판매` 엔트리 1줄(−주문 금액)
 *      · 배정액 > 0 → 이틀 뒤 `입금` 엔트리 1줄(+배정액)
 *    그러면 계정 잔액 = −Σ(주문 금액 − 배정액) 이 되어 tail의 미수와 항상 일치한다.
 *
 * ⚠️ Math.random / Date.now 를 쓰지 않는다. 서버 렌더와 클라이언트 렌더가 다른 값을
 *    만들면 하이드레이션이 깨진다. 날짜도 UTC로만 만든다 — 로컬 시간대로 포맷하면
 *    서버(UTC)와 브라우저(KST)의 날짜가 하루 어긋난다.
 */

/** 12개 거래처는 Figma 실측 목록 그대로다(01-pm.md §1.1). 순서도 화면 순서다 */
export const TRADE_RELATIONS: readonly TradeRelation[] = [
  { id: "TR-001", retailerName: "서울유통", retailerCode: "RT-001" },
  { id: "TR-007", retailerName: "부산 상사", retailerCode: "RT-007" },
  { id: "TR-002", retailerName: "대구무역", retailerCode: "RT-002" },
  { id: "TR-003", retailerName: "인천물류", retailerCode: "RT-003" },
  { id: "TR-004", retailerName: "광주패션", retailerCode: "RT-004" },
  { id: "TR-005", retailerName: "대전상사", retailerCode: "RT-005" },
  { id: "TR-006", retailerName: "수원무역", retailerCode: "RT-006" },
  { id: "TR-008", retailerName: "성남물류", retailerCode: "RT-008" },
  { id: "TR-009", retailerName: "울산패션", retailerCode: "RT-009" },
  { id: "TR-010", retailerName: "창원상사", retailerCode: "RT-010" },
  { id: "TR-011", retailerName: "전주유통", retailerCode: "RT-011" },
  { id: "TR-012", retailerName: "제주물류", retailerCode: "RT-012" },
];

/* ── 시드 유틸 (재고 탭 fixtures와 같은 함수지만 feature 경계를 넘어 import 하지 않는다.
      목업끼리 의존을 만들면 한쪽 더미를 지울 때 다른 탭이 같이 깨진다) ────────── */

/** 정수 시드 → 32비트 해시 (murmur finalizer) */
function hash(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return x >>> 0;
}

/** 시드로 min~max(포함) 정수를 고른다 */
function between(min: number, max: number, seed: number): number {
  return min + (hash(seed) % (max - min + 1));
}

/** 문자열 → 정수 시드. 같은 거래처는 언제 열어도 같은 주문을 갖는다 */
function stringSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 목업 기준일 = Figma 최신 주문 일시(2025-08-12). "오늘"을 쓰면 렌더마다 값이 바뀐다 */
const BASE_DAY = Date.UTC(2025, 7, 12);

/** ms → `2025-08-12T09:14`. 정렬 가능한 고정 폭 문자열이 화면이 쓰는 형식이다 */
function isoMinute(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/** 금액은 천 원 단위로 떨어뜨린다. 도매 거래에 1원 단위가 없다 */
function toThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/** 주문 한 건을 만들기 전 단계의 값. 손으로 적은 행과 생성한 행이 같은 모양을 거친다 */
interface OrderSeedRow {
  orderNo: string;
  /** UTC ms. 문자열이 아니라 ms로 들고 있어야 원장 날짜(+2일)를 계산할 수 있다 */
  placedAtMs: number;
  totalAmount: number;
  fulfillmentStatus: SettlementOrder["fulfillmentStatus"];
  allocatedAmount: number;
}

/**
 * 부산 상사(TR-007)만 손으로 적는다. Figma에서 펼친 표가 실측된 유일한 거래처다(01-pm.md §1.3).
 *
 * ORD-004의 주문 상태는 Figma에 `미결제`로 그려져 있으나 이행 축 5종에 없는 값이라
 * `신규 주문`(placed)으로 적는다(게이트 Q1). Figma tail의 `4건 / 267,000`은 버린다 —
 * 펼친 표 6행이 실측이고, tail은 그 합(589,000)으로 파생된다.
 */
const BUSAN_ORDERS: readonly OrderSeedRow[] = [
  {
    orderNo: "ORD-001",
    placedAtMs: Date.UTC(2025, 7, 12, 9, 14),
    totalAmount: 358_000,
    fulfillmentStatus: "shipped",
    allocatedAmount: 358_000,
  },
  {
    orderNo: "ORD-002",
    placedAtMs: Date.UTC(2025, 7, 11, 17, 2),
    totalAmount: 124_000,
    fulfillmentStatus: "shipped",
    allocatedAmount: 62_000,
  },
  {
    orderNo: "ORD-003",
    placedAtMs: Date.UTC(2025, 7, 10, 9, 20),
    totalAmount: 267_000,
    fulfillmentStatus: "partialShipped",
    allocatedAmount: 0,
  },
  {
    orderNo: "ORD-004",
    placedAtMs: Date.UTC(2025, 7, 11, 10, 38),
    totalAmount: 189_000,
    fulfillmentStatus: "placed",
    allocatedAmount: 0,
  },
  {
    orderNo: "ORD-005",
    placedAtMs: Date.UTC(2025, 7, 10, 14, 55),
    totalAmount: 95_000,
    fulfillmentStatus: "shipped",
    allocatedAmount: 95_000,
  },
  {
    orderNo: "ORD-006",
    placedAtMs: Date.UTC(2025, 7, 9, 16, 44),
    totalAmount: 142_000,
    fulfillmentStatus: "confirmed",
    allocatedAmount: 71_000,
  },
];

/** 미수가 남은 주문의 이행 상태 후보. `취소`는 넣지 않는다 — 취소된 주문에 미수를 남기면
 *  화면이 "받을 돈이 있는 취소 건"이라는 거짓 상태를 보여준다 */
const OPEN_STATUS_POOL: readonly SettlementOrder["fulfillmentStatus"][] = [
  "confirmed",
  "partialShipped",
  "placed",
  "confirmed",
];

/** 미수 총액을 미결제 주문 k건으로 쪼갠다. 마지막 건이 나머지를 받는다 */
function splitOutstanding(
  total: number,
  count: number,
  seed: number,
): number[] {
  const parts: number[] = [];
  let left = total;
  for (let i = 0; i < count; i += 1) {
    if (i === count - 1) {
      parts.push(left);
      break;
    }
    const share = toThousand(
      (left / (count - i)) * (between(70, 130, seed + i) / 100),
    );
    const part = Math.min(
      Math.max(share, 10_000),
      left - 10_000 * (count - i - 1),
    );
    parts.push(part);
    left -= part;
  }
  return parts;
}

/**
 * 거래처 하나의 주문 목록을 만든다.
 *
 * 미수는 **최근 주문부터** 남긴다(오래된 주문이 먼저 정산되는 실제 흐름).
 * 그래서 앞쪽 k건이 미결제·부분 정산이고 나머지는 출고 완료 + 완납이다.
 */
function buildOrderSeeds(
  relationId: string,
  index: number,
  count: number,
  outstanding: number,
): OrderSeedRow[] {
  const seed = stringSeed(relationId);
  const openCount =
    outstanding === 0 ? 0 : Math.min(count, 1 + (hash(seed) % 3));
  const parts = splitOutstanding(outstanding, openCount, seed);

  return Array.from({ length: count }, (_, i) => {
    const s = seed + i * 7919;
    const dayBack = i * 2 + (hash(s) % 2);
    const placedAtMs =
      BASE_DAY -
      dayBack * DAY +
      between(9, 18, s + 1) * HOUR +
      between(0, 59, s + 2) * MINUTE;

    if (i < openCount) {
      const receivable = parts[i] ?? 0;
      /* 절반은 부분 정산으로 둔다 — 세 배지가 한 화면에 다 나와야 표가 검증된다 */
      const paid = hash(s + 3) % 2 === 0 ? toThousand(receivable * 0.4) : 0;
      return {
        orderNo: `ORD-${index * 100 + 101 + i}`,
        placedAtMs,
        totalAmount: receivable + paid,
        fulfillmentStatus:
          OPEN_STATUS_POOL[hash(s + 4) % OPEN_STATUS_POOL.length] ??
          "confirmed",
        allocatedAmount: paid,
      };
    }

    const total = between(80, 450, s + 5) * 1000;
    return {
      orderNo: `ORD-${index * 100 + 101 + i}`,
      placedAtMs,
      totalAmount: total,
      fulfillmentStatus: "shipped" as const,
      allocatedAmount: total,
    };
  });
}

/** Figma 실측 tail(01-pm.md §1.1)의 `주문 N건 / 미수 잔액 N원`을 목표로 주문을 역산한다 */
const RELATION_TARGETS: Record<string, { count: number; outstanding: number }> =
  {
    "TR-001": { count: 6, outstanding: 589_000 },
    "TR-002": { count: 5, outstanding: 412_000 },
    "TR-003": { count: 2, outstanding: 95_000 },
    "TR-004": { count: 7, outstanding: 734_000 },
    "TR-005": { count: 3, outstanding: 0 },
    "TR-006": { count: 4, outstanding: 189_000 },
    "TR-008": { count: 8, outstanding: 1_250_000 },
    "TR-009": { count: 2, outstanding: 62_000 },
    "TR-010": { count: 3, outstanding: 148_000 },
    "TR-011": { count: 5, outstanding: 523_000 },
    "TR-012": { count: 3, outstanding: 0 },
  };

function toOrders(
  relationId: string,
  rows: readonly OrderSeedRow[],
): SettlementOrder[] {
  return rows.map((row) => ({
    id: `${relationId}-${row.orderNo}`,
    relationId,
    orderNo: row.orderNo,
    placedAt: isoMinute(row.placedAtMs),
    totalAmount: row.totalAmount,
    fulfillmentStatus: row.fulfillmentStatus,
    allocatedAmount: row.allocatedAmount,
  }));
}

/**
 * 주문에서 원장을 만든다. 화면이 계산하는 두 숫자(tail의 미수 · 원장의 현재 잔액)가
 * 같은 원본에서 나오게 하려는 것이다 — 이 파일 머리의 규칙.
 */
function toLedger(
  relationId: string,
  rows: readonly OrderSeedRow[],
): LedgerEntry[] {
  return rows.flatMap<LedgerEntry>((row) => {
    const charge: LedgerEntry = {
      id: `${relationId}-${row.orderNo}-charge`,
      relationId,
      date: isoMinute(row.placedAtMs),
      entryType: "charge",
      amount: -row.totalAmount,
    };
    if (row.allocatedAmount <= 0) return [charge];

    return [
      charge,
      {
        id: `${relationId}-${row.orderNo}-payment`,
        relationId,
        /* 입금은 판매보다 뒤여야 원장이 시간순으로 읽힌다 */
        date: isoMinute(row.placedAtMs + 2 * DAY),
        entryType: "payment",
        amount: row.allocatedAmount,
      },
    ];
  });
}

const SEED_ROWS: { relationId: string; rows: readonly OrderSeedRow[] }[] =
  TRADE_RELATIONS.map((relation, index) => {
    if (relation.id === "TR-007") {
      return { relationId: relation.id, rows: BUSAN_ORDERS };
    }
    const target = RELATION_TARGETS[relation.id] ?? {
      count: 3,
      outstanding: 0,
    };
    return {
      relationId: relation.id,
      rows: buildOrderSeeds(
        relation.id,
        index,
        target.count,
        target.outstanding,
      ),
    };
  });

/** 주문 전량. 표시 순서는 주문 번호 순(= 이 배열 순서)이고, 배분 표만 주문 일시 순으로 다시 정렬한다 */
export const SETTLEMENT_ORDERS: readonly SettlementOrder[] = SEED_ROWS.flatMap(
  ({ relationId, rows }) => toOrders(relationId, rows),
);

/** 미수 원장 전량. 주문에서 파생돼 있어 tail의 미수 잔액과 절대 어긋나지 않는다 */
export const LEDGER_ENTRIES: readonly LedgerEntry[] = SEED_ROWS.flatMap(
  ({ relationId, rows }) => toLedger(relationId, rows),
);
