"use client";

import { useSyncExternalStore } from "react";
import {
  formatPlacedAt,
  legOrderNo,
  overriddenWholesalers,
  resolvePayment,
  resolvePickup,
  unifiedOrderNo,
  type CheckoutGroup,
} from "./derive";
import type {
  OrderReceipt,
  OrderScenario,
  PaymentChoice,
  PaymentMethod,
  PickupChoice,
  PickupMethod,
  ReceiptLeg,
} from "./types";

/**
 * 주문서에서 고른 것과 방금 접수한 결과. **서버가 없어서 브라우저 세션이
 * 들고 있다** — API가 붙으면 이 파일만 갈아 끼운다.
 *
 * 화면이 `useState`로 들고 있으면 안 되는 이유가 둘이다.
 * ① 수령·결제를 고르고 `/cart`에 갔다 돌아오면 고른 값이 통째로 버려진다
 *    (도매·소매 아홉 회차 누적 `state-loss`).
 * ② 접수 결과를 주문서가 들고 있으면 완료 화면이 그 값을 못 읽어서, 완료
 *    화면이 자기 더미를 따로 갖게 된다 — 주문서에서 고른 수령·결제와 완료
 *    화면에 뜨는 수령·결제가 갈리는 순간이 바로 거기다(S4-3).
 *
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다.
 * 완료 화면은 그 경우를 빈 화면이 아니라 문장으로 말한다(S4-7).
 */

interface OrderState {
  bulkPickup: PickupMethod;
  bulkPayment: PaymentMethod;
  /**
   * 도매처별 재정의. **키가 없으면 `일괄 설정 따름`이다** — 일괄 값을 복사해
   * 넣지 않는 이유는 `types.ts`의 `PickupChoice` 주석에 있다.
   */
  pickupOverrides: Readonly<Record<string, PickupChoice>>;
  paymentOverrides: Readonly<Record<string, PaymentChoice>>;
  agentName: string;
  agentPhone: string;
  /** `전체 적용`이 방금 되돌린 도매처 수. null이면 아직 누른 적이 없다 */
  appliedCount: number | null;
  /** 방금 접수한 주문. 완료 화면이 이걸 읽는다 */
  receipt: OrderReceipt | null;
  /**
   * 이번 세션에서 취소한 주문의 통합 주문번호.
   *
   * 더미 배열을 직접 고치지 않는 이유는 `derive.withCancel` 주석에 있다.
   * 목록과 상세가 같은 이 집합을 읽으므로 상세에서 취소한 주문이 목록에서도
   * `취소됨`으로 선다 — 두 화면이 다른 말을 하지 않는다.
   */
  canceledOrders: ReadonlySet<string>;
}

/**
 * 초기값은 **전 도매처 `일괄 설정 따름`**이다(가정 A9).
 *
 * 와이어프레임은 코튼클럽이 이미 `사입삼촌 방문 · 현금`으로 재정의돼 있지만
 * 그건 개별 재정의가 어떻게 보이는지 그린 예시다. 사장이 하지도 않은 재정의가
 * 처음부터 걸려 있으면 `전체 적용`이 무엇을 되돌리는 버튼인지 알 수 없다.
 */
const INITIAL: OrderState = {
  bulkPickup: "DIRECT",
  bulkPayment: "TRANSFER",
  pickupOverrides: {},
  paymentOverrides: {},
  agentName: "",
  agentPhone: "",
  appliedCount: null,
  receipt: null,
  canceledOrders: new Set(),
};

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 INITIAL에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let state: OrderState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OrderState {
  return state;
}

function getServerSnapshot(): OrderState {
  return INITIAL;
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: OrderState): void {
  state = next;
  for (const listener of listeners) listener();
}

/* ────────────────────────────────────────────────────────────────────────
   일괄 설정 · 도매처별 재정의
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 일괄 값을 바꾼다. **재정의를 건드리지 않는다** — 따로 정해 둔 도매처는
 * 그대로 두고, `일괄 설정 따름`인 곳만 괄호 안 값이 따라 바뀐다.
 *
 * `전체 적용` 안내는 지운다. 조건이 바뀌었는데 "3곳을 맞췄어요"가 남아 있으면
 * 그 말이 지금 화면을 설명하지 못한다.
 */
export function setBulkPickup(value: PickupMethod): void {
  commit({ ...state, bulkPickup: value, appliedCount: null });
}

export function setBulkPayment(value: PaymentMethod): void {
  commit({ ...state, bulkPayment: value, appliedCount: null });
}

export function setPickupChoice(
  wholesalerId: string,
  choice: PickupChoice,
): void {
  commit({
    ...state,
    pickupOverrides: { ...state.pickupOverrides, [wholesalerId]: choice },
    appliedCount: null,
  });
}

export function setPaymentChoice(
  wholesalerId: string,
  choice: PaymentChoice,
): void {
  commit({
    ...state,
    paymentOverrides: { ...state.paymentOverrides, [wholesalerId]: choice },
    appliedCount: null,
  });
}

/**
 * 개별로 정한 것을 전부 일괄 설정으로 되돌린다.
 *
 * **대상을 화면(DOM)이 아니라 주문 대상 목록에서 뽑는다.** 상자가 접혀 있거나
 * 스크롤 밖에 있어도 같이 적용돼야 한다 — 반대 방향(가려진 것에 실행이 걸림)이
 * 앞 회차 다섯 번 중 두 번 걸린 결함이라 대상의 출처를 여기 못박는다.
 *
 * 몇 곳이 되돌아갔는지 세어 두는 것은 **누른 뒤에** 과거형으로 말하기 위해서다.
 */
export function applyBulkToAll(groups: readonly CheckoutGroup[]): void {
  const targets = overriddenWholesalers(
    groups,
    state.pickupOverrides,
    state.paymentOverrides,
  );

  const pickupOverrides = { ...state.pickupOverrides };
  const paymentOverrides = { ...state.paymentOverrides };
  for (const id of targets) {
    pickupOverrides[id] = "BULK";
    paymentOverrides[id] = "BULK";
  }

  commit({
    ...state,
    pickupOverrides,
    paymentOverrides,
    appliedCount: targets.length,
  });
}

/* ────────────────────────────────────────────────────────────────────────
   사입삼촌 정보 — 친 글자를 그대로 들고 있는다
   ──────────────────────────────────────────────────────────────────────── */

export function setAgentName(value: string): void {
  commit({ ...state, agentName: value, appliedCount: null });
}

/**
 * 연락처. **하이픈·공백을 지우지 않는다.** 못 받는 형식이면 값을 그대로 두고
 * 화면이 그 아래에 이유를 적는다(`derive.isPhoneAcceptable`).
 */
export function setAgentPhone(value: string): void {
  commit({ ...state, agentPhone: value, appliedCount: null });
}

/* ────────────────────────────────────────────────────────────────────────
   접수
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 시나리오가 걸리는 도매처를 고른다.
 *
 * 와이어프레임의 지연·거절 도매처는 `라비앙`인데 **장바구니에 라비앙이 없다** —
 * 장바구니에 없는 도매처가 주문 결과에 뜨면 그 자체가 결함이다(가정 A3).
 * 코튼클럽이 부분 접수 모달의 도매처라 두 시나리오가 같은 축을 쓰게 맞춘다.
 * 장바구니에서 코튼클럽을 빼 버렸을 때를 대비해 마지막 도매처로 떨어뜨린다 —
 * 시나리오가 조용히 사라지면 화면을 확인할 길이 없다.
 */
function scenarioTarget(groups: readonly CheckoutGroup[]): string | null {
  const cotton = groups.find((group) => group.wholesalerId === "w-cotton");
  if (cotton) return cotton.wholesalerId;

  return groups.at(-1)?.wholesalerId ?? null;
}

/**
 * 주문을 접수한다. **되돌릴 수 없다.**
 *
 * 장바구니에서 조합을 빼는 것은 여기서 하지 않는다 — `features/order`가
 * `features/cart`를 직접 부르지 않기 때문이다(가정 A10). 대신 접수된
 * `lineId` 목록을 결과에 담아 두고, `app/(shop)/checkout`의 조립부가 그것으로
 * 장바구니를 정리한다.
 */
export function submitOrder(input: {
  groups: readonly CheckoutGroup[];
  scenario: OrderScenario;
  /** 접수 시각. 화면 밖에서 주입해야 테스트·재현이 가능하다 */
  at?: Date;
}): OrderReceipt {
  const at = input.at ?? new Date();
  const target =
    input.scenario === "default" ? null : scenarioTarget(input.groups);

  const legs: ReceiptLeg[] = input.groups.map((group, index) => {
    const hit = target === group.wholesalerId;

    return {
      wholesalerId: group.wholesalerId,
      wholesalerName: group.wholesalerName,
      wholesalerLocation: group.wholesalerLocation,
      orderNo: legOrderNo(at, index),
      status:
        hit && input.scenario === "partial"
          ? "REJECTED"
          : hit && input.scenario === "delayed"
            ? "CHECKING"
            : "ACCEPTED",
      /* 주문서에서 고른 값을 **그대로** 옮긴다. 완료 화면이 다시 계산하면
         두 화면이 다른 말을 할 여지가 생긴다 */
      pickup: resolvePickup(
        state.pickupOverrides[group.wholesalerId],
        state.bulkPickup,
      ),
      payment: resolvePayment(
        state.paymentOverrides[group.wholesalerId],
        state.bulkPayment,
      ),
      ...(hit && input.scenario === "partial"
        ? { rejectedReason: "도매처가 이 상품의 게시를 내렸어요" }
        : {}),
      lines: group.lines,
    };
  });

  const receipt: OrderReceipt = {
    orderNo: unifiedOrderNo(at),
    placedAt: formatPlacedAt(at),
    agentName: state.agentName.trim(),
    agentPhone: state.agentPhone.trim(),
    legs,
  };

  commit({ ...state, receipt, appliedCount: null });
  return receipt;
}

/**
 * 접수가 안 된 도매처만 다시 시도한다.
 *
 * **`접수 확인 중…`으로 넘어간다.** 눌러도 그대로인 버튼을 만들지 않기 위한
 * 것이기도 하고(직전 회차 F2), 서버 없이 "이번엔 됐다"고 단정하는 것보다
 * 정직하다 — 다시 시도한 결과는 도매처가 응답해야 나온다.
 */
export function retryRejectedLegs(): void {
  const receipt = state.receipt;
  if (!receipt) return;

  commit({
    ...state,
    receipt: {
      ...receipt,
      legs: receipt.legs.map((leg) =>
        leg.status === "REJECTED"
          ? { ...leg, status: "CHECKING", rejectedReason: undefined }
          : leg,
      ),
    },
  });
}

/* ────────────────────────────────────────────────────────────────────────
   읽기
   ──────────────────────────────────────────────────────────────────────── */

/** 주문서 한 장이 읽는 값 전부. 화면이 조각조각 구독하지 않는다 */
export function useCheckoutSetting(): {
  bulkPickup: PickupMethod;
  bulkPayment: PaymentMethod;
  pickupOverrides: Readonly<Record<string, PickupChoice>>;
  paymentOverrides: Readonly<Record<string, PaymentChoice>>;
  agentName: string;
  agentPhone: string;
  appliedCount: number | null;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    bulkPickup: snapshot.bulkPickup,
    bulkPayment: snapshot.bulkPayment,
    pickupOverrides: snapshot.pickupOverrides,
    paymentOverrides: snapshot.paymentOverrides,
    agentName: snapshot.agentName,
    agentPhone: snapshot.agentPhone,
    appliedCount: snapshot.appliedCount,
  };
}

/** 방금 접수한 주문. null이면 접수한 적이 없거나 새로고침으로 사라진 것이다 */
export function useOrderReceipt(): OrderReceipt | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .receipt;
}

/**
 * 주문을 취소한다. **도매처가 확정하기 전까지만 되는 일이라**(RT-49) 누를 수
 * 있는지는 화면이 `derive.isCancelable`로 판정하고, 여기서는 사실만 적는다.
 */
export function cancelOrder(orderId: string): void {
  const canceledOrders = new Set(state.canceledOrders);
  canceledOrders.add(orderId);

  commit({ ...state, canceledOrders });
}

/** 이번 세션에서 취소한 주문들. 목록과 상세가 같은 이 집합을 읽는다 */
export function useCanceledOrders(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .canceledOrders;
}
