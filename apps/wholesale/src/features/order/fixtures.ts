import { PRODUCTS, type Sku } from "@/features/product";
import type {
  Order,
  OrderLine,
  OrderStatus,
  PackingBatchLine,
  PaymentMethod,
  ReceiveMethod,
  SettlementStatus,
} from "./types";

/*
 * 화면을 그리기 위한 목업. API가 붙으면 이 파일만 지운다.
 *
 * ⚠️ Math.random / Date.now 를 쓰지 않는다. 서버 렌더와 클라이언트 렌더가 다른 값을
 *    만들면 하이드레이션이 깨진다. 시드가 같으면 항상 같은 값이 나오는 해시만 쓴다
 *    (features/product/fixtures.ts와 같은 규칙).
 *
 * ⚠️ 더미라 로딩·에러 상태가 없다. 서버가 붙으면 ORDERS를 받는 자리(page.tsx)에서
 *    로딩 / 빈 목록 / 에러 세 갈래를 나눠야 한다.
 */

/** 정수 시드 → 32비트 해시 (murmur finalizer). product feature에서 복사해 왔다 —
 *  feature 경계를 넘어 import 하지 않는다(ESLint가 막는다) */
function hash(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return x >>> 0;
}

function pick<T>(list: readonly T[], seed: number): T {
  return list[hash(seed) % list.length] as T;
}

/** min~max(포함) 정수 */
function between(min: number, max: number, seed: number): number {
  return min + (hash(seed) % (max - min + 1));
}

/* --- 주문에 쓸 SKU 후보 --------------------------------------------------
 * 게시글이 붙은 상품의 SKU만 쓴다. 소매처는 마켓 게시글을 보고 주문하므로
 * 판매가가 0인(미게시) 상품은 주문 라인이 될 수 없다 — 단가를 지어내지 않기 위한 제약이다.
 * ---------------------------------------------------------------------- */
interface PoolItem {
  productName: string;
  sku: Sku;
}

const SKU_POOL: readonly PoolItem[] = PRODUCTS.filter(
  (p) => p.post !== null,
).flatMap((p) =>
  p.skus
    .filter((s) => s.price > 0)
    .map((s) => ({ productName: p.name, sku: s })),
);

const CUSTOMERS: readonly { name: string; contact: string }[] = [
  { name: "서울 유통", contact: "010-1234-5678" },
  { name: "동대문 패션", contact: "010-2345-6789" },
  { name: "부산 로드샵", contact: "010-3456-7890" },
  { name: "대구 편집샵", contact: "010-4567-8901" },
  { name: "광주 의류", contact: "010-5678-9012" },
  { name: "인천 모드", contact: "010-6789-0123" },
  { name: "수원 스타일", contact: "010-7890-1234" },
  { name: "제주 셀렉트", contact: "010-8901-2345" },
  { name: "청주 패션몰", contact: "010-9012-3456" },
  { name: "울산 어패럴", contact: "010-0123-4567" },
];

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BANK_TRANSFER"];
const RECEIVE_METHODS: readonly ReceiveMethod[] = [
  "AGENT_VISIT",
  "SELF_PICKUP",
];

/**
 * 상태별 건수를 **정확히** 맞춘다 — 필터 칩에 박히는 숫자(10/20/15/30)와 목록 행 수가
 * 어긋나면 칩을 신뢰할 수 없다. 만든 뒤 결정적으로 섞어 목록에 상태가 흩어지게 한다.
 */
const STATUS_PLAN: readonly OrderStatus[] = (() => {
  const plan: OrderStatus[] = [
    ...Array<OrderStatus>(10).fill("PLACED"),
    ...Array<OrderStatus>(20).fill("CONFIRMED"),
    ...Array<OrderStatus>(15).fill("PARTIALLY_SHIPPED"),
    ...Array<OrderStatus>(30).fill("SHIPPED"),
  ];
  // Fisher-Yates. 난수 대신 해시라 매번 같은 배열이 나온다
  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = hash(i * 37 + 11) % (i + 1);
    const a = plan[i] as OrderStatus;
    plan[i] = plan[j] as OrderStatus;
    plan[j] = a;
  }
  return plan;
})();

/** 주문 일시. 기준일에서 하루씩 거슬러 올라간다 (목록은 최신순) */
const BASE_DATE = new Date(2024, 7, 20);

function orderDate(index: number): string {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() - index);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${month}.${day}`;
}

/**
 * 라인의 `출고진행`을 상태에 맞게 정한다.
 * 확정 이후에는 **미할당이 곧 미송**이므로(01-pm.md §1.4) 미송은 여기서 따로 정하지 않고
 * `qty − allocatedQty`로 떨어진다.
 */
function allocatedFor(status: OrderStatus, qty: number, seed: number): number {
  switch (status) {
    case "PLACED":
    case "CANCELED":
      // 확정 전에는 아무것도 잡히지 않는다 (Figma 신규 프레임 3행은 목업 오류다 — §1.7)
      return 0;
    case "SHIPPED":
      return qty;
    default: {
      // 확정·부분출고는 세 모양이 다 나와야 한다: 전량 ✓ / 일부 / 전량 미송
      const shape = hash(seed) % 3;
      if (shape === 0) return qty;
      if (shape === 1) return 0;
      return between(1, Math.max(1, qty - 1), seed + 1);
    }
  }
}

function buildLine(
  orderIndex: number,
  lineIndex: number,
  status: OrderStatus,
): OrderLine {
  const item = pick(SKU_POOL, orderIndex * 101 + lineIndex * 7 + 3);
  const { sku } = item;
  const qty = between(1, 6, orderIndex * 53 + lineIndex * 13 + 5) * 5;
  const allocatedQty = allocatedFor(
    status,
    qty,
    orderIndex * 71 + lineIndex * 17 + 9,
  );
  // 부분 출고는 잡힌 수량 중 일부만 이미 나간 상태다. 출고 완료는 전량이 나갔다
  const shippedQty =
    status === "SHIPPED"
      ? qty
      : status === "PARTIALLY_SHIPPED"
        ? Math.floor(allocatedQty / 2)
        : 0;

  return {
    id: `${orderIndex}-${lineIndex}-${sku.id}`,
    skuId: sku.id,
    productName: item.productName,
    color: sku.color,
    size: sku.size,
    qty,
    allocatedQty,
    shippedQty,
    // 확정된 주문의 미할당은 전부 미송으로 확정돼 있다
    backorderQty:
      status === "PLACED" || status === "SHIPPED" ? 0 : qty - allocatedQty,
    unitPrice: sku.price,
    lineAmount: qty * sku.price,
    stockOnHand: sku.stock,
    /*
     * 주문처리중은 현재고를 넘지 않게 자른다. 상품 더미의 두 값은 서로 무관하게 만들어져서
     * 그대로 쓰면 `가용재고`(현재고 − 주문처리중)가 음수로 찍히는데, 그건 더미의 산물이지
     * 업무 상태가 아니다. 팔 수 없는 상태는 0으로 충분히 표현된다.
     */
    reservedQty: Math.min(sku.reservedQty, sku.stock),
  };
}

/**
 * 정산 상태. 정산 축은 이행 축과 독립이지만(`settlement_data_model.md` §3.2),
 * 더미에서는 출고가 끝난 주문에 정산 완료가 몰리게 둔다 — 실제 장부와 같은 분포다.
 */
function settlementFor(status: OrderStatus, seed: number): SettlementStatus {
  if (status === "SHIPPED") {
    return pick<SettlementStatus>(["SETTLED", "SETTLED", "PARTIAL"], seed);
  }
  if (status === "PARTIALLY_SHIPPED") {
    return pick<SettlementStatus>(["UNPAID", "PARTIAL"], seed);
  }
  return "UNPAID";
}

/**
 * 라인 수를 고정하는 두 건. 경계를 눈으로 확인하려면 **라인 1개짜리와 10개 넘는 주문이
 * 목록에 실제로 있어야 한다** — 첫 열이 2줄이라 라인이 많으면 표가 눌리기 쉽다.
 */
const LINE_COUNT_OVERRIDE: Readonly<Record<number, number>> = { 0: 1, 1: 12 };

/**
 * 더미로 이미 쌓여 있는 포장 대기 회차.
 *
 * 주문 탭에서 만든 것도 있고 미송 탭의 `배분 확정`으로 들어온 것도 있다 — 화면에서는
 * 구분되지 않는다(glossary §4.4의 포장 대기 2경로). 아직 안 나간 할당분
 * (`출고진행 − 출고완료`)을 최대 3회차로 나눠 담는다. Figma 부분 출고 프레임이
 * `#3` `#2` `#1` 세 장이라 그 밀도를 맞춘다.
 */
function initialBatches(orderId: string, lines: readonly OrderLine[]) {
  const pending = lines.filter((l) => l.allocatedQty - l.shippedQty > 0);
  if (pending.length === 0) return [];

  const groups: PackingBatchLine[][] = [[], [], []];
  pending.forEach((line, i) => {
    (groups[i % 3] as PackingBatchLine[]).push({
      lineId: line.id,
      skuId: line.skuId,
      label: `${line.productName} (${line.color} - ${line.size})`,
      qty: line.allocatedQty - line.shippedQty,
      /* 확정된 주문에서는 미할당이 곧 미송이라, 이 회차를 지우면 그만큼 미송으로
         되돌아가야 한다. derive.confirmOrder가 만드는 회차와 같은 규칙이다 */
      backorderUsed: line.allocatedQty - line.shippedQty,
    });
  });

  return groups
    .filter((g) => g.length > 0)
    .map((g, i) => ({ id: `${orderId}-B${i + 1}`, no: i + 1, lines: g }));
}

function buildOrder(index: number): Order {
  const status = STATUS_PLAN[index] as OrderStatus;
  const customer = pick(CUSTOMERS, index * 31 + 2);
  const lineCount = LINE_COUNT_OVERRIDE[index] ?? between(1, 4, index * 41 + 6);
  const lines = Array.from({ length: lineCount }, (_, i) =>
    buildLine(index, i, status),
  );
  const id = `ORD-${String(index + 1).padStart(3, "0")}`;
  // 출고 완료·신규·취소에는 대기 중인 포장이 없다 (다 나갔거나 아직 안 잡혔다)
  const batches = initialBatches(id, lines);

  return {
    id,
    placedAt: orderDate(index),
    customerName: customer.name,
    contact: customer.contact,
    paymentMethod: pick(PAYMENT_METHODS, index * 43 + 7),
    receiveMethod: pick(RECEIVE_METHODS, index * 47 + 8),
    status,
    settlementStatus: settlementFor(status, index * 59 + 10),
    lines,
    batches,
    // 번호는 재사용하지 않는다 — 이미 3회차가 있으면 다음은 #4다
    nextBatchNo: batches.length + 1,
  };
}

/** 주문 75건. 상태별로 신규 10 / 확정 20 / 부분출고 15 / 출고완료 30 이다 */
export const ORDERS: readonly Order[] = Array.from({ length: 75 }, (_, i) =>
  buildOrder(i),
);
