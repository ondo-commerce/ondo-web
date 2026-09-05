"use client";

import { useSyncExternalStore } from "react";
import { overriddenWholesalers, type CheckoutSetting } from "./derive";
import type {
  CheckoutGroup,
  PaymentChoice,
  PaymentMethod,
  PickupChoice,
  PickupMethod,
  RejectedLeg,
} from "./types";

/**
 * 주문서에서 고른 것과, 방금 접수했을 때 **안 된 도매처**. 서버가 모르는 UI 상태만
 * 여기 있다 — 주문 목록·상세·완료 화면의 본문은 Server Component가 `serverApi()`로
 * 받는다.
 *
 * 화면이 `useState`로 들고 있으면 안 되는 이유가 둘이다.
 * ① 수령·결제를 고르고 `/cart`에 갔다 돌아오면 고른 값이 통째로 버려진다
 *    (도매·소매 아홉 회차 누적 `state-loss`).
 * ② 접수 응답의 "안 된 도매처"는 주문에 안 만들어져서 `GET /orders/{id}`에 없다.
 *    완료 화면이 그 사실을 말하려면 누군가 응답을 들고 있어야 한다.
 *
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다 —
 * 완료 화면의 부분 접수 모달은 새로고침 뒤엔 안 뜬다. 안 된 조합은 장바구니에
 * 그대로 있으므로(스펙) 사장이 잃는 것은 없다.
 */

interface OrderUiState extends CheckoutSetting {
  /** `전체 적용`이 방금 되돌린 도매처 수. null이면 아직 누른 적이 없다 */
  appliedCount: number | null;
  /**
   * 방금 접수한 주문에서 안 된 도매처. `orderId`가 같이 있어야 다른 주문의
   * 완료 화면에 지난번 모달이 뜨지 않는다.
   */
  lastPlaced: { orderId: number; rejected: readonly RejectedLeg[] } | null;
}

/**
 * 초기값은 **전 도매처 `일괄 설정 따름`**이다(가정 A9).
 *
 * 사장이 하지도 않은 재정의가 처음부터 걸려 있으면 `전체 적용`이 무엇을
 * 되돌리는 버튼인지 알 수 없다.
 */
const INITIAL: OrderUiState = {
  bulkPickup: "RETAILER",
  bulkPayment: "BANK_TRANSFER",
  pickupOverrides: {},
  paymentOverrides: {},
  agentName: "",
  agentPhone: "",
  appliedCount: null,
  lastPlaced: null,
};

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 INITIAL에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let state: OrderUiState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OrderUiState {
  return state;
}

function getServerSnapshot(): OrderUiState {
  return INITIAL;
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: OrderUiState): void {
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
 * 스크롤 밖에 있어도 같이 적용돼야 한다.
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
   접수 결과
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 접수가 끝났다. 안 된 도매처를 남기고 **도매처별 재정의를 비운다** — 재정의는
 * 이번 주문서의 도매처에 대한 것이라 다음 주문서에 남아 있으면 사장이 정한 적
 * 없는 값이 걸려 있게 된다. 일괄 값과 사입삼촌 정보는 사장의 평소 선택이라 둔다.
 */
export function rememberPlaced(
  orderId: number,
  rejected: readonly RejectedLeg[],
): void {
  commit({
    ...state,
    pickupOverrides: {},
    paymentOverrides: {},
    appliedCount: null,
    lastPlaced: { orderId, rejected },
  });
}

/* ────────────────────────────────────────────────────────────────────────
   읽기
   ──────────────────────────────────────────────────────────────────────── */

/** 주문서 한 장이 읽는 값 전부. 화면이 조각조각 구독하지 않는다 */
export function useCheckoutSetting(): CheckoutSetting & {
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

/**
 * 방금 접수한 **그 주문**에서 안 된 도매처. 다른 주문이거나 새로고침 뒤면 빈 배열 —
 * 모달이 안 뜬다.
 */
export function useRejectedLegs(orderId: number): readonly RejectedLeg[] {
  const placed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  ).lastPlaced;

  return placed !== null && placed.orderId === orderId ? placed.rejected : [];
}
