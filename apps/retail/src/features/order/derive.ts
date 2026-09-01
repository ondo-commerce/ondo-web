import { QTY_UNIT } from "@/shared/qty";
import {
  CHECKOUT_BLOCKED,
  DEFAULT_ORDER_SORT,
  DEFAULT_PERIOD,
  FILTER_ALL,
  LINE_PENDING_NOTE,
  PAYMENT_LABEL,
  PERIODS,
  PICKUP_LABEL,
} from "./constants";
import type {
  CheckoutLine,
  OrderFilter,
  OrderLeg,
  OrderLine,
  OrderReceipt,
  OrderRecord,
  OrderScenario,
  OrderSort,
  OrderStatus,
  PaymentChoice,
  PaymentMethod,
  PickupChoice,
  PickupMethod,
  Shipment,
} from "./types";

/**
 * 주문 화면들의 파생값. **JSX 안에서 더하지 않는다.**
 *
 * 이 파일이 있는 이유는 하나다 — 요약·툴바 카운터·표·합계가 **같은 집합
 * 하나**에서 나와야 한다. 앞 회차에서 "목록은 0건인데 칩은 20/20/30",
 * "필터를 걸면 합계가 어긋남", "도매처 소계 327,000인데 입금액 318,000"이
 * 반복해서 걸렸다. 전부 두 자리가 서로 다른 상수를 읽어서 생긴 일이다.
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
export function lineAmount(line: CheckoutLine): number {
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
 * 입금액이 **전부 이 함수 하나**를 부르고, 무엇을 넣어 부르는지만 다르다.
 */
export function totalsOf(lines: readonly CheckoutLine[]): OrderTotals {
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
   묶기 — 도매처로 한 겹, 그 안에서 상품으로 한 겹.
   접수·확정·출고가 도매처마다 따로 돌기 때문에 도매처가 바깥이다(RT-32).
   ──────────────────────────────────────────────────────────────────────── */

export interface CheckoutGroup {
  wholesalerId: string;
  wholesalerName: string;
  wholesalerLocation: string;
  lines: readonly CheckoutLine[];
}

/**
 * 담긴 순서를 지키면서 도매처별로 묶는다. 도매처명으로 정렬하지 않는다 —
 * 방금 담은 것이 어디로 튀는지 알 수 없으면 사장이 자기 주문을 다시 찾아야 한다.
 */
export function groupByWholesaler(
  lines: readonly CheckoutLine[],
): CheckoutGroup[] {
  const groups: CheckoutGroup[] = [];
  const index = new Map<string, number>();

  for (const line of lines) {
    const at = index.get(line.wholesalerId);

    if (at === undefined) {
      index.set(line.wholesalerId, groups.length);
      groups.push({
        wholesalerId: line.wholesalerId,
        wholesalerName: line.wholesalerName,
        wholesalerLocation: line.wholesalerLocation,
        lines: [line],
      });
      continue;
    }

    /* noUncheckedIndexedAccess: 방금 넣은 자리라 있는 게 확실하지만 타입상으로는
       undefined다. 조용히 !로 지우지 않고 건너뛴다 */
    const group = groups[at];
    if (group) group.lines = [...group.lines, line];
  }

  return groups;
}

/** 도매처 상자 안의 상품 한 덩어리. 옵션은 줄이 아니라 **한 줄로 이어 붙는다** */
export interface ProductBlock {
  productId: string;
  productName: string;
  /** `체리레드 · S · 10장 / 체리레드 · M · 6장 / 딥네이비 · L · 10장` */
  options: string;
  amount: number;
}

/**
 * 도매처 상자 안을 상품으로 한 번 더 묶는다.
 *
 * 조합마다 한 줄씩 그리지 않는 것이 원본의 선택이다 — 주문서는 **고칠 수 없는
 * 명세**라서, 사장이 확인해야 하는 단위가 "무슨 상품을 얼마어치"이지 조합
 * 하나하나가 아니다. 조합별 수량은 옵션 줄이 그대로 말한다.
 */
export function productBlocks(lines: readonly CheckoutLine[]): ProductBlock[] {
  const blocks: ProductBlock[] = [];
  const index = new Map<string, number>();

  for (const line of lines) {
    const option = `${line.colorLabel} · ${line.size} · ${formatSheets(line.qty)}`;
    const at = index.get(line.productId);

    if (at === undefined) {
      index.set(line.productId, blocks.length);
      blocks.push({
        productId: line.productId,
        productName: line.productName,
        options: option,
        amount: lineAmount(line),
      });
      continue;
    }

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

/** 이 도매처에 실제로 걸리는 결제 방법 */
export function resolvePayment(
  choice: PaymentChoice | undefined,
  bulk: PaymentMethod,
): PaymentMethod {
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

/**
 * 연락처 칸이 받을 수 있는 글자인가.
 *
 * **못 받는 형식이어도 값을 고치지 않는다.** 하이픈을 조용히 지우면 사장은
 * 자기가 무엇을 쳤는지 못 보고, `010 1234 5678`이 `01012345678`이 되어도
 * 그게 자기 입력인지 화면이 고친 것인지 알 수 없다. 판정만 하고 값은 그대로 둔다.
 */
export function isPhoneAcceptable(raw: string): boolean {
  const text = raw.trim();
  return text === "" || /^[\d-]+$/.test(text);
}

/**
 * `주문 접수하기`를 못 누르는 이유. null이면 누를 수 있다.
 *
 * 순서가 곧 우선순위다 — 주문할 것이 없으면 수령인 얘기를 할 차례가 아니다.
 */
export function checkoutBlockedReason(input: {
  lines: readonly CheckoutLine[];
  agentRequired: boolean;
  agentName: string;
  agentPhone: string;
}): string | null {
  if (input.lines.length === 0) return CHECKOUT_BLOCKED.empty;

  if (
    input.agentRequired &&
    (input.agentName.trim() === "" ||
      input.agentPhone.trim() === "" ||
      !isPhoneAcceptable(input.agentPhone))
  ) {
    return CHECKOUT_BLOCKED.agent;
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   주문번호 채번 — 서버가 없다.
   ──────────────────────────────────────────────────────────────────────── */

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

/** `2026.08.31 14:20` — 화면에 뜨는 접수 시각 */
export function formatPlacedAt(at: Date): string {
  return (
    `${at.getFullYear()}.${pad(at.getMonth() + 1, 2)}.${pad(at.getDate(), 2)} ` +
    `${pad(at.getHours(), 2)}:${pad(at.getMinutes(), 2)}`
  );
}

/**
 * 통합 주문번호 `YYYYMMDD-HHMM-NNNN`.
 *
 * **뒤 4자리는 고정 더미다.** 채번 규칙이 아직 서버에 없고(§3-0 B "임의 채번으로
 * 시작"), 클라이언트가 일련번호를 지어내면 새로고침마다 다른 번호가 나와
 * "이 번호로 문의하세요"가 거짓이 된다. 고정값이 더 정직하다.
 */
export const ORDER_NO_TAIL = "0102";

export function unifiedOrderNo(at: Date): string {
  const day = `${at.getFullYear()}${pad(at.getMonth() + 1, 2)}${pad(at.getDate(), 2)}`;
  return `${day}-${pad(at.getHours(), 2)}${pad(at.getMinutes(), 2)}-${ORDER_NO_TAIL}`;
}

/** 도매처별 주문번호 `ORD-2608310021`. 통합 번호와 **같이** 보인다(RT-40) */
export function legOrderNo(at: Date, index: number): string {
  const day = `${pad(at.getFullYear() % 100, 2)}${pad(at.getMonth() + 1, 2)}${pad(at.getDate(), 2)}`;
  return `ORD-${day}${pad(21 + index, 4)}`;
}

/* ────────────────────────────────────────────────────────────────────────
   접수 결과 읽기
   ──────────────────────────────────────────────────────────────────────── */

/** 주소의 `?scenario=`. 모르는 값은 기본(전부 접수됨)으로 떨어뜨린다 */
export function resolveScenario(
  raw: string | string[] | undefined,
): OrderScenario {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "partial" || value === "delayed" ? value : "default";
}

/** 접수된 조합의 `lineId`. 장바구니에서 빠질 것이 정확히 이 목록이다 */
export function acceptedLineIds(receipt: OrderReceipt): string[] {
  return receipt.legs
    .filter((leg) => leg.status !== "REJECTED")
    .flatMap((leg) => leg.lines.map((line) => line.lineId));
}

/** 접수가 안 된 도매처. 하나라도 있으면 완료 화면 위에 모달이 뜬다 */
export function rejectedLegs(receipt: OrderReceipt) {
  return receipt.legs.filter((leg) => leg.status === "REJECTED");
}

/** 응답이 늦는 도매처. 없으면 `접수가 늦어질 때` 패널을 아예 그리지 않는다 */
export function checkingLegs(receipt: OrderReceipt) {
  return receipt.legs.filter((leg) => leg.status === "CHECKING");
}

/** 접수된 도매처만 센 합계. 안 된 건의 금액을 합계에 넣지 않는다 */
export function receiptTotals(receipt: OrderReceipt): OrderTotals {
  return totalsOf(
    receipt.legs
      .filter((leg) => leg.status !== "REJECTED")
      .flatMap((leg) => leg.lines),
  );
}

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 목록 한 줄과 상세 한 장이 **같은 함수들**을 읽는다.
   원본은 목록 2행이 517,000원인데 상세 행 합이 618,000원이었다(§6에 없던
   새 결함). 두 화면이 각자 상수를 읽으면 언제든 다시 갈린다.
   ──────────────────────────────────────────────────────────────────────── */

/** 주문 라인의 소계 = 판매가 × 수량 */
export function orderLineAmount(line: OrderLine): number {
  return line.price * line.qty;
}

/**
 * 주문 하나의 합. **금액은 라인에서 나온다** — 목록·요약 카드·표 `<tfoot>`가
 * 전부 이 값을 읽으므로 세 자리가 다른 금액을 말할 수 없다(가정 A5-b·A5-c).
 */
export function orderTotals(order: OrderRecord): OrderTotals {
  return order.lines.reduce<OrderTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + line.qty,
      amount: acc.amount + orderLineAmount(line),
    }),
    { comboCount: 0, sheets: 0, amount: 0 },
  );
}

/** `무드온 외 1곳` — 도매처가 하나면 이름만 */
export function wholesalerLabel(order: OrderRecord): {
  head: string;
  rest: string | null;
} {
  const head = order.legs[0]?.wholesalerName ?? "";
  return {
    head,
    rest: order.legs.length > 1 ? `외 ${order.legs.length - 1}곳` : null,
  };
}

export interface ShipmentProgress {
  /** 출고될 건수 = 취소되지 않은 도매처 건수 */
  planned: number;
  /** 실제로 장끼가 나간 건수 */
  done: number;
}

/**
 * `3건 중 2건`.
 *
 * `done`을 **장끼 발행 건수**로 정의한 근거는 상세 화면이다 — 데님하우스는
 * 배지가 `수령 가능`인데 출고 기록에 장끼가 **있다**. 장끼는 나갔고 소매가
 * 아직 안 가져간 상태이고, §3-0 C(`수령 가능` = 도매 `출고 대기`)와 맞는다.
 *
 * `planned`는 **취소되지 않은 도매처 건수**다. 확정된 건수로 정의하면
 * 와이어프레임의 `3건 중 2건`(3곳 중 1곳은 아직 확정 전)이 `2건 중 2건`이
 * 되어버린다. 대신 확정 전 주문의 출고 칸이 원본의 `0건 중 0건`이 아니라
 * `2건 중 0건`이 된다 — 원본이 두 행에서 서로 다른 규칙을 쓴 자리라
 * 한쪽을 골랐고, 고른 쪽은 AC가 숫자로 못박은 상세 화면이다.
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
 * 통합 행에 뜨는 배지 하나. **위에서부터 처음 맞는 것**(가정 A1).
 *
 * ```
 * 1) 도매처 건이 전부 취소됨          → 취소됨
 * 2) 장끼 M건이 0 < M < N            → 부분 출고
 * 3) M === N (>0) 이고 전부 수령함     → 출고 완료
 * 4) M === N (>0)                    → 수령 가능
 * 5) 그 밖(M === 0)                  → 확정 대기
 * ```
 *
 * 확정 와이어프레임의 5행에 넣으면 5행 전부 그려진 배지와 같은 값이 나온다.
 * **한 행에 배지는 하나**이고, 목록·상세가 같은 이 함수를 부른다.
 */
export function orderStatus(order: OrderRecord): OrderStatus {
  if (order.legs.length > 0 && order.legs.every((leg) => leg.canceled)) {
    return "CANCELED";
  }

  const { planned, done } = shipmentProgress(order);
  if (done > 0 && done < planned) return "PARTIAL_SHIPPED";

  if (done > 0 && done === planned) {
    const alive = order.legs.filter((leg) => !leg.canceled);
    return alive.every((leg) => leg.received) ? "SHIPPED" : "READY";
  }

  return "PENDING";
}

/** 장끼 한 장의 금액 */
export function shipmentAmount(shipment: Shipment): number {
  return shipment.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

/**
 * 미수 잔액. **출고된 건의 금액 합이다**(RT-64) — 주문 금액 전체가 아니다.
 * 미수는 물건이 나갈 때 생긴다.
 */
export function unpaidAmount(order: OrderRecord): number {
  return order.shipments.reduce((sum, s) => sum + shipmentAmount(s), 0);
}

/**
 * 이 주문을 취소할 수 있는가. **도매처가 확정하기 전까지만**이다(RT-49).
 * 확정됐거나 이미 나간 것이 있으면 잠긴다.
 */
export function isCancelable(order: OrderRecord): boolean {
  return (
    order.shipments.length === 0 &&
    order.legs.length > 0 &&
    order.legs.every((leg) => !leg.confirmed && !leg.canceled)
  );
}

/** 라인 상태 아래 12px 둘째 줄. 없으면 안 붙는다 */
export function lineStatusNote(
  line: OrderLine,
  leg: OrderLeg | undefined,
): string | null {
  if (line.status === "PENDING") return LINE_PENDING_NOTE;

  if (line.status === "READY" && leg?.pickup) {
    /* 주소를 여기서 만든다 — 라인 표와 `결제 · 수령` 패널이 같은 `leg`를 읽어야
       같은 글자가 나온다. 원본은 두 자리가 `데님하우스 지하 1층 12호` /
       `디오트 지하 1층 12호`로 갈려 있었다(가정 A5-e) */
    return `${PICKUP_LABEL[leg.pickup]} · ${leg.wholesalerLocation}`;
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   주문 내역 필터 3축 · 정렬 — **주소가 곧 상태다**
   ──────────────────────────────────────────────────────────────────────── */

/** 주소의 값이 목록에 없으면(옛 링크·오타) 기본값으로 떨어뜨린다 */
function resolveOne(
  value: string | string[] | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  const one = Array.isArray(value) ? value[0] : value;
  return one && allowed.includes(one) ? one : fallback;
}

const STATUS_VALUES: readonly OrderStatus[] = [
  "PENDING",
  "PARTIAL_SHIPPED",
  "READY",
  "SHIPPED",
  "CANCELED",
];

/** 주소 → 필터 3축. 상세를 갔다 와도 좁혀 둔 조건이 남는 이유가 이것이다 */
export function resolveOrderFilter(
  params: Record<string, string | string[] | undefined>,
  wholesalerIds: readonly string[],
): OrderFilter {
  return {
    period: resolveOne(
      params.period,
      PERIODS.map((p) => p.value),
      DEFAULT_PERIOD,
    ),
    wholesaler: resolveOne(params.wholesaler, wholesalerIds, FILTER_ALL),
    status: resolveOne(params.status, STATUS_VALUES, FILTER_ALL),
  };
}

/** 주소 → 정렬. 모르는 값은 기본(최신순)으로 */
export function resolveOrderSort(
  params: Record<string, string | string[] | undefined>,
): OrderSort {
  const raw = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  return raw === "oldest" ? "oldest" : DEFAULT_ORDER_SORT;
}

/** 주소 → 펼쳐 둔 주문. 목록에 없는 값이면 아무것도 안 펼친다 */
export function resolveOpen(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const raw = Array.isArray(params.open) ? params.open[0] : params.open;
  return raw ?? null;
}

/** 주문일 `2026.08.24 10:10` → 비교 가능한 `20260824` */
function orderDay(order: OrderRecord): string {
  return order.orderedAt.slice(0, 10).replaceAll(".", "");
}

/**
 * 세 축을 **함께** 건다. 기간을 좁힌 채로 도매처를 더 좁힐 수 있어야 한다.
 *
 * "최근 N개월"을 `new Date()`로 세지 않는다 — 더미 날짜는 고정인데 오늘을
 * 기준으로 세면 시간이 지날수록 목록이 저절로 비고, 화면이 비는 이유가
 * 코드가 아니라 달력에 있게 된다. 기준일은 `fixtures`가 준다.
 */
export function filterOrders(
  orders: readonly OrderRecord[],
  filter: OrderFilter,
): OrderRecord[] {
  const period = PERIODS.find((p) => p.value === filter.period);
  const since = period?.since ?? null;

  return orders.filter((order) => {
    if (since && orderDay(order) < since) return false;

    if (
      filter.wholesaler !== FILTER_ALL &&
      !order.legs.some((leg) => leg.wholesalerId === filter.wholesaler)
    ) {
      return false;
    }

    return filter.status === FILTER_ALL || orderStatus(order) === filter.status;
  });
}

/** 원본 배열을 건드리지 않는다 — fixtures는 모든 화면이 같이 읽는 모듈 하나다 */
export function sortOrders(
  orders: readonly OrderRecord[],
  sort: OrderSort,
): OrderRecord[] {
  return [...orders].sort((a, b) =>
    sort === "oldest"
      ? a.orderedAt.localeCompare(b.orderedAt)
      : b.orderedAt.localeCompare(a.orderedAt),
  );
}

/** 세 축이 전부 기본값인가. `초기화`를 누를 수 있는지가 여기서 갈린다 */
export function isOrderFilterEmpty(filter: OrderFilter): boolean {
  return (
    filter.period === DEFAULT_PERIOD &&
    filter.wholesaler === FILTER_ALL &&
    filter.status === FILTER_ALL
  );
}

/**
 * 지금 주소 위에 한 축만 바꾼 주소.
 *
 * 기본값인 축은 **주소에서 뺀다** — 그래야 `초기화`가 그냥 `/orders`가 되고
 * 아무것도 안 고른 화면의 주소가 짧다. 펼침도 같이 실린다(반복결함 `state-loss`):
 * 상세에 갔다 뒤로 오면 펼쳐 둔 행이 그대로 있어야 한다.
 */
export function ordersHref(
  current: { filter: OrderFilter; sort: OrderSort; open: string | null },
  patch: Partial<OrderFilter> & { sort?: OrderSort; open?: string | null },
): string {
  const filter = { ...current.filter, ...patch };
  const sort = patch.sort ?? current.sort;
  const open = patch.open === undefined ? current.open : patch.open;

  const params = new URLSearchParams();
  if (filter.period !== DEFAULT_PERIOD) params.set("period", filter.period);
  for (const key of ["wholesaler", "status"] as const) {
    if (filter[key] !== FILTER_ALL) params.set(key, filter[key]);
  }
  if (sort !== DEFAULT_ORDER_SORT) params.set("sort", sort);
  if (open) params.set("open", open);

  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

/** 도매처 필터에 세울 값. **목록에 실제로 있는 도매처만** 세운다 */
export function orderWholesalers(
  orders: readonly OrderRecord[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const order of orders) {
    for (const leg of order.legs)
      seen.set(leg.wholesalerId, leg.wholesalerName);
  }

  return [...seen].map(([id, name]) => ({ id, name }));
}

/* ────────────────────────────────────────────────────────────────────────
   다시 주문 — 판정은 더미가 갖고(가정 A7) 세는 것만 파생시킨다.
   없는 판정 로직을 지어내면 서버가 붙을 때 통째로 버려지지만, 세는 코드는 남는다.
   ──────────────────────────────────────────────────────────────────────── */

/** 담기는 줄인가. `제외` 둘만 빠진다 */
export function isReorderAddable(line: OrderLine): boolean {
  const result = line.reorder ?? "ADDED";
  return result === "ADDED" || result === "PRICE_UP";
}

/** 다시 담을 때 실제로 들어갈 값. 단가가 올랐으면 **지금 가격**으로 담긴다 */
export function reorderPrice(line: OrderLine): number {
  return line.reorder === "PRICE_UP"
    ? (line.currentPrice ?? line.price)
    : line.price;
}

export interface ReorderSummary {
  /** 담을 수 있는 줄의 장수 합 */
  sheets: number;
  /** 담을 수 있는 줄 수 */
  addable: number;
  /** 표에 선 줄 수 전부 */
  total: number;
}

/** `<tfoot>`의 `30장 · 2건 / 5건`. **표의 실제 행에서 나온다** */
export function reorderSummary(lines: readonly OrderLine[]): ReorderSummary {
  const addable = lines.filter(isReorderAddable);

  return {
    sheets: addable.reduce((sum, line) => sum + line.qty, 0),
    addable: addable.length,
    total: lines.length,
  };
}

/** 도매처 한 건에 걸린 라인만 */
export function legLines(
  order: OrderRecord,
  wholesalerId: string,
): OrderLine[] {
  return order.lines.filter((line) => line.wholesalerId === wholesalerId);
}

/** 도매처 한 건의 합. 펼친 줄이 이 값을 읽는다 */
export function legTotals(
  order: OrderRecord,
  wholesalerId: string,
): OrderTotals {
  return legLines(order, wholesalerId).reduce<OrderTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + line.qty,
      amount: acc.amount + orderLineAmount(line),
    }),
    { comboCount: 0, sheets: 0, amount: 0 },
  );
}

/**
 * 도매처 한 건의 상태. 펼친 줄에만 뜬다.
 *
 * 통합 행 배지와 **같은 근거**(장끼가 나갔는가 · 받아 갔는가)를 쓴다 —
 * 펼쳤을 때 위아래가 다른 규칙으로 말하면 무엇을 믿어야 할지 알 수 없다.
 */
export function legStatus(order: OrderRecord, leg: OrderLeg): OrderStatus {
  if (leg.canceled) return "CANCELED";

  const shipped = order.shipments.some(
    (s) => s.wholesalerId === leg.wholesalerId,
  );
  if (shipped) return leg.received ? "SHIPPED" : "READY";

  return "PENDING";
}

/** 장끼 한 장의 요약 줄 `2026.08.26 21:40 출고 · 화이트/M 20장 · 수령인 박삼촌` */
export function shipmentSummary(
  shipment: Shipment,
  leg: OrderLeg | undefined,
  receiverName: string,
): string {
  const items = shipment.lines
    .map((line) => `${line.colorLabel}/${line.size} ${formatSheets(line.qty)}`)
    .join(" · ");

  const how =
    leg?.pickup === "AGENT"
      ? `수령인 ${receiverName}`
      : PICKUP_LABEL[leg?.pickup ?? "DIRECT"];

  return `${shipment.shippedAt} 출고 · ${items} · ${how}`;
}

/**
 * 이 출고까지의 **남은 미수**. 장끼 모달의 마지막 줄이 읽는다.
 *
 * 출고 순서대로 쌓아 올린 값이다 — 미수는 출고 시점에 생기므로(RT-64) 그
 * 장끼가 나갔을 때의 잔액은 그때까지 나간 것의 합이다. 입금 배정은 도매 사장이
 * 수기로 하는 일이라 여기서 빼지 않는다(§3-0 D: FIFO 아님).
 */
export function unpaidAfter(order: OrderRecord, statementNo: string): number {
  let sum = 0;
  for (const shipment of order.shipments) {
    sum += shipmentAmount(shipment);
    if (shipment.statementNo === statementNo) break;
  }

  return sum;
}

/**
 * 이번 세션에서 취소한 주문을 반영한 사본.
 *
 * 더미 배열을 직접 고치지 않는다 — 모듈 하나를 모든 화면이 같이 읽어서, 고치면
 * 목록·상세·재주문이 전부 조용히 따라 바뀐다. 대신 **취소 사실을 여기서 한 번
 * 겹쳐** 화면에 뜨는 배지·라인 상태·취소 버튼이 전부 같은 값에서 나오게 한다.
 */
export function withCancel(order: OrderRecord, canceled: boolean): OrderRecord {
  if (!canceled) return order;

  return {
    ...order,
    legs: order.legs.map((leg) => ({ ...leg, canceled: true })),
    /* 라인까지 같이 바꾼다. 머리 배지는 `취소됨`인데 라인이 `확정 대기`로
       남으면 한 화면이 서로 반대되는 말을 한다 */
    lines: order.lines.map((line) => ({
      ...line,
      status: "CANCELED" as const,
    })),
  };
}

/** 미송으로 넘어간 라인 수. 요약 카드의 `미송 1건 대기 중`이 이걸 센다 */
export function backorderCount(order: OrderRecord): number {
  return order.lines.filter((line) => line.status === "BACKORDER").length;
}

/** 주문 상세 부제 `2026.08.24 10:10 · 코튼클럽 외 2곳 · 라인 5개 · 총 62장` */
export function detailSubtitle(order: OrderRecord): string {
  const seller = wholesalerLabel(order);
  const totals = orderTotals(order);
  const who = seller.rest ? `${seller.head} ${seller.rest}` : seller.head;

  return `${order.orderedAt} · ${who} · 라인 ${totals.comboCount}개 · 총 ${formatSheets(totals.sheets)}`;
}
