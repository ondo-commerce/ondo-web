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
  /**
   * 이번에 살 것으로 고른 조합.
   *
   * **담긴 것과 고른 것은 다르다.** 하단 요약과 `주문하기`는 고른 것만 세고,
   * 그룹 머리와 헤더 뱃지는 담긴 것 전부를 센다(RT-32).
   */
  selected: ReadonlySet<string>;
  /**
   * 방금 `선택 삭제`로 뺀 것. 되돌리기가 이 자리에서 나온다.
   *
   * 확인 모달을 두지 않기로 한 대신(게이트 Q3) **되돌릴 길을 남긴다.** 여러
   * 줄이 한 번에 사라지는 실행이라 잘못 눌렀을 때 무엇이 없어졌는지조차 남지
   * 않으면 사장이 직접 다시 담아야 한다. 원래 자리(`at`)를 같이 들고 있어야
   * 되돌린 목록이 담은 순서를 지킨다.
   */
  lastRemoved: readonly { at: number; line: CartLine }[] | null;
}

const INITIAL: CartState = {
  lines: CART_SEED,
  issues: {},
  /* 처음엔 전부 켜져 있다 — 확정 와이어프레임이 `전체 선택 (4/4)`이다.
     담아 둔 것을 사러 들어온 화면이라 하나씩 켜게 하면 일이 늘기만 한다 */
  selected: new Set(CART_SEED.map((line) => line.lineId)),
  lastRemoved: null,
};

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
    ...state,
    lines: state.lines.map((line) =>
      line.lineId === lineId ? { ...line, qtyText: value } : line,
    ),
    issues: { ...state.issues, [lineId]: issue },
    /* 되돌리기는 **방금 그 일괄 삭제 한 번**에 대한 것이다. 다른 조작을 한 뒤에도
       남아 있으면 무엇이 되돌아오는지 사장이 알 수 없다 */
    lastRemoved: null,
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

  const selected = new Set(state.selected);
  /* 지운 줄이 선택 집합에 남아 있으면 하단 요약의 `선택한 조합` 수가 실제
     화면보다 커진다 — 없는 줄을 세게 된다 */
  selected.delete(lineId);

  commit({
    ...state,
    lines: state.lines.filter((line) => line.lineId !== lineId),
    issues,
    selected,
    lastRemoved: null,
  });
}

/* ────────────────────────────────────────────────────────────────────────
   선택 — 전체 / 도매처 / 조합 3층. 어느 층을 눌러도 결국 조합 집합 하나를
   고치는 것뿐이다. 층마다 따로 상태를 두면 세 값이 서로 어긋난다.
   ──────────────────────────────────────────────────────────────────────── */

/** 조합 하나를 켜고 끈다. 끄면 그 조합이 든 그룹과 전체 선택도 같이 풀린다 */
export function toggleLine(lineId: string): void {
  const selected = new Set(state.selected);
  if (!selected.delete(lineId)) selected.add(lineId);

  commit({ ...state, selected });
}

/**
 * 여러 조합을 한 번에 켜거나 끈다. 도매처 그룹 머리와 전체 선택이 둘 다
 * 이것을 부른다 — 넘기는 목록만 다르다.
 */
export function setLinesSelected(
  lineIds: readonly string[],
  on: boolean,
): void {
  const selected = new Set(state.selected);
  for (const id of lineIds) {
    if (on) selected.add(id);
    else selected.delete(id);
  }

  commit({ ...state, selected });
}

/**
 * 고른 조합을 전부 뺀다.
 *
 * **고르지 않은 조합은 남는다.** 화면에 지금 안 보이는 줄까지 지워 버리는 것이
 * 되돌릴 수 없는 실행의 전형적인 사고라, 지우는 대상을 화면(DOM)이 아니라
 * 선택 집합에서 뽑는다 — 접힘·필터가 나중에 생겨도 대상이 달라지지 않는다.
 */
export function removeSelected(): void {
  const removed: { at: number; line: CartLine }[] = [];
  const kept: CartLine[] = [];
  const issues = { ...state.issues };

  state.lines.forEach((line, at) => {
    if (state.selected.has(line.lineId)) {
      removed.push({ at, line });
      delete issues[line.lineId];
    } else {
      kept.push(line);
    }
  });

  if (removed.length === 0) return;

  commit({
    lines: kept,
    issues,
    selected: new Set(),
    lastRemoved: removed,
  });
}

/**
 * 주문으로 넘어간 조합을 뺀다.
 *
 * **접수된 것만 뺀다.** 도매처 하나가 접수를 못 받으면 그 도매처의 조합은
 * 장바구니에 그대로 남아야 한다(RT-44) — 부분 접수 모달의 `장바구니에서 보기`가
 * 거짓말이 되지 않으려면 여기가 지켜져야 한다.
 *
 * `removeSelected`와 달리 **되돌리기를 남기지 않는다.** 주문 접수는 되돌릴 수
 * 없는 실행이라, 담긴 목록만 되돌려 놓으면 이미 접수된 주문과 장바구니가
 * 이중으로 존재하게 된다.
 */
export function removeLines(lineIds: readonly string[]): void {
  if (lineIds.length === 0) return;

  const gone = new Set(lineIds);
  const issues = { ...state.issues };
  const selected = new Set(state.selected);
  for (const id of gone) {
    delete issues[id];
    selected.delete(id);
  }

  commit({
    lines: state.lines.filter((line) => !gone.has(line.lineId)),
    issues,
    selected,
    lastRemoved: null,
  });
}

/** 방금 뺀 것을 원래 자리로 되돌린다. 선택 상태도 뺄 때 그대로 돌아온다 */
export function restoreRemoved(): void {
  const removed = state.lastRemoved;
  if (!removed) return;

  const lines = [...state.lines];
  /* 오름차순으로 넣어야 앞자리부터 채워지면서 원래 순서가 복원된다 */
  for (const { at, line } of removed) lines.splice(at, 0, line);

  commit({
    ...state,
    lines,
    selected: new Set([
      ...state.selected,
      ...removed.map(({ line }) => line.lineId),
    ]),
    lastRemoved: null,
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

/** 이번에 살 것으로 고른 조합 */
export function useCartSelected(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .selected;
}

/** 방금 `선택 삭제`로 뺀 조합 수. 0이면 되돌릴 것이 없다 */
export function useLastRemovedCount(): number {
  const removed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  ).lastRemoved;

  return removed?.length ?? 0;
}

/**
 * 담긴 **조합 수**(색상 × 사이즈). 장 수가 아니다.
 * 헤더 뱃지와 패널 부제가 둘 다 이 값을 읽는다 — §6-4 결함이 코드로 오지 않게.
 */
export function useCartCount(): number {
  return useCartLines().length;
}
