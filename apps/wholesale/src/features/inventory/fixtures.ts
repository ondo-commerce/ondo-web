import { PRODUCTS } from "@/features/product";
import type { StockMovement, StockMovementType } from "./types";

/*
 * 재고 변동 이력 목업. API가 붙으면 이 파일만 지운다.
 *
 * 이력은 SKU 하나마다 붙는 값이라 손으로 다 적으면 400줄이 넘는다. 그래서
 * **시드 기반 생성기 하나**로 만들고, Figma에 실제로 그려져 있는 한 줄
 * (SU-18 블랙/M)만 손으로 맞춘다.
 *
 * ⚠️ Math.random / Date.now 를 쓰지 않는다. 서버 렌더와 클라이언트 렌더가 다른
 *    값을 만들면 하이드레이션이 깨진다. 날짜도 UTC 기준으로만 만든다 —
 *    로컬 시간대로 포맷하면 서버(UTC)와 브라우저(KST)의 날짜가 하루 어긋난다.
 */

/** 정수 시드 → 32비트 해시 (murmur finalizer). product/fixtures.ts와 같은 함수지만
 *  feature 경계를 넘어 import 하지 않는다 — 목업끼리 의존을 만들지 않기 위해서다 */
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

/** SKU id(문자열) → 정수 시드. 같은 SKU는 언제 열어도 같은 이력을 갖는다 */
function stringSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** 하루(ms). 이력 날짜를 뒤로 물리는 데만 쓴다 */
const DAY = 86_400_000;

/** 목업 기준일 = Figma 예시의 최신 이력 날짜. "오늘"을 쓰면 렌더마다 값이 바뀐다 */
const BASE_DATE = Date.UTC(2023, 9, 24);

function utcDateLabel(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}.${month}.${day}`;
}

/* 입고가 절반, 나머지를 출고와 조정이 나눠 갖는다. 실제 창고의 빈도를 흉내낸 것 */
const TYPE_POOL: readonly StockMovementType[] = [
  "stockIn",
  "stockIn",
  "stockOut",
  "stockOut",
  "adjust",
];

/**
 * 현재고에서 **거꾸로 거슬러 올라가며** 이력을 만든다.
 * 앞에서부터 만들면 마지막 잔량이 현재고와 안 맞는다 — 이력은 지금 값을 설명하는
 * 기록이라 최신 행의 `변동 후 재고`가 현재고와 같아야 한다.
 */
function generateHistory(skuId: string, stock: number): StockMovement[] {
  const seed = stringSeed(skuId);
  // 8개 중 1개 꼴로 이력이 아예 없다 — 빈 상태 문구를 화면에서 확인하기 위한 것
  const count = hash(seed) % 8;

  const rows: StockMovement[] = [];
  let after = stock;
  let dateMs = BASE_DATE;

  for (let i = 0; i < count; i += 1) {
    const s = seed + i * 31;
    // 재고가 0인 시점에서 입고를 뒤로 돌리면 이전 재고가 음수가 된다
    const type =
      after === 0
        ? "stockOut"
        : (TYPE_POOL[hash(s) % TYPE_POOL.length] as StockMovementType);

    let deltaQty: number;
    if (type === "stockIn") {
      // 입고분은 지금 재고를 넘을 수 없다 (넘으면 입고 전 재고가 음수가 된다)
      deltaQty = between(1, Math.min(60, after), s + 2);
    } else if (type === "stockOut") {
      deltaQty = -between(1, 20, s + 2);
    } else {
      // 조정은 대부분 차감이다. 가산 조정은 지금 재고 안에서만 만든다
      const plus = hash(s + 3) % 4 === 0 && after > 0;
      deltaQty = plus
        ? between(1, Math.min(9, after), s + 4)
        : -between(1, 9, s + 4);
    }

    const beforeQty = after - deltaQty;
    rows.push({
      id: `${skuId}-${i}`,
      date: utcDateLabel(dateMs),
      type,
      beforeQty,
      deltaQty,
      afterQty: after,
    });

    after = beforeQty;
    dateMs -= DAY * between(1, 4, s + 5);
  }

  return rows;
}

/**
 * 손 작성분 — Figma `1599:657`의 이력 표 그대로다.
 *
 * ⚠️ Figma의 숫자는 서로 이어지지 않고(10.15의 84 → 10.18의 76) 최신 행의
 *    변동 후 재고 133도 이 SKU의 현재고 7과 다르다. 화면 실측의 기준점이라
 *    값은 그대로 두되, **다른 SKU는 생성기가 앞뒤가 맞는 이력을 만든다.**
 */
const HANDWRITTEN_HISTORY: Record<string, StockMovement[]> = {
  "SU-18-블랙-M": [
    {
      id: "SU-18-블랙-M-h0",
      date: "2023.10.24",
      type: "stockIn",
      beforeQty: 83,
      deltaQty: 50,
      afterQty: 133,
    },
    {
      id: "SU-18-블랙-M-h1",
      date: "2023.10.22",
      type: "stockOut",
      beforeQty: 91,
      deltaQty: -8,
      afterQty: 83,
    },
    {
      id: "SU-18-블랙-M-h2",
      date: "2023.10.20",
      type: "adjust",
      beforeQty: 96,
      deltaQty: -5,
      afterQty: 91,
    },
    {
      id: "SU-18-블랙-M-h3",
      date: "2023.10.18",
      type: "stockIn",
      beforeQty: 76,
      deltaQty: 20,
      afterQty: 96,
    },
    {
      id: "SU-18-블랙-M-h4",
      date: "2023.10.15",
      type: "stockOut",
      beforeQty: 96,
      deltaQty: -12,
      afterQty: 84,
    },
    {
      id: "SU-18-블랙-M-h5",
      date: "2023.10.12",
      type: "stockIn",
      beforeQty: 56,
      deltaQty: 40,
      afterQty: 96,
    },
    {
      id: "SU-18-블랙-M-h6",
      date: "2023.10.09",
      type: "stockOut",
      beforeQty: 96,
      deltaQty: -12,
      afterQty: 84,
    },
  ],
};

/** SKU id → 이력(최신순). 상품 더미가 고정이라 이 표도 모듈 로드 때 한 번만 만든다 */
const STOCK_HISTORY: Record<string, StockMovement[]> = Object.fromEntries(
  PRODUCTS.flatMap((p) => p.skus).map((s) => [
    s.id,
    HANDWRITTEN_HISTORY[s.id] ?? generateHistory(s.id, s.stock),
  ]),
);

/** 이력이 없는 SKU도 있다. 그 경우 빈 배열이고 화면은 빈 상태 문구를 그린다 */
export function stockHistory(skuId: string): StockMovement[] {
  return STOCK_HISTORY[skuId] ?? [];
}
