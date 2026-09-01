import { QTY_UNIT } from "@/shared/qty";
import { CHECKOUT_BLOCKED, PAYMENT_LABEL, PICKUP_LABEL } from "./constants";
import type {
  CheckoutLine,
  OrderReceipt,
  OrderScenario,
  PaymentChoice,
  PaymentMethod,
  PickupChoice,
  PickupMethod,
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
