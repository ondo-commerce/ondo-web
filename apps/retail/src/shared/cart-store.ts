"use client";

import { useSyncExternalStore } from "react";
import { CART_SEED } from "@/shared/cart-fixtures";

/**
 * 장바구니에 담긴 것. **서버가 없어서 브라우저 세션이 들고 있다** — API가 붙으면
 * 이 파일만 갈아 끼운다. `features/catalog/useFavorites`와 같은 구조다.
 *
 * 화면 하나가 `useState`로 들고 있으면 안 되는 이유가 둘이다.
 * ① 헤더 뱃지는 장바구니 화면 **밖**에 있다. 화면 안 상태로 두면 뱃지가 자기
 *    숫자를 따로 갖게 되고, 그게 원본의 §6-4 결함이다(헤더 `6개 담김` ·
 *    뱃지 `4` · 본문 `담긴 조합 4개`가 한 화면에서 서로 달랐다).
 * ② 수량을 고치고 다른 화면에 갔다 오면 고친 값이 통째로 버려진다
 *    (도매 9회차 누적 `state-loss`).
 *
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다.
 *
 * 타입이 `features/cart/types.ts`가 아니라 여기 있는 것은 import 방향
 * 때문이다 — `shared/`는 `features/`를 못 읽는데(`CLAUDE.md`) 뱃지를 그리는
 * `shared/components/CartButton`이 이 목록을 읽어야 한다.
 */

/**
 * 담긴 조합 한 줄 = SKU 하나(색상 × 사이즈).
 *
 * **재고 수치가 없다**(게이트 Q1). "재고가 없지만 미송으로 주문은 된다"는
 * 사실만 `soldOut` boolean으로 온다 — 숫자를 지어내지 않는다.
 */
export interface CartLine {
  /** 도매처 + SKU. 같은 조합을 두 도매처에서 담을 수 있어 SKU만으로는 안 된다 */
  lineId: string;
  wholesalerId: string;
  wholesalerName: string;
  /** 상가 · 층 · 호. 사입삼촌에게 넘길 주소라 그룹 머리에 계속 붙어 있다 */
  wholesalerLocation: string;
  productId: string;
  productName: string;
  /** 품번 (SU-18 형태) — 게이트 Q3 */
  productCode: string;
  /** 노출용 색상 표기(자유 텍스트). 팔레트 키가 아니라 도매 현장의 색 이름이다 */
  colorLabel: string;
  size: string;
  /** 담을 때의 판매가. 장바구니에서 고칠 수 없다 */
  price: number;
  /** 재고 소진 · 미송 가능. 수량은 그래도 넣을 수 있다 */
  soldOut: boolean;
  /** 담긴 장수. 이 화면에서 고치는 것은 #106 몫이고 지금은 읽기만 한다 */
  qty: number;
}

/* 모듈 값이라 서버에서도 한 벌 산다. 지금은 담긴 것을 읽기만 해서 값이 움직이지
   않는다 — 수량 편집·행 삭제가 들어오면 이 자리가 바뀐다. 바꾸는 곳이 이벤트
   핸들러뿐이라 그때도 서버 쪽 값은 CART_SEED에서 안 움직인다(요청끼리 안 섞인다) */
const snapshot: readonly CartLine[] = CART_SEED;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly CartLine[] {
  return snapshot;
}

function getServerSnapshot(): readonly CartLine[] {
  return CART_SEED;
}

/** 담긴 목록. 장바구니 화면이 그룹을 만들 원본이다 */
export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 담긴 **조합 수**(색상 × 사이즈). 장 수가 아니다.
 * 헤더 뱃지와 패널 부제가 둘 다 이 값을 읽는다 — §6-4 결함이 코드로 오지 않게.
 */
export function useCartCount(): number {
  return useCartLines().length;
}
