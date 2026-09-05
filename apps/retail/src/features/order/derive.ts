import type { PageMeta } from "@ondo/api";
import { QTY_UNIT } from "@/shared/qty";
import {
  AGENT_NAME_MAX,
  CHECKOUT_BLOCKED,
  DEFAULT_ORDER_SORT,
  DEFAULT_PERIOD,
  FILTER_ALL,
  FIRST_PAGE,
  LINE_PENDING_NOTE,
  ORDER_PATH,
  PAYMENT_LABEL,
  PERIODS,
  PICKUP_LABEL,
  backorderNote,
} from "./constants";
import type {
  BankAccount,
  CancelLock,
  CheckoutGroup,
  CheckoutWire,
  OrderDetailWire,
  OrderFilter,
  OrderItemWire,
  OrderLeg,
  OrderLine,
  OrderLineStatus,
  OrderPage,
  OrderRecord,
  OrderSort,
  OrderStatus,
  OrderSummary,
  OrderSummaryWire,
  PaymentChoice,
  PaymentMethod,
  PickupChoice,
  PickupMethod,
  PlaceOrderLegResult,
  PlaceOrderRequest,
  PlaceOrderResult,
  ProductLine,
  RejectedLeg,
  Shipment,
  ShipmentLine,
  WholesalerOrderWire,
  WholesalerWithBankWire,
} from "./types";

/**
 * 주문 화면들의 파생값. **JSX 안에서 더하지 않는다.**
 *
 * 이 파일이 있는 이유는 둘이다.
 * ① wire → 뷰 변환이 전부 여기 있다(`toCheckoutGroups` · `toOrderSummary` ·
 *    `toOrderDetail`). null 좁힘·단위·상태 판정이 한 곳이라 화면은 wire 모양을 모른다.
 * ② 요약·툴바 카운터·표·합계가 **같은 집합 하나**에서 나온다. 앞 회차에서
 *    "도매처 소계 327,000인데 입금액 318,000"이 반복해서 걸렸다 — 두 자리가
 *    서로 다른 값을 읽어서 생긴 일이다.
 */

/** 12,500 → `12,500원`. 금액 표기가 화면마다 갈리지 않게 여기 한 곳을 쓴다 */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** `46장` */
export function formatSheets(sheets: number): string {
  return `${sheets}${QTY_UNIT}`;
}

/** 행 금액 = 판매가 × 장수 */
export function lineAmount(line: ProductLine): number {
  return line.price * line.qty;
}

export interface OrderTotals {
  /** 조합 수(색상 × 사이즈). 장 수가 아니다 */
  comboCount: number;
  sheets: number;
  amount: number;
}

/**
 * 줄 묶음 하나의 합. 도매처 상자 머리 · 결제 요약 · 합계 바 · 완료 화면의
 * 입금액 · 상세의 요약 카드와 `<tfoot>`이 **전부 이 함수 하나**를 부르고,
 * 무엇을 넣어 부르는지만 다르다.
 *
 * 서버의 `subtotal`·`totalAmount`·`lineAmount`를 쓰지 않는다 — 한 화면 안의 세 자리가
 * 같은 규칙으로 나와야 하고, 목 데이터에서 이미 `totalAmount`(148,000)와 라인 합
 * (62,500)이 달랐다(`04-wire.md` §3).
 */
export function totalsOf(lines: readonly ProductLine[]): OrderTotals {
  return lines.reduce<OrderTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + line.qty,
      amount: acc.amount + lineAmount(line),
    }),
    { comboCount: 0, sheets: 0, amount: 0 },
  );
}

/** `3개 조합 · 26장` — 도매처 상자 머리 우측. 장바구니 그룹 머리와 같은 표기다 */
export function comboSheetsLabel(totals: OrderTotals): string {
  return `${totals.comboCount}개 조합 · ${formatSheets(totals.sheets)}`;
}

/* ────────────────────────────────────────────────────────────────────────
   시각 — 서버는 오프셋 붙은 date-time을 준다. 화면은 KST 글자만 본다
   ──────────────────────────────────────────────────────────────────────── */

/** 한국 표준시 오프셋. DST가 없어 상수로 둔다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

/**
 * ISO date-time(오프셋 포함) → 한국 시각 `2026.09.02 14:20`.
 *
 * 서버의 `orderedAt`은 `OffsetDateTime`이라 `+09:00`일 수도 `Z`일 수도 있다. 앞을
 * 그냥 자르면 UTC로 온 밤 주문이 하루 전 날짜가 된다. `Intl`을 안 쓰는 이유는
 * 서버(Node)와 브라우저의 ICU 데이터가 갈릴 수 있어서다 — 오프셋 덧셈은 어디서나
 * 같은 답을 낸다(`features/backorder`와 같은 규칙. feature끼리 import 하지 않는다).
 */
export function formatKstDateTime(isoDateTime: string): string {
  const at = new Date(Date.parse(isoDateTime) + KST_OFFSET_MS);
  return (
    `${at.getUTCFullYear()}.${pad(at.getUTCMonth() + 1, 2)}.${pad(at.getUTCDate(), 2)} ` +
    `${pad(at.getUTCHours(), 2)}:${pad(at.getUTCMinutes(), 2)}`
  );
}

/** `2026-09-08` → `2026.09.08`. 날짜 표기가 화면마다 갈리지 않게 여기 한 곳을 쓴다 */
export function formatDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
}

/**
 * 기간 축 → 서버 `from`(`YYYY-MM-DD`, KST). `전체 기간`이면 undefined라 안 보낸다.
 *
 * "최근 N개월"을 **요청 시점의 오늘**에서 센다. fixtures 시절엔 고정 날짜였지만
 * 지금은 서버가 기간을 거르고 오늘은 page가 준다.
 */
export function periodFrom(period: string, now: Date): string | undefined {
  const months = PERIODS.find((p) => p.value === period)?.months ?? null;
  if (months === null) return undefined;

  const at = new Date(now.getTime() + KST_OFFSET_MS);
  at.setUTCMonth(at.getUTCMonth() - months);
  return at.toISOString().slice(0, 10);
}

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰. 화면은 wire 모양을 모른다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 도매처 + 계좌. `storeBuilding`·`storeUnit`·계좌 셋은 생성 타입상 non-optional이지만
 * 스펙 설명대로 null이 온다(계좌 미등록 도매처). 여기서 한 번만 좁힌다.
 */
function toWholesaler(wire: WholesalerWithBankWire): {
  id: string;
  name: string;
  location: string;
  bank: BankAccount | null;
} {
  const bankName = wire.bankName ?? null;
  const accountNo = wire.bankAccountNo ?? null;
  const holder = wire.bankAccountHolder ?? null;

  return {
    id: String(wire.id),
    name: wire.name ?? "",
    location: [wire.storeBuilding ?? "", wire.storeUnit ?? ""]
      .filter((part) => part !== "")
      .join(" "),
    /* 셋이 전부 있어야 계좌다. 하나라도 비면 사장이 엉뚱한 계좌로 보낸다 */
    bank:
      bankName !== null && accountNo !== null && holder !== null
        ? { bankName, accountNo, holder }
        : null,
  };
}

/** `GET /checkout` → 도매처 상자 목록. 서버가 도매처별로 묶어 준 순서 그대로다 */
export function toCheckoutGroups(wire: CheckoutWire): CheckoutGroup[] {
  return wire.groups.map((group) => {
    const wholesaler = toWholesaler(group.wholesaler);

    return {
      wholesalerId: wholesaler.id,
      wholesalerName: wholesaler.name,
      wholesalerLocation: wholesaler.location,
      bank: wholesaler.bank,
      lines: group.items.map((item) => ({
        lineId: String(item.cartItemId),
        cartItemId: item.cartItemId,
        variantId: item.variantId,
        wholesalerId: wholesaler.id,
        productName: item.title ?? "",
        colorLabel: item.colorName ?? "",
        size: item.size ?? "",
        price: item.salePrice ?? 0,
        qty: item.qty ?? 0,
      })),
    };
  });
}

/** `GET /orders` 한 줄 → 목록 한 줄 */
export function toOrderSummary(wire: OrderSummaryWire): OrderSummary {
  return {
    orderId: wire.orderId,
    orderNo: wire.orderNo,
    orderedAt: formatKstDateTime(wire.orderedAt),
    orderedAtMs: Date.parse(wire.orderedAt),
    totalAmount: wire.totalAmount,
    totalQty: wire.totalQty,
    receivedQty: wire.receivedQty ?? 0,
    backorderQty: wire.backorderQty ?? 0,
    wholesalerCount: wire.wholesalerCount,
    wholesalerNames: wire.wholesalerNames ?? [],
    status: wire.actionBadge,
  };
}

/** 서버 `meta`(0-base) → 화면 페이지 위치(1-base) */
export function toOrderPage(meta: PageMeta): OrderPage {
  return {
    page: meta.page + 1,
    totalPages: meta.totalPages,
    totalElements: meta.totalElements,
  };
}

/** 장끼 품목과 주문 라인을 잇는 키. 스펙에 라인 id가 없어 상품·색·사이즈로 맞춘다 */
function skuKey(line: { title: string; colorName: string; size: string }) {
  return `${line.title}|${line.colorName}|${line.size}`;
}

/**
 * 라인 하나의 상태. **수량 셋과 도매처 건 상태에서 판정한다** — 서버 층 3은
 * 상태 이름 없이 "주문 5 · 받음 3 · 미송 2"로 말한다(스펙).
 *
 * 위에서부터 처음 맞는 것. 취소가 먼저인 이유는 취소된 건의 수량은 의미가
 * 없어서고, 다 받은 것이 그다음인 이유는 끝난 줄에 미송 얘기를 할 필요가
 * 없어서다. `수령 가능`은 **포장은 끝났는데 아직 안 나간 장끼**(`shippedAt: null`)에
 * 실린 줄이다 — §3-0 C(소매 `수령 가능` = 도매 `출고 대기`)와 맞는다.
 */
function lineStatusOf(
  item: OrderItemWire,
  legStatusKey: string,
  packed: ReadonlySet<string>,
): OrderLineStatus {
  const qty = item.qty ?? 0;
  const received = item.receivedQty ?? 0;
  const backorder = item.backorderQty ?? 0;

  if (legStatusKey === "CANCELLED") return "CANCELED";
  if (qty > 0 && received >= qty) return "SHIPPED";
  if (packed.has(skuKey(item))) return "READY";
  if (backorder > 0) return "BACKORDER";
  if (received > 0) return "PARTIAL";
  if (legStatusKey === "NEW") return "PENDING";
  return "PREPARING";
}

function toOrderLeg(wire: WholesalerOrderWire): OrderLeg {
  const wholesaler = toWholesaler(wire.wholesaler);
  const statusKey = wire.status?.key ?? "";

  return {
    wholesaleOrderId: wire.wholesaleOrderId,
    wholesalerId: wholesaler.id,
    wholesalerName: wholesaler.name,
    wholesalerLocation: wholesaler.location,
    bank: wholesaler.bank,
    legNo: wire.orderNumber,
    statusKey,
    statusLabel: wire.status?.label ?? "",
    canceled: statusKey === "CANCELLED",
    cancellable: wire.isCancellable ?? false,
    pickup: wire.receiveMethod,
    payment: wire.paymentTerm,
  };
}

/**
 * `GET /orders/{orderId}` → 상세 한 장. 도매처별 건 안에 있던 라인과 장끼를
 * **평평하게 편다** — 표·출고 기록·요약 카드가 도매처를 가로질러 세기 때문이다.
 * 어느 도매처 것인지는 각 줄의 `wholesalerId`가 든다.
 */
export function toOrderDetail(wire: OrderDetailWire): OrderRecord {
  const legs: OrderLeg[] = [];
  const lines: OrderLine[] = [];
  const shipments: Shipment[] = [];

  for (const wholesalerOrder of wire.wholesalerOrders ?? []) {
    const leg = toOrderLeg(wholesalerOrder);
    legs.push(leg);

    const items = wholesalerOrder.items ?? [];
    const outbounds = wholesalerOrder.outbounds ?? [];

    /* 포장만 끝난 장끼에 실린 SKU. 그 줄이 `수령 가능`이다 */
    const packed = new Set<string>();
    for (const outbound of outbounds) {
      if ((outbound.shippedAt ?? null) !== null) continue;
      for (const item of outbound.items ?? []) packed.add(skuKey(item));
    }

    /* 장끼 품목의 단가는 스펙에 없다 — 같은 도매처 건의 주문 라인에서 찾는다 */
    const unitPrice = new Map<string, number>();
    for (const item of items) unitPrice.set(skuKey(item), item.unitPrice ?? 0);

    items.forEach((item, index) => {
      lines.push({
        lineId: `${wholesalerOrder.wholesaleOrderId}-${index}`,
        wholesalerId: leg.wholesalerId,
        productId: String(item.listingId ?? ""),
        productName: item.title ?? "",
        colorLabel: item.colorName ?? "",
        size: item.size ?? "",
        price: item.unitPrice ?? 0,
        qty: item.qty ?? 0,
        receivedQty: item.receivedQty ?? 0,
        backorderQty: item.backorderQty ?? 0,
        expectedInboundDate: item.expectedInboundDate ?? null,
        status: lineStatusOf(item, leg.statusKey, packed),
      });
    });

    for (const outbound of outbounds) {
      const shippedAt = outbound.shippedAt ?? null;
      shipments.push({
        outboundId: outbound.outboundId,
        statementNo: outbound.statementNumber ?? "",
        wholesalerId: leg.wholesalerId,
        shippedAt: shippedAt === null ? null : formatKstDateTime(shippedAt),
        lines: (outbound.items ?? []).map<ShipmentLine>((item) => {
          const price = unitPrice.get(skuKey(item));
          return {
            productName: item.title ?? "",
            colorLabel: item.colorName ?? "",
            size: item.size ?? "",
            qty: item.qty ?? 0,
            price: price ?? 0,
            priceKnown: price !== undefined,
          };
        }),
      });
    }
  }

  return {
    orderId: wire.orderId,
    orderNo: wire.orderNo,
    orderedAt: formatKstDateTime(wire.orderedAt),
    agentName: wire.agentName ?? "",
    agentPhone: wire.agentPhone ?? "",
    legs,
    lines,
    shipments,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   상자 안 묶기 — 도매처 상자 안에서 상품으로 한 겹 더.
   ──────────────────────────────────────────────────────────────────────── */

/** 도매처 상자 안의 상품 한 덩어리. 옵션은 줄이 아니라 **한 줄로 이어 붙는다** */
export interface ProductBlock {
  productName: string;
  /** `체리레드 · S · 10장 / 체리레드 · M · 6장 / 딥네이비 · L · 10장` */
  options: string;
  amount: number;
}

/**
 * 도매처 상자 안을 상품으로 한 번 더 묶는다. 상품 id가 주문서 응답(`CheckoutItem`)에
 * 없어서 **상품명이 키**다.
 *
 * 조합마다 한 줄씩 그리지 않는 것이 원본의 선택이다 — 주문서는 **고칠 수 없는
 * 명세**라서, 사장이 확인해야 하는 단위가 "무슨 상품을 얼마어치"이지 조합
 * 하나하나가 아니다. 조합별 수량은 옵션 줄이 그대로 말한다.
 */
export function productBlocks(lines: readonly ProductLine[]): ProductBlock[] {
  const blocks: ProductBlock[] = [];
  const index = new Map<string, number>();

  for (const line of lines) {
    const option = `${line.colorLabel} · ${line.size} · ${formatSheets(line.qty)}`;
    const at = index.get(line.productName);

    if (at === undefined) {
      index.set(line.productName, blocks.length);
      blocks.push({
        productName: line.productName,
        options: option,
        amount: lineAmount(line),
      });
      continue;
    }

    /* noUncheckedIndexedAccess: 방금 넣은 자리라 있는 게 확실하지만 타입상으로는
       undefined다. 조용히 !로 지우지 않고 건너뛴다 */
    const block = blocks[at];
    if (block) {
      block.options = `${block.options} / ${option}`;
      block.amount += lineAmount(line);
    }
  }

  return blocks;
}

/* ────────────────────────────────────────────────────────────────────────
   수령 · 결제 — 일괄 값 하나와 도매처별 재정의 집합에서 계산해서 나온다.
   도매처마다 확정된 값을 복사해 두면 일괄 설정을 바꿨을 때 무엇이 따라와야
   하는지 알 수 없다.
   ──────────────────────────────────────────────────────────────────────── */

/** 이 도매처에 실제로 걸리는 수령 방법 */
export function resolvePickup(
  choice: PickupChoice | undefined,
  bulk: PickupMethod,
): PickupMethod {
  return choice === undefined || choice === "BULK" ? bulk : choice;
}

/**
 * 이 도매처에 실제로 걸리는 결제 방법.
 *
 * **계좌 미등록 도매처는 현금뿐이다**(스펙 `WholesalerWithBank`: "프론트가 현금만
 * 남긴다"). 일괄 설정이 계좌 이체여도 그 도매처는 현금으로 떨어진다 — 안 그러면
 * 없는 계좌로 입금 안내가 나간다.
 */
export function resolvePayment(
  choice: PaymentChoice | undefined,
  bulk: PaymentMethod,
  bankRegistered: boolean,
): PaymentMethod {
  if (!bankRegistered) return "CASH";
  return choice === undefined || choice === "BULK" ? bulk : choice;
}

/** `직접 수령 · 계좌 이체` — 완료 화면 `foot` 좌측 */
export function methodLabel(
  pickup: PickupMethod,
  payment: PaymentMethod,
): string {
  return `${PICKUP_LABEL[pickup]} · ${PAYMENT_LABEL[payment]}`;
}

/**
 * 개별로 정해 둔 도매처 수. `전체 적용`이 무엇을 덮는지 **누르기 전에** 말한다.
 *
 * 대상을 DOM이 아니라 이 목록에서 센다 — 상자가 접혀 있거나 화면 밖에 있어도
 * 같은 수가 나와야 한다(반복결함 "가려진 대상에 실행이 걸림"의 뒤집힌 짝).
 */
export function overriddenWholesalers(
  groups: readonly CheckoutGroup[],
  pickupOverrides: Readonly<Record<string, PickupChoice>>,
  paymentOverrides: Readonly<Record<string, PaymentChoice>>,
): string[] {
  return groups
    .map((group) => group.wholesalerId)
    .filter(
      (id) =>
        (pickupOverrides[id] ?? "BULK") !== "BULK" ||
        (paymentOverrides[id] ?? "BULK") !== "BULK",
    );
}

/**
 * 사입삼촌 정보가 필수인가. **한 도매처라도** 사입삼촌 방문이면 필수다(RT-38).
 * 전부 직접 수령이면 안 받는다 — 안 쓸 값을 받아 두면 장끼에 엉뚱한 수령인이 적힌다.
 */
export function needsAgent(
  groups: readonly CheckoutGroup[],
  pickupOverrides: Readonly<Record<string, PickupChoice>>,
  bulkPickup: PickupMethod,
): boolean {
  return groups.some(
    (group) =>
      resolvePickup(pickupOverrides[group.wholesalerId], bulkPickup) ===
      "AGENT",
  );
}

/** 연락처 형식. 국번은 2~3자리(02 · 031 · 010)까지 받는다 */
const PHONE_SHAPE = /^0\d{1,2}-\d{3,4}-\d{4}$/;

/**
 * **판정할 때만 쓰는 사본**을 만든다. 화면에 남는 값은 이 함수가 건드리지 않는다.
 *
 * 구분자(`.`·공백·`/`)를 하이픈으로 바꾸고, 구분자가 아예 없는 가장 흔한 입력
 * (`01012345678`)에만 하이픈을 끼운다. 국번 길이는 자리수로 갈린다 — 11자리는
 * 3-4-4, 10자리는 `02`로 시작하면 2-4-4, 아니면 3-3-4다. 그 밖의 값은 그대로
 * 돌려준다: 12자리를 억지로 끼워 맞추면 무엇이 틀렸는지 말할 수 없게 된다.
 *
 * 규칙은 `features/account`의 `normalizePhone`과 같은 것을 쓴다. **그 feature를
 * import 하지는 않는다** — feature끼리 수평 참조를 만들지 않는다는 규칙이 먼저다.
 */
function phoneShapeOf(raw: string): string {
  const separated = raw.trim().replace(/[.\s/]+/g, "-");
  if (!/^\d{10,11}$/.test(separated)) return separated;

  if (separated.length === 11) {
    return `${separated.slice(0, 3)}-${separated.slice(3, 7)}-${separated.slice(7)}`;
  }
  if (separated.startsWith("02")) {
    return `${separated.slice(0, 2)}-${separated.slice(2, 6)}-${separated.slice(6)}`;
  }
  return `${separated.slice(0, 3)}-${separated.slice(3, 6)}-${separated.slice(6)}`;
}

/**
 * 연락처 칸이 받을 수 있는 값인가.
 *
 * **못 받는 형식이어도 값을 고치지 않는다.** 하이픈을 조용히 지우면 사장은
 * 자기가 무엇을 쳤는지 못 보고, `010 1234 5678`이 `01012345678`이 되어도
 * 그게 자기 입력인지 화면이 고친 것인지 알 수 없다. 판정만 하고 값은 그대로 둔다.
 *
 * 글자 종류만 보던 규칙(`/^[\d-]+$/`)으로는 **`-` 한 글자가 통과했다**(F6).
 * 빈 값은 여기서 통과시킨다 — 비었다는 사실은 `checkoutBlockedReason`이
 * 따로 말한다. 아직 아무것도 안 친 칸에 빨간 글자를 띄우지 않는다.
 */
export function isPhoneAcceptable(raw: string): boolean {
  const text = raw.trim();
  return text === "" || PHONE_SHAPE.test(phoneShapeOf(text));
}

/**
 * 수령인 이름 칸이 받을 수 있는 값인가.
 *
 * ① **글자나 숫자가 한 자는 있어야 한다** — `-`·`.`처럼 부호만 있는 값이
 * 통과하면 장끼에 `수령인 -`이 찍힌다(F6). ② 상한이 있다 — 상한이 없으면
 * 80자짜리 이름이 문서 한 줄을 밀어낸다. **넘는 글자를 잘라내지 않는다.**
 */
export function isAgentNameAcceptable(raw: string): boolean {
  const text = raw.trim();
  return (
    text === "" || (text.length <= AGENT_NAME_MAX && /[\p{L}\p{N}]/u.test(text))
  );
}

/**
 * `주문 접수하기`를 못 누르는 이유. null이면 누를 수 있다.
 *
 * 순서가 곧 우선순위다 — 주문할 것이 없으면 수령인 얘기를 할 차례가 아니다.
 */
export function checkoutBlockedReason(input: {
  lineCount: number;
  agentRequired: boolean;
  agentName: string;
  agentPhone: string;
}): string | null {
  if (input.lineCount === 0) return CHECKOUT_BLOCKED.empty;

  if (
    input.agentRequired &&
    (input.agentName.trim() === "" ||
      input.agentPhone.trim() === "" ||
      !isAgentNameAcceptable(input.agentName) ||
      !isPhoneAcceptable(input.agentPhone))
  ) {
    return CHECKOUT_BLOCKED.agent;
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   접수 — 주문서에서 고른 것을 서버 요청으로, 서버 결과를 화면 값으로
   ──────────────────────────────────────────────────────────────────────── */

/** 주문서에서 고른 값 한 벌. 스토어가 들고 있고 요청을 만들 때 읽는다 */
export interface CheckoutSetting {
  bulkPickup: PickupMethod;
  bulkPayment: PaymentMethod;
  pickupOverrides: Readonly<Record<string, PickupChoice>>;
  paymentOverrides: Readonly<Record<string, PaymentChoice>>;
  agentName: string;
  agentPhone: string;
}

/**
 * `POST /orders` 본문. **화면에 보이는 값 그대로**를 보낸다 — 도매처 상자의
 * 드롭다운이 보여 주는 수령·결제와 같은 `resolvePickup`·`resolvePayment`를 부른다.
 *
 * 사입삼촌 정보는 필요할 때(한 곳이라도 사입삼촌 방문)만 싣는다. 직접 수령만인데
 * 칸에 남아 있던 글자를 보내면 장끼에 엉뚱한 수령인이 적힌다.
 */
export function toPlaceOrderRequest(
  groups: readonly CheckoutGroup[],
  setting: CheckoutSetting,
): PlaceOrderRequest {
  const agentRequired = needsAgent(
    groups,
    setting.pickupOverrides,
    setting.bulkPickup,
  );

  return {
    cartItemIds: groups.flatMap((group) =>
      group.lines.map((line) => line.cartItemId),
    ),
    wholesalerOptions: groups.map((group) => ({
      wholesalerId: Number(group.wholesalerId),
      receiveMethod: resolvePickup(
        setting.pickupOverrides[group.wholesalerId],
        setting.bulkPickup,
      ),
      paymentTerm: resolvePayment(
        setting.paymentOverrides[group.wholesalerId],
        setting.bulkPayment,
        group.bank !== null,
      ),
    })),
    ...(agentRequired
      ? {
          agentName: setting.agentName.trim(),
          agentPhone: setting.agentPhone.trim(),
        }
      : {}),
  };
}

/**
 * 접수 응답에서 **안 된 도매처**만 남긴다. 완료 화면은 `GET /orders/{id}`로 그리는데
 * 안 된 도매처는 거기 없어서 이것만 세션에 든다. 다시 주문서로 갈 `cartItemIds`는
 * 주문서가 알던 그룹에서 붙인다 — 응답에는 없다.
 */
export function rejectedLegsOf(
  result: PlaceOrderResult,
  groups: readonly CheckoutGroup[],
): RejectedLeg[] {
  const byWholesaler = new Map(
    groups.map((group) => [group.wholesalerId, group] as const),
  );

  return (result.results ?? [])
    .filter((leg: PlaceOrderLegResult) => !(leg.isAccepted ?? false))
    .map((leg) => {
      const id = String(leg.wholesalerId);
      const group = byWholesaler.get(id);
      return {
        wholesalerId: id,
        wholesalerName: leg.wholesalerName ?? group?.wholesalerName ?? "",
        message: leg.message ?? "",
        cartItemIds: group?.lines.map((line) => line.cartItemId) ?? [],
      };
    });
}

/** `?ids=771,772` → `[771, 772]`. 숫자가 아닌 것·중복은 버린다 */
export function resolveCheckoutIds(
  params: Record<string, string | string[] | undefined>,
): number[] {
  const raw = Array.isArray(params.ids) ? params.ids[0] : params.ids;
  if (!raw) return [];

  const ids = new Set<number>();
  for (const part of raw.split(",")) {
    const value = Number(part.trim());
    if (Number.isInteger(value) && value > 0) ids.add(value);
  }
  return [...ids];
}

/** `?orderId=5012` → `5012`. 없거나 숫자가 아니면 null */
export function resolveOrderId(
  raw: string | string[] | undefined,
): number | null {
  const one = Array.isArray(raw) ? raw[0] : raw;
  const value = Number(one);
  return one !== undefined && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 목록 한 줄과 상세 한 장.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 주문 하나의 합. **금액은 라인에서 나온다** — 요약 카드·표 `<tfoot>`·완료 화면
 * 합계가 전부 이 값을 읽으므로 세 자리가 다른 금액을 말할 수 없다.
 */
export function orderTotals(order: OrderRecord): OrderTotals {
  return totalsOf(order.lines);
}

/** `무드온 외 1곳` — 도매처가 하나면 이름만. 목록(요약)과 상세(도매처 건)가 같이 쓴다 */
export function wholesalerLabel(input: {
  names: readonly string[];
  count: number;
}): { head: string; rest: string | null } {
  return {
    head: input.names[0] ?? "",
    rest: input.count > 1 ? `외 ${input.count - 1}곳` : null,
  };
}

export function summaryWholesalerLabel(summary: OrderSummary) {
  return wholesalerLabel({
    names: summary.wholesalerNames,
    count: summary.wholesalerCount,
  });
}

export function detailWholesalerLabel(order: OrderRecord) {
  return wholesalerLabel({
    names: order.legs.map((leg) => leg.wholesalerName),
    count: order.legs.length,
  });
}

/** 목록 출고 칸 `3장 / 12장`. 받은 장수는 서버 값이다 */
export function receivedLabel(summary: OrderSummary): string {
  return `${formatSheets(summary.receivedQty)} / ${formatSheets(summary.totalQty)}`;
}

export interface ShipmentProgress {
  /** 나갈 도매처 건수 = 취소되지 않은 도매처 건수 */
  planned: number;
  /** 그중 장끼가 한 장이라도 나간 도매처 건수 */
  done: number;
}

/**
 * `3건 중 2건`. **여기서 `건`은 도매처 한 곳의 출고 건이다.**
 *
 * 단위를 이 주석 하나에 못박는 이유는, 같은 낱말이 화면마다 다른 것을 세고
 * 있었기 때문이다(F8). 지금은 **`건`이 도매처 건 하나만 가리키고**, 라인은
 * `라인 N개`, 장끼는 `장끼 N장`으로 따로 말한다.
 */
export function shipmentProgress(order: OrderRecord): ShipmentProgress {
  const shipped = new Set(order.shipments.map((s) => s.wholesalerId));

  return {
    planned: order.legs.filter((leg) => !leg.canceled).length,
    done: order.legs.filter(
      (leg) => !leg.canceled && shipped.has(leg.wholesalerId),
    ).length,
  };
}

/**
 * 장끼 한 장의 금액. **단가를 모르는 줄이 하나라도 있으면 null**이다 — 스펙
 * `OutboundItem`에 단가가 없어 주문 라인에서 찾아 채우는데, 못 찾은 줄을 0원으로
 * 더하면 틀린 금액이 맞는 것처럼 선다.
 */
export function shipmentAmount(shipment: Shipment): number | null {
  let sum = 0;
  for (const line of shipment.lines) {
    if (!line.priceKnown) return null;
    sum += lineAmount(line);
  }
  return sum;
}

/**
 * 미수 잔액. **출고된 건의 금액 합이다**(RT-64) — 주문 금액 전체가 아니다.
 * 미수는 물건이 나갈 때 생긴다. 입금 배정은 이 응답에 없어 빼지 않는다(§3-0 D).
 * 어느 장끼라도 금액을 모르면 null — 화면은 `—`로 그린다.
 */
export function unpaidAmount(order: OrderRecord): number | null {
  let sum = 0;
  for (const shipment of order.shipments) {
    const amount = shipmentAmount(shipment);
    if (amount === null) return null;
    sum += amount;
  }
  return sum;
}

/**
 * 이 출고까지의 **남은 미수**. 장끼 모달의 마지막 줄이 읽는다.
 *
 * 출고 순서대로 쌓아 올린 값이다 — 미수는 출고 시점에 생기므로(RT-64) 그
 * 장끼가 나갔을 때의 잔액은 그때까지 나간 것의 합이다.
 */
export function unpaidAfter(
  order: OrderRecord,
  statementNo: string,
): number | null {
  let sum = 0;
  for (const shipment of order.shipments) {
    const amount = shipmentAmount(shipment);
    if (amount === null) return null;
    sum += amount;
    if (shipment.statementNo === statementNo) break;
  }

  return sum;
}

/**
 * `주문 취소`가 잠긴 **이유**. null이면 안 잠겼다.
 *
 * 취소는 도매처별이고 **`isCancellable`은 서버 판정**이다(스펙: NEW일 때만 true).
 * 한 건이라도 취소할 수 있으면 열려 있다 — 다른 건이 이미 확정됐어도 그렇다.
 * 잠기는 사유가 셋인데 안내 문구가 한 벌이면 셋이 같은 말을 한다(F3).
 */
export function cancelLockReason(order: OrderRecord): CancelLock | null {
  if (order.legs.length === 0) return "EMPTY";
  if (order.legs.every((leg) => leg.canceled)) return "CANCELED";
  if (order.legs.some((leg) => leg.cancellable)) return null;
  if (order.shipments.length > 0) return "SHIPPED";
  return "CONFIRMED";
}

/** 이 주문을 취소할 수 있는가. 잠긴 이유와 **같은 판정 하나**에서 나온다 */
export function isCancelable(order: OrderRecord): boolean {
  return cancelLockReason(order) === null;
}

/** 취소 요청에 실을 도매처 건. 서버가 취소할 수 있다고 한 것만 보낸다 */
export function cancellableLegIds(order: OrderRecord): number[] {
  return order.legs
    .filter((leg) => leg.cancellable)
    .map((leg) => leg.wholesaleOrderId);
}

/**
 * 라인 상태 아래 12px 둘째 줄. 없으면 안 붙는다.
 *
 * 수량으로 말한다 — 서버 층 3이 그렇다. `받음 3장 · 미송 2장 · 예상 입고 2026.09.08`.
 * 주소는 **도매처 건에서** 만든다 — 라인 표와 `결제 · 수령` 패널이 같은 `leg`를
 * 읽어야 같은 글자가 나온다.
 */
export function lineStatusNote(
  line: OrderLine,
  leg: OrderLeg | undefined,
): string | null {
  switch (line.status) {
    case "PENDING":
      return LINE_PENDING_NOTE;
    case "READY":
      return leg
        ? `${PICKUP_LABEL[leg.pickup]} · ${leg.wholesalerLocation}`
        : null;
    case "BACKORDER":
    case "PARTIAL": {
      const parts: string[] = [];
      if (line.receivedQty > 0)
        parts.push(`받음 ${formatSheets(line.receivedQty)}`);
      if (line.backorderQty > 0) parts.push(backorderNote(line.backorderQty));
      if (line.expectedInboundDate !== null) {
        parts.push(`예상 입고 ${formatDate(line.expectedInboundDate)}`);
      }
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    default:
      return null;
  }
}

/** 미송으로 넘어간 라인 수. 요약 카드의 `미송 라인 N개 대기 중`이 이걸 센다 */
export function backorderCount(order: OrderRecord): number {
  return order.lines.filter((line) => line.backorderQty > 0).length;
}

/** 주문 상세 부제 `2026.09.02 14:20 · 무드온 외 1곳 · 라인 5개 · 총 62장` */
export function detailSubtitle(order: OrderRecord): string {
  const seller = detailWholesalerLabel(order);
  const totals = orderTotals(order);
  const who = seller.rest ? `${seller.head} ${seller.rest}` : seller.head;

  return `${order.orderedAt} · ${who} · 라인 ${totals.comboCount}개 · 총 ${formatSheets(totals.sheets)}`;
}

/** 도매처 한 건에 걸린 라인만 */
export function legLines(
  order: OrderRecord,
  wholesalerId: string,
): OrderLine[] {
  return order.lines.filter((line) => line.wholesalerId === wholesalerId);
}

/**
 * 도매처 한 건을 상자(`WholesalerOrderCard`)가 읽는 모양으로. 완료 화면이 상세
 * 응답으로 주문서와 같은 상자를 그린다 — 접수 전후로 명세가 달라 보이면 사장이
 * 무엇이 접수됐는지 다시 대조해야 한다.
 */
export function legGroup(order: OrderRecord, leg: OrderLeg): CheckoutGroup {
  return {
    wholesalerId: leg.wholesalerId,
    wholesalerName: leg.wholesalerName,
    wholesalerLocation: leg.wholesalerLocation,
    bank: leg.bank,
    lines: legLines(order, leg.wholesalerId).map((line) => ({
      lineId: line.lineId,
      cartItemId: 0,
      variantId: 0,
      wholesalerId: line.wholesalerId,
      productName: line.productName,
      colorLabel: line.colorLabel,
      size: line.size,
      price: line.price,
      qty: line.qty,
    })),
  };
}

/** 장끼 한 장의 요약 줄 `2026.08.26 21:40 출고 · 화이트/M 20장 · 수령인 김삼촌` */
export function shipmentSummary(
  shipment: Shipment,
  leg: OrderLeg | undefined,
  receiverName: string,
  packedLabel: string,
): string {
  const items = shipment.lines
    .map((line) => `${line.colorLabel}/${line.size} ${formatSheets(line.qty)}`)
    .join(" · ");

  const when =
    shipment.shippedAt === null ? packedLabel : `${shipment.shippedAt} 출고`;
  const how =
    leg?.pickup === "AGENT" && receiverName !== ""
      ? `수령인 ${receiverName}`
      : PICKUP_LABEL[leg?.pickup ?? "RETAILER"];

  return `${when} · ${items} · ${how}`;
}

/* ────────────────────────────────────────────────────────────────────────
   주문 내역 필터 3축 · 정렬 · 페이지 — **주소가 곧 상태다**
   ──────────────────────────────────────────────────────────────────────── */

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** 주소의 값이 목록에 없으면(옛 링크·오타) 기본값으로 떨어뜨린다 */
function resolveOne(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  return value && allowed.includes(value) ? value : fallback;
}

export const STATUS_VALUES: readonly OrderStatus[] = [
  "PENDING_ACCEPT",
  "WAITING_SHIPMENT",
  "READY_TO_PICK_UP",
  "DONE",
  "CANCELLED",
];

/**
 * 주소 → 필터 3축. 상세를 갔다 와도 좁혀 둔 조건이 남는 이유가 이것이다.
 *
 * 도매처 축은 **상호**가 값이다 — 요약 응답에 도매처 id가 없다(`04-wire.md` §3).
 */
export function resolveOrderFilter(
  params: Record<string, string | string[] | undefined>,
  wholesalerNames: readonly string[],
): OrderFilter {
  return {
    period: resolveOne(
      one(params, "period"),
      PERIODS.map((p) => p.value),
      DEFAULT_PERIOD,
    ),
    wholesaler: resolveOne(
      one(params, "wholesaler"),
      wholesalerNames,
      FILTER_ALL,
    ),
    status: resolveOne(one(params, "status"), STATUS_VALUES, FILTER_ALL),
  };
}

/** 주소 → 정렬. 모르는 값은 기본(최신순)으로 */
export function resolveOrderSort(
  params: Record<string, string | string[] | undefined>,
): OrderSort {
  return one(params, "sort") === "oldest" ? "oldest" : DEFAULT_ORDER_SORT;
}

/** 주소 → 펼쳐 둔 주문(`orderId`). 숫자가 아니면 아무것도 안 펼친다 */
export function resolveOpen(
  params: Record<string, string | string[] | undefined>,
): number | null {
  return resolveOrderId(one(params, "open"));
}

/** 주소의 `?page=`(1-base)를 정리한다. 숫자가 아니거나 1 미만이면 첫 장이다 */
export function resolvePage(
  params: Record<string, string | string[] | undefined>,
): number {
  const value = Number(one(params, "page"));
  return Number.isInteger(value) && value >= FIRST_PAGE ? value : FIRST_PAGE;
}

/** 기간 축만 서버가 거른다(`from`). 여기서는 나머지 두 축을 **받은 장 안에서** 건다 */
export function filterOrders(
  orders: readonly OrderSummary[],
  filter: OrderFilter,
): OrderSummary[] {
  return orders.filter((order) => {
    if (
      filter.wholesaler !== FILTER_ALL &&
      !order.wholesalerNames.includes(filter.wholesaler)
    ) {
      return false;
    }

    return filter.status === FILTER_ALL || order.status === filter.status;
  });
}

/** 원본 배열을 건드리지 않는다. 글자가 아니라 epoch로 비교한다 — 오프셋이 섞여도 순서가 맞다 */
export function sortOrders(
  orders: readonly OrderSummary[],
  sort: OrderSort,
): OrderSummary[] {
  const sign = sort === "oldest" ? 1 : -1;
  return [...orders].sort((a, b) => sign * (a.orderedAtMs - b.orderedAtMs));
}

/** 세 축이 전부 기본값인가. `초기화`를 누를 수 있는지가 여기서 갈린다 */
export function isOrderFilterEmpty(filter: OrderFilter): boolean {
  return (
    filter.period === DEFAULT_PERIOD &&
    filter.wholesaler === FILTER_ALL &&
    filter.status === FILTER_ALL
  );
}

export interface OrdersLocation {
  filter: OrderFilter;
  sort: OrderSort;
  open: number | null;
  page: number;
}

/**
 * 지금 주소 위에 한 축만 바꾼 주소.
 *
 * 기본값인 축은 **주소에서 뺀다** — 그래야 `초기화`가 그냥 `/orders`가 되고
 * 아무것도 안 고른 화면의 주소가 짧다. 펼침도 같이 실린다(반복결함 `state-loss`):
 * 상세에 갔다 뒤로 오면 펼쳐 둔 행이 그대로 있어야 한다.
 *
 * 축을 바꾸면 **첫 장으로 돌아간다**(`page` 생략) — 도매처·상태는 받은 장 안에서
 * 걸리는 것이라 3장에서 도매처를 고르면 그 장의 그 도매처만 남는데, 그게 첫 장에서
 * 시작한 사장이 기대하는 결과와 다르다.
 */
export function ordersHref(
  current: OrdersLocation,
  patch: Partial<OrderFilter> & {
    sort?: OrderSort;
    open?: number | null;
    page?: number;
  },
): string {
  const filter = { ...current.filter, ...patch };
  const sort = patch.sort ?? current.sort;
  const open = patch.open === undefined ? current.open : patch.open;
  const page = patch.page ?? FIRST_PAGE;

  const params = new URLSearchParams();
  if (filter.period !== DEFAULT_PERIOD) params.set("period", filter.period);
  for (const key of ["wholesaler", "status"] as const) {
    if (filter[key] !== FILTER_ALL) params.set(key, filter[key]);
  }
  if (sort !== DEFAULT_ORDER_SORT) params.set("sort", sort);
  if (page !== FIRST_PAGE) params.set("page", String(page));
  if (open !== null) params.set("open", String(open));

  const query = params.toString();
  return query ? `${ORDER_PATH.orders}?${query}` : ORDER_PATH.orders;
}

/** 도매처 필터에 세울 값. **받은 장에 실제로 있는 도매처만** 세운다 */
export function orderWholesalers(orders: readonly OrderSummary[]): string[] {
  const seen = new Set<string>();
  for (const order of orders) {
    for (const name of order.wholesalerNames) seen.add(name);
  }
  return [...seen];
}
