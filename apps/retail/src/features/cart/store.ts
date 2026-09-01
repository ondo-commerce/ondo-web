"use client";

import { useSyncExternalStore } from "react";
import { SKU_ORDER_LIMIT, parseQty, type QtyIssue } from "@/shared/qty";
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
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다 —
 * 화면 사이 이동에서만 살아남는다.
 *
 * 스토어가 `shared/`가 아니라 이 feature 안에 있다. 뱃지(`components/CartButton`)
 * 도 같은 폴더에서 내보내고 셸은 부모 `app/(shop)/layout.tsx`가 끼워 넣는다 —
 * 셸이 feature를 직접 읽지 않으므로 import 방향을 어기지 않고, 장바구니를
 * 지우면 이 폴더 하나만 지우면 된다.
 */

/**
 * 스토어가 들고 있는 것 전부.
 *
 * **걸린 이유(`issues`)가 값과 따로 산다.** 상한 초과는 값을 500으로 되돌리는데,
 * 값만 봐서는 왜 500이 됐는지 알 수 없어서 문구가 같이 사라진다. 그리고 이유가
 * 스토어에 있어야 화면을 떠났다 돌아와도 "왜 500이 됐는지"가 남는다.
 */
interface CartState {
  lines: readonly CartLine[];
  /** lineId → 걸린 이유. 없으면 그 줄에 아무 말도 안 뜬다 */
  issues: Readonly<Record<string, QtyIssue | null>>;
}

const INITIAL: CartState = { lines: CART_SEED, issues: {} };

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 INITIAL에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let state: CartState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return INITIAL;
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: CartState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * 수량 칸의 글자를 받는다.
 *
 * **못 읽는 글자를 지우지 않는다.** `45.5`를 되돌려 지우면 사장은 자기가 무엇을
 * 쳤는지 못 보고, 조용히 `455`로 고치면 45배를 주문하게 된다. 값은 그대로 두고
 * 이유만 붙인다.
 *
 * 상한 초과만 값을 되돌린다 — 그건 "얼마까지 되는지"가 정해져 있어서 화면이
 * 대신 정할 수 있는 유일한 경우다. 되돌렸다는 사실은 문구가 말한다.
 */
export function setQty(lineId: string, next: string): void {
  const { issue } = parseQty(next);
  const value = issue === "OVER_LIMIT" ? String(SKU_ORDER_LIMIT) : next;

  commit({
    lines: state.lines.map((line) =>
      line.lineId === lineId ? { ...line, qtyText: value } : line,
    ),
    issues: { ...state.issues, [lineId]: issue },
  });
}

/**
 * 조합 한 줄을 지운다. 그룹의 마지막 줄이면 그룹 상자도 같이 사라진다 —
 * 그룹은 담긴 줄에서 만들어지므로(`groupByWholesaler`) 따로 지울 것이 없다.
 */
export function removeLine(lineId: string): void {
  /* 걸린 이유도 같이 지운다. 남겨 두면 같은 조합을 다시 담았을 때 아직 치지도
     않은 값에 빨간 글씨가 붙어 있다 */
  const issues = { ...state.issues };
  delete issues[lineId];

  commit({
    lines: state.lines.filter((line) => line.lineId !== lineId),
    issues,
  });
}

/** 담긴 목록. 장바구니 화면이 그룹을 만들 원본이다 */
export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).lines;
}

/** lineId → 수량이 걸린 이유. 값과 따로 산다 */
export function useCartIssues(): Readonly<Record<string, QtyIssue | null>> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).issues;
}

/**
 * 담긴 **조합 수**(색상 × 사이즈). 장 수가 아니다.
 * 헤더 뱃지와 패널 부제가 둘 다 이 값을 읽는다 — §6-4 결함이 코드로 오지 않게.
 */
export function useCartCount(): number {
  return useCartLines().length;
}
