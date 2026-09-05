"use client";

import { useSyncExternalStore } from "react";
import type { CartLineIssue, RemovedLine } from "./types";

/**
 * 장바구니 화면의 **UI 상태**. 담긴 목록과 수량은 여기 없다 — 서버가 들고 있고
 * Server Component(`app/(shop)/cart/page.tsx`)가 요청마다 받아 온다. 여기 남은
 * 것은 서버가 모르는 것뿐이다: 무엇을 골랐는지, 칸에 무엇을 치는 중인지, 방금
 * 무엇을 뺐는지.
 *
 * 화면 하나가 `useState`로 들고 있지 않는 이유는 그대로다 — 선택을 풀고 다른
 * 화면에 갔다 오면 통째로 버려진다(도매 9회차 누적 `state-loss`).
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다.
 *
 * 스토어가 `shared/`가 아니라 이 feature 안에 있다. 장바구니를 지우면 이 폴더
 * 하나만 지우면 된다.
 */

interface CartUiState {
  /**
   * 이번에 **안** 살 것으로 뺀 조합.
   *
   * `selected`가 아니라 뺀 것을 든다 — 담긴 것은 기본이 선택이라(확정
   * 와이어프레임 `전체 선택 (4/4)`) 서버에서 새로 온 줄이 저절로 켜지고,
   * 스토어가 서버 목록을 몰라도 된다. 담긴 것과 고른 것은 다르다 — 하단 요약과
   * `주문하기`는 고른 것만 세고, 그룹 머리와 헤더 뱃지는 담긴 것 전부를 센다(RT-32).
   */
  deselected: ReadonlySet<string>;
  /**
   * lineId → 수량 칸의 글자. 서버 값과 다를 때만 의미가 있다.
   *
   * 못 읽는 글자(`45.5`)도 여기 그대로 남는다 — 지우면 사장이 무엇을 쳤는지
   * 화면이 되돌려 말할 수 없다. 저장이 성공해도 지우지 않는다: 지우는 순간
   * `router.refresh()`가 닿기 전까지 칸이 서버의 **옛** 값으로 튄다.
   */
  drafts: Readonly<Record<string, string>>;
  /**
   * lineId → 걸린 이유. 값과 따로 산다 — 상한 초과는 값을 500으로 되돌리는데,
   * 값만 봐서는 왜 500이 됐는지 알 수 없어서 문구가 같이 사라진다.
   */
  issues: Readonly<Record<string, CartLineIssue | null>>;
  /**
   * DELETE는 끝났는데 `router.refresh()`가 아직 안 닿은 줄. 그 사이에도 줄이
   * 보이면 사장이 한 번 더 누른다. 서버 목록에서 사라지면 `prune`이 지운다.
   */
  hidden: ReadonlySet<string>;
  /**
   * 방금 `선택 삭제`로 뺀 것. 되돌리기가 이 자리에서 나온다.
   *
   * 확인 모달을 두지 않기로 한 대신(게이트 Q3) **되돌릴 길을 남긴다.** 서버에
   * 되돌리기 API가 없어 다시 담을 값(`variantId`·`qty`)만 든다 — 서버 줄의
   * 사본이 아니라 "되돌릴 때 보낼 요청"이다.
   */
  lastRemoved: readonly RemovedLine[] | null;
}

const INITIAL: CartUiState = {
  deselected: new Set(),
  drafts: {},
  issues: {},
  hidden: new Set(),
  lastRemoved: null,
};

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 INITIAL에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let state: CartUiState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartUiState {
  return state;
}

function getServerSnapshot(): CartUiState {
  return INITIAL;
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: CartUiState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * 수량 칸의 글자를 받는다. 값은 그대로 두고 이유만 붙인다 — 상한 초과만 부르는
 * 쪽이 500으로 되돌려 넘긴다(`CartView`). 서버로 보낼지는 여기서 정하지 않는다.
 */
export function setDraft(
  lineId: string,
  text: string,
  issue: CartLineIssue | null,
): void {
  commit({
    ...state,
    drafts: { ...state.drafts, [lineId]: text },
    issues: { ...state.issues, [lineId]: issue },
    /* 되돌리기는 **방금 그 일괄 삭제 한 번**에 대한 것이다. 다른 조작을 한 뒤에도
       남아 있으면 무엇이 되돌아오는지 사장이 알 수 없다 */
    lastRemoved: null,
  });
}

/**
 * 저장이 실패한 줄. 칸을 서버 값으로 되돌리고(draft 제거) 왜 되돌렸는지 남긴다 —
 * 저장 안 된 숫자를 칸에 두면 합계가 서버와 다른 값을 말한다.
 */
export function revertDraft(lineId: string): void {
  const drafts = { ...state.drafts };
  delete drafts[lineId];

  commit({
    ...state,
    drafts,
    issues: { ...state.issues, [lineId]: "SAVE_FAILED" },
  });
}

/* ────────────────────────────────────────────────────────────────────────
   선택 — 전체 / 도매처 / 조합 3층. 어느 층을 눌러도 결국 집합 하나를
   고치는 것뿐이다. 층마다 따로 상태를 두면 세 값이 서로 어긋난다.
   ──────────────────────────────────────────────────────────────────────── */

/** 조합 하나를 켜고 끈다. 끄면 그 조합이 든 그룹과 전체 선택도 같이 풀린다 */
export function toggleLine(lineId: string, on: boolean): void {
  setLinesSelected([lineId], on);
}

/**
 * 여러 조합을 한 번에 켜거나 끈다. 도매처 그룹 머리와 전체 선택이 둘 다
 * 이것을 부른다 — 넘기는 목록만 다르다.
 */
export function setLinesSelected(
  lineIds: readonly string[],
  on: boolean,
): void {
  const deselected = new Set(state.deselected);
  for (const id of lineIds) {
    if (on) deselected.delete(id);
    else deselected.add(id);
  }

  commit({ ...state, deselected });
}

/**
 * DELETE가 끝난 줄을 화면에서 먼저 뺀다. 그 줄의 draft·이유·선택도 같이 지운다 —
 * 남겨 두면 같은 조합을 다시 담았을 때(새 id라 겹치진 않지만) 스토어에 쓰레기가
 * 쌓인다. 되돌리기 버퍼는 부르는 쪽이 따로 넣는다(`rememberRemoved`).
 */
export function hideLines(lineIds: readonly string[]): void {
  const gone = new Set(lineIds);
  const drafts = { ...state.drafts };
  const issues = { ...state.issues };
  const deselected = new Set(state.deselected);
  for (const id of gone) {
    delete drafts[id];
    delete issues[id];
    deselected.delete(id);
  }

  commit({
    ...state,
    deselected,
    drafts,
    issues,
    hidden: new Set([...state.hidden, ...gone]),
    lastRemoved: null,
  });
}

/** `선택 삭제`가 뺀 것을 되돌릴 수 있게 기억한다. `hideLines` 다음에 부른다 */
export function rememberRemoved(removed: readonly RemovedLine[]): void {
  commit({ ...state, lastRemoved: removed.length > 0 ? removed : null });
}

/** 되돌렸거나, 되돌릴 기회가 지났다 */
export function clearRemoved(): void {
  if (state.lastRemoved === null) return;
  commit({ ...state, lastRemoved: null });
}

/**
 * 서버 목록에 더는 없는 줄의 흔적을 지운다. `hidden`은 refresh가 닿았다는 뜻이고,
 * 나머지는 다른 탭에서 뺐거나 주문으로 넘어간 줄이다.
 * 바뀔 게 없으면 commit하지 않는다 — 렌더마다 부르는 자리라 무한 재렌더가 된다.
 */
export function prune(liveIds: ReadonlySet<string>): void {
  const staleHidden = [...state.hidden].filter((id) => !liveIds.has(id));
  const staleDeselected = [...state.deselected].filter(
    (id) => !liveIds.has(id),
  );
  const staleDrafts = Object.keys(state.drafts).filter(
    (id) => !liveIds.has(id),
  );
  const staleIssues = Object.keys(state.issues).filter(
    (id) => !liveIds.has(id),
  );

  if (
    staleHidden.length === 0 &&
    staleDeselected.length === 0 &&
    staleDrafts.length === 0 &&
    staleIssues.length === 0
  ) {
    return;
  }

  const hidden = new Set(state.hidden);
  const deselected = new Set(state.deselected);
  const drafts = { ...state.drafts };
  const issues = { ...state.issues };
  for (const id of staleHidden) hidden.delete(id);
  for (const id of staleDeselected) deselected.delete(id);
  for (const id of staleDrafts) delete drafts[id];
  for (const id of staleIssues) delete issues[id];

  commit({ ...state, hidden, deselected, drafts, issues });
}

/** 화면이 읽는 UI 상태 전부 */
export function useCartUi(): CartUiState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 이번에 **안** 살 것으로 뺀 조합. 주문서 조립부(`app/(shop)/checkout`)가
 * 서버에서 받은 목록에서 이걸 빼고 넘긴다 — 선택을 푼 조합은 주문서에 없다(RT-32).
 */
export function useCartDeselected(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .deselected;
}
