"use client";

import { useSyncExternalStore } from "react";
import { CART_SEED } from "./fixtures";
import type { CartLine } from "./types";

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
 * 스토어가 `shared/`가 아니라 이 feature 안에 있다. 뱃지(`components/CartButton`)
 * 도 같은 폴더에서 내보내고 셸은 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 —
 * 셸이 feature를 직접 읽지 않으므로 import 방향을 어기지 않고, 장바구니를
 * 지우면 이 폴더 하나만 지우면 된다.
 */

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
